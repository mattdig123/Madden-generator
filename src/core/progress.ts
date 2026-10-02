import type { Picks, PickNote, Progress, RosterEntry } from "./types";

export const emptyProgress = (): Progress => ({ currentRound: 1, picks: {} });

/** Key for a player's pick in a 1-based round. */
export const pickKey = (name: string, round: number) => `${name}|${round}`;

export function getPick(progress: Progress, name: string, round: number): PickNote {
  return progress.picks[pickKey(name, round)] ?? {};
}

/** A pick is made once a player name has been entered. */
export const isPicked = (pick: PickNote): boolean => (pick.note ?? "").trim() !== "";

/** Positions a player still has to fill, in roster order. */
export function remainingSlots(
  picks: Picks,
  name: string,
  progress: Progress,
  roster: RosterEntry[],
): { label: string; left: number }[] {
  const left = new Map<string, number>();
  picks.forEach((p, i) => {
    if (!isPicked(getPick(progress, name, i + 1))) left.set(p.label, (left.get(p.label) ?? 0) + 1);
  });
  return roster.filter(r => left.has(r.label)).map(r => ({ label: r.label, left: left.get(r.label)! }));
}

