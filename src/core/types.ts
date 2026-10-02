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
  /** Team id per player name. Missing in drafts saved before teams existed. */
  teams?: Record<string, string>;
  /** Per-player re-roll counter, keyed by name. Missing means 0. */
  rerolls: Record<string, number>;
  rules: Rule[];
  roster: RosterEntry[];
}

/** One pick per round. */
export type Picks = RosterEntry[];

export interface PickNote {
  /** The player taken, if anyone typed it in. */
  note?: string;
  /** Marked as made. A pick counts once it is marked or has a name; the name itself is optional. */
  done?: boolean;
}

/** Live-board progress. Keyed by `${playerName}|${roundIndex}`. */
export interface Progress {
  currentRound: number;
  /** Move to the next round once every player has entered a pick. Treated as on when missing. */
  autoAdvance?: boolean;
  picks: Record<string, PickNote>;
}

