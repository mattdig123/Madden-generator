import { useCallback, useEffect, useRef, useState } from "react";
import { generateDraft, validateConfig } from "../core/generate";
import { uid } from "../core/id";
import { parseNames } from "../core/names";
import { emptyProgress } from "../core/progress";
import { newSeed } from "../core/rng";
import type { DraftConfig, PickNote, Progress, SavedDraft } from "../core/types";
import { defaultSetup, loadStore, sanitizeDraft, saveStore, type Setup, type Store, type Working } from "./storage";

const toSaved = ({ inHistory: _ignored, ...draft }: Working): SavedDraft => draft;

/** Keeps the history copy in step with the working draft. */
function withWorking(store: Store, working: Working | null): Store {
  if (!working || !working.inHistory) return { ...store, working };
  const saved = toSaved(working);
  const exists = store.saved.some(d => d.id === saved.id);
  return {
    ...store,
    working,
    saved: exists ? store.saved.map(d => (d.id === saved.id ? saved : d)) : [saved, ...store.saved],
  };
}

const fmtTitle = (names: string[]) => {
  const stamp = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${stamp} · ${names.length} players`;
};

export function useDrafts() {
  const initial = useRef(loadStore());
  const [store, setStore] = useState<Store>(initial.current.store);
  const [storageOk, setStorageOk] = useState(initial.current.ok);

  useEffect(() => {
    if (!saveStore(store)) setStorageOk(false);
  }, [store]);

  const setSetup = useCallback((patch: Partial<Setup>) => {
    setStore(s => ({ ...s, setup: { ...s.setup, ...patch } }));
  }, []);

  const resetSetup = useCallback(() => setStore(s => ({ ...s, setup: defaultSetup() })), []);

  const startDraft = useCallback((config: DraftConfig, title: string): Working => {
    return { id: uid(), title, createdAt: Date.now(), config, progress: emptyProgress(), inHistory: false };
  }, []);

  /** Returns an error message, or null on success. */
  const generate = useCallback((): string | null => {
    const { setup } = store;
    const parsed = parseNames(setup.namesText, setup.count);
    if (parsed.error || !parsed.names) return parsed.error ?? "Could not read player names.";
    const config: DraftConfig = {
      seed: setup.seed.trim() || newSeed(),
      names: parsed.names,
      rerolls: {},
      rules: setup.rules,
      roster: setup.roster,
    };
    const error = validateConfig(config);
    if (error) return error;
    try { generateDraft(config); } catch (e) { return (e as Error).message; }
    setStore(s => withWorking(s, startDraft(config, fmtTitle(config.names))));
    return null;
  }, [store, startDraft]);

  const openShared = useCallback((config: DraftConfig): string | null => {
    const error = validateConfig(config);
    if (error) return error;
    setStore(s => withWorking(s, startDraft(config, "Shared draft")));
    return null;
  }, [startDraft]);

  const updateWorking = useCallback((fn: (w: Working) => Working) => {
    setStore(s => (s.working ? withWorking(s, fn(s.working)) : s));
  }, []);

  const rerollPlayer = useCallback((name: string) => {
    updateWorking(w => ({
      ...w,
      config: { ...w.config, rerolls: { ...w.config.rerolls, [name]: (w.config.rerolls[name] ?? 0) + 1 } },
    }));
  }, [updateWorking]);

  /** New seed for everyone. Live-board progress is cleared since the picks changed. */
  const rerollAll = useCallback(() => {
    updateWorking(w => ({ ...w, config: { ...w.config, seed: newSeed(), rerolls: {} }, progress: emptyProgress() }));
  }, [updateWorking]);

  const setTitle = useCallback((title: string) => updateWorking(w => ({ ...w, title })), [updateWorking]);

  const setProgress = useCallback((fn: (p: Progress) => Progress) => {
    updateWorking(w => ({ ...w, progress: fn(w.progress) }));
  }, [updateWorking]);

  const setPick = useCallback((key: string, note: PickNote) => {
    setProgress(p => ({ ...p, picks: { ...p.picks, [key]: note } }));
  }, [setProgress]);

  const saveToHistory = useCallback(() => {
    updateWorking(w => ({ ...w, inHistory: true }));
  }, [updateWorking]);

  const openSaved = useCallback((id: string) => {
    setStore(s => {
      const d = s.saved.find(x => x.id === id);
      return d ? { ...s, working: { ...d, inHistory: true } } : s;
    });
  }, []);

  const duplicateSaved = useCallback((id: string) => {
    setStore(s => {
      const d = s.saved.find(x => x.id === id);
      if (!d) return s;
      const copy: SavedDraft = { ...d, id: uid(), title: `${d.title} (copy)`, createdAt: Date.now(), progress: emptyProgress() };
      return { ...s, saved: [copy, ...s.saved] };
    });
  }, []);

  const deleteSaved = useCallback((id: string) => {
    setStore(s => ({
      ...s,
      saved: s.saved.filter(d => d.id !== id),
      working: s.working?.id === id ? { ...s.working, inHistory: false } : s.working,
    }));
  }, []);

  /** Returns how many drafts were imported, or an error. */
  const importDrafts = useCallback((text: string): { count?: number; error?: string } => {
    let data: { saved?: unknown };
    try { data = JSON.parse(text); } catch { return { error: "That file isn't valid JSON." }; }
    if (!Array.isArray(data.saved)) return { error: "No drafts found in that file." };
    const drafts = data.saved
      .map((d: Partial<SavedDraft>) => sanitizeDraft(d))
      .filter((d): d is SavedDraft => d !== null && validateConfig(d.config) === null);
    if (drafts.length === 0) return { error: "No valid drafts found in that file." };
    setStore(s => {
      const have = new Set(s.saved.map(d => d.id));
      const fresh = drafts.map(d => (have.has(d.id) ? { ...d, id: uid() } : d));
      return { ...s, saved: [...fresh, ...s.saved] };
    });
    return { count: drafts.length };
  }, []);

  return {
    store, storageOk, setSetup, resetSetup, generate, openShared, rerollPlayer, rerollAll,
    setTitle, setProgress, setPick, saveToHistory, openSaved, duplicateSaved, deleteSaved, importDrafts,
  };
}

export type Drafts = ReturnType<typeof useDrafts>;
