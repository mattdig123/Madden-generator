import { pickKey } from "../core/progress";
import type { Progress } from "../core/types";
import type { DraftRow, PickRow } from "./types";

/** The draft the league is working on: the live one, else a preview, else the most recent finished one. */
export function pickCurrent(drafts: DraftRow[]): DraftRow | undefined {
  return (
    drafts.find(d => d.status === "live") ??
    drafts.find(d => d.status === "preview") ??
    drafts.find(d => d.status === "complete")
  );
}

/** Turns database rows into the Progress shape the board and tally helpers already understand. */
export function toProgress(draft: DraftRow | undefined, picks: PickRow[]): Progress {
  const out: Progress = { currentRound: draft?.current_round ?? 1, autoAdvance: draft?.auto_advance, picks: {} };
  // every stored row is a made pick; its name may be empty
  for (const p of picks) out.picks[pickKey(p.player, p.round)] = { note: p.player_taken || undefined, done: true };
  return out;
}
