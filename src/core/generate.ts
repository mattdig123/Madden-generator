import { makeRng, randInt, shuffle, type Rng } from "./rng";
import { TEAM_BY_ID, teamLabel, type Team } from "./teams";
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
  team?: Team;
  picks: Picks;
}

/**
 * Returns an error message for the first problem in the config, or null.
 * With `requireTeams`, every player must have one. Without it, drafts that predate teams are
 * still accepted, but any teams present must be real and unique.
 */
export function validateConfig(config: DraftConfig, opts: { requireTeams?: boolean } = {}): string | null {
  const { names, roster, rules } = config;
  if (names.length < 2) return "Need at least 2 players.";
  if (names.length > MAX_PLAYERS) return `Max ${MAX_PLAYERS} players.`;
  const seen = new Set<string>();
  for (const n of names) {
    const key = n.toLowerCase();
    if (seen.has(key)) return `Duplicate name: "${n}".`;
    seen.add(key);
  }
  return checkTeams(config, !!opts.requireTeams) ?? validateRoster(roster) ?? checkRules(rules, roster);
}

function checkTeams(config: DraftConfig, require: boolean): string | null {
  const taken = new Map<string, string>();
  for (const name of config.names) {
    const id = config.teams?.[name];
    if (!id) {
      if (require) return `Pick a team for ${name}.`;
      continue;
    }
    const team = TEAM_BY_ID[id];
    if (!team) return `Unknown team for ${name}.`;
    const other = taken.get(id);
    if (other) return `${teamLabel(team)} is picked by both ${other} and ${name}. Each team can only be used once.`;
    taken.set(id, name);
  }
  return null;
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
    const teamId = config.teams?.[name];
    return { name, team: teamId ? TEAM_BY_ID[teamId] : undefined, picks };
  });
}
