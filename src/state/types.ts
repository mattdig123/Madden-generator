import type { DraftConfig, RosterEntry, Rule } from "../core/types";

export interface LeagueRow {
  name: string;
  /** null means "use the app defaults" */
  rules: Rule[] | null;
  roster: RosterEntry[] | null;
}

export interface MemberRow {
  id: string;
  name: string;
  team: string;
  joined_at: string;
}

export type DraftStatus = "preview" | "live" | "complete";

export interface DraftRow {
  id: string;
  title: string;
  status: DraftStatus;
  config: DraftConfig;
  current_round: number;
  auto_advance: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface PickRow {
  draft_id: string;
  player: string;
  round: number;
  player_taken: string;
}

export interface LeagueData {
  league: LeagueRow | null;
  members: MemberRow[];
  drafts: DraftRow[];
}

/** Everything the app needs from a backend. Supabase in production, an in-browser Postgres in dev demo mode. */
export interface Api {
  loadLeague(): Promise<LeagueData>;
  loadPicks(draftId: string): Promise<PickRow[]>;
  /** Calls a database function with named arguments. Throws an Error carrying the database's message. */
  rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
  /** Calls `onChange` whenever shared data may have changed. Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
}
