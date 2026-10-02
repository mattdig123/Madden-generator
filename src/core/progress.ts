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

/** True when every player has entered a pick for the 1-based `round`. */
export function isRoundComplete(names: string[], progress: Progress, round: number): boolean {
  return names.every(name => isPicked(getPick(progress, name, round)));
}

/**
 * Stores the player taken and, when that entry completes the round on the clock, moves to the
 * next round. Only a pick going from empty to filled can advance, so correcting a name, clearing
 * one, or editing another round never moves the pointer.
 */
export function applyPick(
  progress: Progress,
  names: string[],
  rounds: number,
  name: string,
  round: number,
  note: string,
): Progress {
  const wasPicked = isPicked(getPick(progress, name, round));
  const next: Progress = { ...progress, picks: { ...progress.picks, [pickKey(name, round)]: { note } } };
  const auto = progress.autoAdvance !== false;
  if (
    auto && !wasPicked && isPicked({ note }) && round === progress.currentRound &&
    progress.currentRound < rounds && isRoundComplete(names, next, round)
  ) {
    next.currentRound = round + 1;
  }
  return next;
}
