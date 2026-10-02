export type Group = "qb" | "skill" | "ol" | "front" | "db" | "k" | "flex";

export const GROUPS: Group[] = ["qb", "skill", "ol", "front", "db", "k", "flex"];

export interface RosterEntry {
  label: string;
  count: number;
  group: Group;
}

/** Applies to every slot whose label matches. Rounds are 1-based and inclusive. */
export interface Rule {
  id: string;
  label: string;
  minRound?: number;
  maxRound?: number;
}

export interface DraftConfig {
  seed: string;
  names: string[];
  /** Per-player re-roll counter, keyed by name. Missing means 0. */
  rerolls: Record<string, number>;
  rules: Rule[];
  roster: RosterEntry[];
}

/** One pick per round. */
export type Picks = RosterEntry[];

export interface PickNote {
  done: boolean;
  note?: string;
}

/** Live-board progress. Keyed by `${playerName}|${roundIndex}`. */
export interface Progress {
  currentRound: number;
  picks: Record<string, PickNote>;
}

export interface SavedDraft {
  id: string;
  title: string;
  createdAt: number;
  config: DraftConfig;
  progress: Progress;
}
