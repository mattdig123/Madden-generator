import { DEFAULT_ROSTER, DEFAULT_RULES } from "../core/roster";
import { emptyProgress } from "../core/progress";
import type { DraftConfig, Progress, RosterEntry, Rule, SavedDraft } from "../core/types";

const KEY = "madden-draft-generator";
const VERSION = 1;

export interface Setup {
  namesText: string;
  count: number;
  /** Blank means pick a random seed on Generate. */
  seed: string;
  rules: Rule[];
  roster: RosterEntry[];
}

/** The draft currently on screen. When `inHistory` it is mirrored into `saved`. */
export interface Working extends SavedDraft {
  inHistory: boolean;
}

export interface Store {
  setup: Setup;
  working: Working | null;
  saved: SavedDraft[];
}

export const defaultSetup = (): Setup => ({
  namesText: "",
  count: 4,
  seed: "",
  rules: DEFAULT_RULES.map(r => ({ ...r })),
  roster: DEFAULT_ROSTER.map(r => ({ ...r })),
});

export const defaultStore = (): Store => ({ setup: defaultSetup(), working: null, saved: [] });

/** Fills in anything missing so a half-valid saved blob can't crash the app. */
function sanitizeProgress(p: Partial<Progress> | undefined): Progress {
  const base = emptyProgress();
  if (!p || typeof p !== "object") return base;
  return {
    currentRound: Number.isInteger(p.currentRound) && p.currentRound! >= 1 ? p.currentRound! : 1,
    autoAdvance: p.autoAdvance === false ? false : undefined,
    picks: p.picks && typeof p.picks === "object" ? p.picks : {},
  };
}

export function sanitizeDraft(d: Partial<SavedDraft>): SavedDraft | null {
  const c = d.config as Partial<DraftConfig> | undefined;
  if (!d.id || !c || !Array.isArray(c.names) || !Array.isArray(c.roster) || !Array.isArray(c.rules) || typeof c.seed !== "string") {
    return null;
  }
  return {
    id: String(d.id),
    title: typeof d.title === "string" ? d.title : "Untitled draft",
    createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
    config: { seed: c.seed, names: c.names, roster: c.roster, rules: c.rules, rerolls: c.rerolls ?? {} },
    progress: sanitizeProgress(d.progress),
  };
}

export interface LoadResult {
  store: Store;
  ok: boolean;
}

export function loadStore(): LoadResult {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { store: defaultStore(), ok: true };
    const data = JSON.parse(raw);
    if (data.v !== VERSION) return { store: defaultStore(), ok: true };
    const def = defaultSetup();
    const s = data.setup ?? {};
    const setup: Setup = {
      namesText: typeof s.namesText === "string" ? s.namesText : def.namesText,
      count: Number.isInteger(s.count) ? s.count : def.count,
      seed: typeof s.seed === "string" ? s.seed : "",
      rules: Array.isArray(s.rules) ? s.rules : def.rules,
      roster: Array.isArray(s.roster) ? s.roster : def.roster,
    };
    const saved = (Array.isArray(data.saved) ? data.saved : [])
      .map(sanitizeDraft)
      .filter((d: SavedDraft | null): d is SavedDraft => d !== null);
    const w = data.working ? sanitizeDraft(data.working) : null;
    const working = w ? { ...w, inHistory: !!data.working.inHistory } : null;
    return { store: { setup, working, saved }, ok: true };
  } catch {
    return { store: defaultStore(), ok: false };
  }
}

/** Returns false if the browser refused the write (private window, quota, blocked storage). */
export function saveStore(store: Store): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...store }));
    return true;
  } catch {
    return false;
  }
}
