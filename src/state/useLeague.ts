import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_ROSTER, DEFAULT_RULES } from "../core/roster";
import { newSeed } from "../core/rng";
import type { RosterEntry, Rule } from "../core/types";
import { pickCurrent } from "./derive";
import { loadAdmin, loadIdentity, saveAdmin, saveIdentity, type Identity } from "./local";
import type { Api, LeagueData, PickRow } from "./types";

const POLL_MS = 10_000;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useLeague(api: Api) {
  const [data, setData] = useState<LeagueData | null>(null);
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
  const [adminPass, setAdminPass] = useState<string | null>(loadAdmin);
  const [adminOk, setAdminOk] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const viewedRef = useRef(viewedId);
  viewedRef.current = viewedId;
  const seq = useRef(0);
  // Ordering of "identity was set" vs "league data was loaded", so a fresh sign-in is never judged
  // against a member list that was fetched before it happened.
  const clock = useRef(0);
  const identityAt = useRef(0);
  const loadedAt = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const d = await api.loadLeague();
      const target = d.drafts.find(x => x.id === viewedRef.current) ?? pickCurrent(d.drafts);
      const p = target ? await api.loadPicks(target.id) : [];
      if (mine !== seq.current) return; // a newer refresh or local edit superseded this one
      loadedAt.current = ++clock.current;
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

  // Confirm a remembered commissioner passcode is still valid.
  useEffect(() => {
    if (!adminPass) { setAdminOk(false); return; }
    let cancelled = false;
    api.rpc<boolean>("admin_login", { p_passcode: adminPass })
      .then(ok => {
        if (cancelled) return;
        setAdminOk(ok);
        if (!ok) { saveAdmin(null); setAdminPass(null); }
      })
      .catch(() => { /* offline: keep the passcode and try again next load */ });
    return () => { cancelled = true; };
  }, [api, adminPass]);

  const drafts = data?.drafts ?? [];
  const members = data?.members ?? [];
  const current = useMemo(() => pickCurrent(drafts), [drafts]);
  const draft = drafts.find(d => d.id === viewedId) ?? current;
  const me = identity ? members.find(m => m.id === identity.memberId) : undefined;

  // A remembered identity whose member no longer exists (removed, or the league was reset).
  useEffect(() => {
    if (!data || !identity || loadedAt.current < identityAt.current) return;
    if (!data.members.some(m => m.id === identity.memberId)) {
      saveIdentity(null);
      setIdentity(null);
    }
  }, [data, identity]);

  const signIn = useCallback((id: Identity) => {
    identityAt.current = ++clock.current;
    saveIdentity(id);
    setIdentity(id);
  }, []);

  const rules: Rule[] = data?.league?.rules ?? DEFAULT_RULES;
  const roster: RosterEntry[] = data?.league?.roster ?? DEFAULT_ROSTER;
  const isAdmin = adminOk && adminPass !== null;

  /**
   * Runs an action, refreshes, and returns an error message (or null on success). Failures are also
   * kept in `actionError` so they show up even when the caller ignores the result (like a pick box).
   */
  const act = useCallback(async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      await refresh();
      return null;
    } catch (e) {
      await refresh();
      setActionError(message(e));
      return message(e);
    }
  }, [refresh]);

  const optimisticPick = useCallback((draftId: string, player: string, round: number, text: string) => {
    seq.current++; // discard any refresh already in flight; it predates this edit
    const clean = text.trim();
    setPicks(prev => {
      const rest = prev.filter(p => !(p.draft_id === draftId && p.player === player && p.round === round));
      return clean ? [...rest, { draft_id: draftId, player, round, player_taken: clean }] : rest;
    });
  }, []);

  const claim = useCallback((memberId: string, token: string) => signIn({ memberId, token }), [signIn]);

  const admin = useCallback(
    (fn: string, args: Record<string, unknown>) => api.rpc(fn, { p_passcode: adminPass, ...args }),
    [api, adminPass],
  );

  return {
    data, picks, loadError, actionError, dismissError: () => setActionError(null), drafts, members, current, draft, me, identity, isAdmin,
    league: data?.league ?? null, rules, roster,
    viewedId, viewDraft: setViewedId,

    // --- members ---
    join: (invite: string, name: string, team: string) => act(async () => {
      const r = await api.rpc<{ member_id: string; token: string }>("join_league", { p_invite: invite, p_name: name, p_team: team });
      signIn({ memberId: r.member_id, token: r.token });
    }),
    claim,
    forgetIdentity: () => { saveIdentity(null); setIdentity(null); },
    submitPick: (round: number, text: string) => {
      if (!draft || !identity || !me) return Promise.resolve("You are not signed in as a member");
      optimisticPick(draft.id, me.name, round, text);
      return act(() => api.rpc("submit_pick", {
        p_draft: draft.id, p_member: identity.memberId, p_token: identity.token, p_round: round, p_text: text,
      }));
    },

    // --- commissioner ---
    adminLogin: async (passcode: string): Promise<string | null> => {
      try {
        const ok = await api.rpc<boolean>("admin_login", { p_passcode: passcode });
        if (!ok) return "That passcode is not right";
        saveAdmin(passcode);
        setAdminPass(passcode);
        setAdminOk(true);
        return null;
      } catch (e) { return message(e); }
    },
    adminLogout: () => { saveAdmin(null); setAdminPass(null); setAdminOk(false); },
    getInvite: () => admin("admin_get_invite", {}) as Promise<string>,
    saveSettings: (name: string, rules: Rule[], roster: RosterEntry[]) =>
      act(() => admin("admin_save_settings", { p_name: name, p_rules: rules, p_roster: roster })),
    removeMember: (id: string) => act(() => admin("admin_remove_member", { p_member: id })),
    issueClaim: (id: string) => admin("admin_issue_claim_token", { p_member: id }) as Promise<string>,
    createPreview: (title: string, seed: string) => act(async () => {
      await admin("admin_create_preview", { p_title: title, p_seed: seed.trim() || newSeed(), p_rules: rules, p_roster: roster });
      setViewedId(null);
    }),
    rerollAll: (draftId: string) => act(() => admin("admin_reroll", { p_draft: draftId, p_seed: newSeed(), p_player: null })),
    rerollPlayer: (draftId: string, player: string) => act(() => admin("admin_reroll", { p_draft: draftId, p_seed: null, p_player: player })),
    startDraft: (draftId: string) => act(() => admin("admin_start_draft", { p_draft: draftId })),
    finishDraft: (draftId: string) => act(() => admin("admin_finish_draft", { p_draft: draftId })),
    deleteDraft: (draftId: string) => act(async () => {
      await admin("admin_delete_draft", { p_draft: draftId });
      if (viewedRef.current === draftId) setViewedId(null);
    }),
    setRound: (draftId: string, round: number) => act(() => admin("admin_set_round", { p_draft: draftId, p_round: round })),
    setAutoAdvance: (draftId: string, on: boolean) => act(() => admin("admin_set_auto_advance", { p_draft: draftId, p_on: on })),
    adminSetPick: (draftId: string, player: string, round: number, text: string) => {
      optimisticPick(draftId, player, round, text);
      return act(() => admin("admin_set_pick", { p_draft: draftId, p_player: player, p_round: round, p_text: text }));
    },
  };
}

export type League = ReturnType<typeof useLeague>;
