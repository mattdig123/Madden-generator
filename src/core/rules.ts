import { expandSlots } from "./roster";
import type { Picks, RosterEntry, Rule } from "./types";

export const MAX_PLAYERS = 32;

export interface Window {
  lo: number;
  hi: number;
}

export function totalRounds(roster: RosterEntry[]): number {
  return roster.reduce((n, r) => n + r.count, 0);
}

/** Allowed round window (1-based, inclusive) for every slot with `label`. */
export function windowFor(label: string, rules: Rule[], rounds: number): Window {
  let lo = 1;
  let hi = rounds;
  for (const rule of rules) {
    if (rule.label !== label) continue;
    if (rule.minRound !== undefined) lo = Math.max(lo, rule.minRound);
    if (rule.maxRound !== undefined) hi = Math.min(hi, rule.maxRound);
  }
  return { lo, hi };
}

export function isConstrained(w: Window, rounds: number): boolean {
  return w.lo > 1 || w.hi < rounds;
}

/**
 * Can every window get its own distinct round out of `freeRounds`?
 * Earliest-deadline-first over the rounds in ascending order.
 */
export function canAssign(windows: Window[], freeRounds: number[]): boolean {
  const rounds = freeRounds.slice().sort((a, b) => a - b);
  const pending = windows.slice();
  for (const r of rounds) {
    if (pending.some(w => w.hi < r)) return false;
    let best = -1;
    for (let i = 0; i < pending.length; i++) {
      if (pending[i].lo <= r && (best < 0 || pending[i].hi < pending[best].hi)) best = i;
    }
    if (best >= 0) pending.splice(best, 1);
  }
  return pending.length === 0;
}

export function validateRoster(roster: RosterEntry[]): string | null {
  if (roster.length === 0) return "Roster needs at least one position.";
  const seen = new Set<string>();
  for (const r of roster) {
    const label = r.label.trim();
    if (!label) return "Every roster position needs a name.";
    if (seen.has(label.toLowerCase())) return `Duplicate roster position: "${label}".`;
    seen.add(label.toLowerCase());
    if (!Number.isInteger(r.count) || r.count < 1) return `"${label}" needs a count of at least 1.`;
  }
  return null;
}

/** Returns an error message, or null if the rules can all be satisfied. */
export function checkRules(rules: Rule[], roster: RosterEntry[]): string | null {
  const rounds = totalRounds(roster);
  const labels = new Set(roster.map(r => r.label));
  for (const rule of rules) {
    if (!labels.has(rule.label)) return `Rule refers to "${rule.label}", which is not in the roster.`;
    const w = windowFor(rule.label, rules, rounds);
    if (rule.minRound !== undefined && (!Number.isInteger(rule.minRound) || rule.minRound < 1)) {
      return `${rule.label}: earliest round must be 1 or higher.`;
    }
    if (rule.maxRound !== undefined && (!Number.isInteger(rule.maxRound) || rule.maxRound < 1)) {
      return `${rule.label}: latest round must be 1 or higher.`;
    }
    if (w.lo > w.hi) return `${rule.label}: earliest round ${w.lo} is after latest round ${w.hi}.`;
    if (w.lo > rounds) return `${rule.label}: round ${w.lo} is past the last round (${rounds}).`;
  }
  const windows = expandSlots(roster)
    .map(s => windowFor(s.label, rules, rounds))
    .filter(w => isConstrained(w, rounds));
  const all = Array.from({ length: rounds }, (_, i) => i + 1);
  if (!canAssign(windows, all)) return "These rules can't all be satisfied: too many positions are squeezed into the same rounds.";
  return null;
}

/** Checks a generated pick list against the roster and rules. */
export function validatePicks(picks: Picks, roster: RosterEntry[], rules: Rule[]): boolean {
  const rounds = totalRounds(roster);
  if (picks.length !== rounds) return false;
  const tally = new Map<string, number>();
  for (const p of picks) tally.set(p.label, (tally.get(p.label) ?? 0) + 1);
  if (!roster.every(r => tally.get(r.label) === r.count)) return false;
  return picks.every((p, i) => {
    const w = windowFor(p.label, rules, rounds);
    return i + 1 >= w.lo && i + 1 <= w.hi;
  });
}
