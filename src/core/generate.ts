import { makeRng, randInt, shuffle, type Rng } from "./rng";
import { expandSlots } from "./roster";
import {
  canAssign,
  checkRules,
  isConstrained,
  MAX_PLAYERS,
  totalRounds,
  validatePicks,
  validateRoster,
  windowFor,
} from "./rules";
import type { DraftConfig, Picks, RosterEntry, Rule } from "./types";

export interface PlayerDraft {
  name: string;
  picks: Picks;
}

/** Returns an error message for the first problem in the config, or null. */
export function validateConfig(config: DraftConfig): string | null {
  const { names, roster, rules } = config;
  if (names.length < 2) return "Need at least 2 players.";
  if (names.length > MAX_PLAYERS) return `Max ${MAX_PLAYERS} players.`;
  const seen = new Set<string>();
  for (const n of names) {
    const key = n.toLowerCase();
    if (seen.has(key)) return `Duplicate name: "${n}".`;
    seen.add(key);
  }
  return validateRoster(roster) ?? checkRules(rules, roster);
}

/**
 * Builds one player's pick order. Rule-bound slots are placed first (tightest
 * window first) into a random round that keeps the rest satisfiable, then the
 * unconstrained slots are shuffled into whatever rounds are left.
 */
export function generatePicks(roster: RosterEntry[], rules: Rule[], rng: Rng): Picks {
  const rounds = totalRounds(roster);
  const slots = expandSlots(roster).map(entry => ({
    entry,
    w: windowFor(entry.label, rules, rounds),
  }));
  const constrained = slots
    .filter(s => isConstrained(s.w, rounds))
    .sort((a, b) => a.w.hi - a.w.lo - (b.w.hi - b.w.lo));
  const free = new Set(Array.from({ length: rounds }, (_, i) => i + 1));
  const out: (RosterEntry | undefined)[] = new Array(rounds).fill(undefined);

  constrained.forEach((slot, i) => {
    const rest = constrained.slice(i + 1).map(s => s.w);
    const options = [...free].filter(r => {
      if (r < slot.w.lo || r > slot.w.hi) return false;
      const after = [...free].filter(x => x !== r);
      return canAssign(rest, after);
    });
    if (options.length === 0) throw new Error(`Could not place ${slot.entry.label} within its rules.`);
    const round = options[randInt(rng, options.length)];
    out[round - 1] = slot.entry;
    free.delete(round);
  });

  const rest = shuffle(rng, slots.filter(s => !isConstrained(s.w, rounds)).map(s => s.entry));
  const openRounds = [...free].sort((a, b) => a - b);
  openRounds.forEach((r, i) => { out[r - 1] = rest[i]; });
  return out as Picks;
}

export function playerSeed(config: DraftConfig, name: string): string {
  return `${config.seed}|${name}|${config.rerolls[name] ?? 0}`;
}

export function generateDraft(config: DraftConfig): PlayerDraft[] {
  const error = validateConfig(config);
  if (error) throw new Error(error);
  return config.names.map(name => {
    const picks = generatePicks(config.roster, config.rules, makeRng(playerSeed(config, name)));
    if (!validatePicks(picks, config.roster, config.rules)) {
      throw new Error(`Roll for ${name} did not match the roster and rules.`);
    }
    return { name, picks };
  });
}
