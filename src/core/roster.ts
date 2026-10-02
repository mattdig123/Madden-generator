import type { Group, Rule, RosterEntry } from "./types";

export const DEFAULT_ROSTER: RosterEntry[] = [
  { label: "QB", count: 1, group: "qb" },
  { label: "RB", count: 2, group: "skill" },
  { label: "FB/RB", count: 1, group: "skill" },
  { label: "WR", count: 3, group: "skill" },
  { label: "TE", count: 2, group: "skill" },
  { label: "OT", count: 2, group: "ol" },
  { label: "iOL", count: 3, group: "ol" },
  { label: "Any OL", count: 1, group: "flex" },
  { label: "DE", count: 2, group: "front" },
  { label: "DT", count: 2, group: "front" },
  { label: "LB", count: 4, group: "front" },
  { label: "Any Front 7", count: 1, group: "flex" },
  { label: "CB", count: 3, group: "db" },
  { label: "S", count: 2, group: "db" },
  { label: "Any DB", count: 1, group: "flex" },
  { label: "K", count: 1, group: "k" },
];

export const DEFAULT_RULES: Rule[] = [{ id: "qb-by-10", label: "QB", maxRound: 10 }];

/** Flat list with one entry per slot (so `count: 3` becomes three entries). */
export function expandSlots(roster: RosterEntry[]): RosterEntry[] {
  return roster.flatMap(r => Array.from({ length: r.count }, () => r));
}

export const GROUP_NAMES: Record<Group, string> = {
  qb: "QB", skill: "Skill", ol: "Offensive line", front: "Front 7", db: "Secondary", k: "Kicker", flex: "Flex (Any)",
};
