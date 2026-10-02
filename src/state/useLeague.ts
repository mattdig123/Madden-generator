import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_ROSTER, DEFAULT_RULES } from "../core/roster";
import { newSeed } from "../core/rng";
import type { RosterEntry, Rule } from "../core/types";
import { pickCurrent } from "./derive";
import { loadKey, loadMe, saveKey, saveMe } from "./local";
import type { Api, LeagueData, PickRow } from "./types";

const POLL_MS = 10_000;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useLeague(api: Api) {
  const [data, setData] = useState<LeagueData | null>(null);
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(loadKey);
  const [keyOk, setKeyOk] = useState(false);
  const [keyProblem, setKeyProblem] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(loadMe);
  const [actionError, setActionError] = useState<string | null>(null);

  const viewedRef = useRef(viewedId);
  viewedRef.current = viewedId;
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const d = await api.loadLeague();
      const target = d.drafts.find(x => x.id === viewedRef.current) ?? pickCurrent(d.drafts);
      const p = target ? await api.loadPicks(target.id) : [];
      if (mine !== seq.current) return; // a newer refresh or local edit superseded this one
      setData(d);
      setPicks(p);
      setLoadError(null);
    } catch (e) {
      if (mine === seq.current) setLoadError(message(e));
    }
  }, [api]);

  // Load on start and whenever the viewed draft changes.
  useEffect(() => { void refresh(); }, [refresh, viewedId]);

  // Live updates, with a slow poll and a refresh on tab focus as a safety net.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 150); };
    const off = api.subscribe(soon);
    const poll = setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { off(); clearInterval(poll); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [api, refresh]);

  // Confirm the remembered key still works (it stops working if someone makes a new league link).
  useEffect(() => {
    if (!key) { setKeyOk(false); return; }
    let cancelled = false;
    api.rpc<boolean>("check_key", { p_key: key })
      .then(ok => {
        if (cancelled) return;
        setKeyOk(ok);
        if (!ok) {
          saveKey(null);
          setKey(null);
          setKeyProblem("The league link on this device is out of date, so it can only watch. Ask for the new link.");
        }
      })
      .catch(() => { /* offline: keep the key and try again next load */ });
    return () => { cancelled = true; };
  }, [api, key]);

  const drafts = data?.drafts ?? [];
  const players = data?.members ?? [];
  const current = useMemo(() => pickCurrent(drafts), [drafts]);
  const draft = drafts.find(d => d.id === viewedId) ?? current;
  const me = meId ? players.find(m => m.id === meId) : undefined;

  // "Me" points at a player that has since been removed.
  useEffect(() => {
    if (data && meId && !data.members.some(m => m.id === meId)) { saveMe(null); setMeId(null); }
  }, [data, meId]);

  const rules: Rule[] = data?.league?.rules ?? DEFAULT_RULES;
  const roster: RosterEntry[] = data?.league?.roster ?? DEFAULT_ROSTER;
  const canEdit = keyOk && key !== null;

  /**
   * Runs an action, refreshes, and returns an error message (or null on success). Pass `loud` for
   * actions whose caller ignores the result (like a pick box) so a failure still shows in the banner.
   */
  const act = useCallback(async (fn: () => Promise<unknown>, loud = false): Promise<string | null> => {
    try {
      await fn();
      await refresh();
      return null;
    } catch (e) {
      await refresh();
      if (loud) setActionError(message(e));
      return message(e);
    }
  }, [refresh]);

  /** Shows an edit straight away. `text` null means "marked made, no name"; "" removes the pick. */
  const optimisticPick = useCallback((draftId: string, player: string, round: number, text: string | null) => {
    seq.current++; // discard any refresh already in flight; it predates this edit
    setPicks(prev => {
      const mine = (p: PickRow) => p.draft_id === draftId && p.player === player && p.round === round;
      const rest = prev.filter(p => !mine(p));
      if (text === null) return [...rest, prev.find(mine) ?? { draft_id: draftId, player, round, player_taken: "" }];
      const clean = text.trim();
      return clean ? [...rest, { draft_id: draftId, player, round, player_taken: clean }] : rest;
    });
  }, []);

  const call = useCallback(
    (fn: string, args: Record<string, unknown>) => api.rpc(fn, { p_key: key, ...args }),
    [api, key],
  );

  return {
    data, picks, loadError, actionError, dismissError: () => setActionError(null),
    drafts, players, current, draft, me, canEdit, key, keyProblem, dismissKeyProblem: () => setKeyProblem(null),
    league: data?.league ?? null, rules, roster,
    viewedId, viewDraft: setViewedId,

    // --- this device ---
    /** Uses a league key from a link (or pasted in). Returns an error message, or null if it worked. */
    applyKey: async (candidate: string): Promise<string | null> => {
      try {
        const ok = await api.rpc<boolean>("check_key", { p_key: candidate.trim() });
        if (!ok) return "That league key isn't right.";
        saveKey(candidate.trim());
        setKey(candidate.trim());
        setKeyOk(true);
        setKeyProblem(null);
        return null;
      } catch (e) { return message(e); }
    },
    forgetKey: () => { saveKey(null); setKey(null); setKeyOk(false); },
    setMe: (id: string | null) => { saveMe(id); setMeId(id); },

    // --- players ---
    addPlayer: (name: string, team: string) => act(() => call("add_player", { p_name: name, p_team: team })),
    updatePlayer: (id: string, name: string, team: string) => act(() => call("update_player", { p_player: id, p_name: name, p_team: team })),
    removePlayer: (id: string) => act(() => call("remove_player", { p_player: id }), true),

    // --- settings and drafts ---
    rotateKey: (newKey: string) => act(async () => {
      await call("rotate_key", { p_new_key: newKey });
      saveKey(newKey);
      setKey(newKey);
    }),
    saveSettings: (name: string, nextRules: Rule[], nextRoster: RosterEntry[]) =>
      act(() => call("save_settings", { p_name: name, p_rules: nextRules, p_roster: nextRoster })),
    createPreview: (title: string, seed: string) => act(async () => {
      await call("create_preview", { p_title: title, p_seed: seed.trim() || newSeed(), p_rules: rules, p_roster: roster });
      setViewedId(null);
    }),
    rerollAll: (draftId: string) => act(() => call("reroll", { p_draft: draftId, p_seed: newSeed(), p_player: null })),
    rerollPlayer: (draftId: string, player: string) => act(() => call("reroll", { p_draft: draftId, p_seed: null, p_player: player })),
    startDraft: (draftId: string) => act(() => call("start_draft", { p_draft: draftId })),
    finishDraft: (draftId: string) => act(() => call("finish_draft", { p_draft: draftId })),
    deleteDraft: (draftId: string) => act(async () => {
      await call("delete_draft", { p_draft: draftId });
      if (viewedRef.current === draftId) setViewedId(null);
    }, true),
    setRound: (draftId: string, round: number) => act(() => call("set_round", { p_draft: draftId, p_round: round }), true),
    setAutoAdvance: (draftId: string, on: boolean) => act(() => call("set_auto_advance", { p_draft: draftId, p_on: on }), true),
    /** Marks a pick as made without a name (a name already there is kept), or takes the mark back. */
    markPick: (draftId: string, player: string, round: number, made: boolean) => {
      if (made) optimisticPick(draftId, player, round, null); else optimisticPick(draftId, player, round, "");
      return act(() => call("mark_pick", { p_draft: draftId, p_player: player, p_round: round, p_made: made }), true);
    },
    setPick: (draftId: string, player: string, round: number, text: string) => {
      optimisticPick(draftId, player, round, text);
      return act(() => call("set_pick", { p_draft: draftId, p_player: player, p_round: round, p_text: text }), true);
    },
  };
}

export type League = ReturnType<typeof useLeague>;
