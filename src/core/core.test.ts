import { describe, expect, it } from "vitest";
import { generateDraft, validateConfig } from "./generate";
import { DEFAULT_ROSTER, DEFAULT_RULES, expandSlots } from "./roster";
import { checkRules, totalRounds, validatePicks } from "./rules";
import { asText } from "./text";
import type { DraftConfig } from "./types";

const base = (over: Partial<DraftConfig> = {}): DraftConfig => ({
  seed: "abc",
  names: ["Matt", "Dave", "Chris", "Sam"],
  rerolls: {},
  rules: DEFAULT_RULES,
  roster: DEFAULT_ROSTER,
  ...over,
});

describe("roster", () => {
  it("has 31 slots", () => {
    expect(expandSlots(DEFAULT_ROSTER)).toHaveLength(31);
    expect(totalRounds(DEFAULT_ROSTER)).toBe(31);
  });
});

describe("generateDraft", () => {
  it("always puts the QB in rounds 1-10 with exact roster counts", () => {
    for (let i = 0; i < 1500; i++) {
      const players = generateDraft(base({ seed: `seed-${i}` }));
      for (const p of players) {
        const qb = p.picks.findIndex(x => x.label === "QB") + 1;
        expect(qb).toBeGreaterThanOrEqual(1);
        expect(qb).toBeLessThanOrEqual(10);
        expect(validatePicks(p.picks, DEFAULT_ROSTER, DEFAULT_RULES)).toBe(true);
      }
    }
  });

  it("spreads the QB across all of rounds 1-10", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const [p] = generateDraft(base({ seed: `s${i}` }));
      seen.add(p.picks.findIndex(x => x.label === "QB") + 1);
    }
    expect(seen.size).toBe(10);
  });

  it("is deterministic for a seed and differs across seeds", () => {
    const a = JSON.stringify(generateDraft(base()));
    expect(JSON.stringify(generateDraft(base()))).toBe(a);
    expect(JSON.stringify(generateDraft(base({ seed: "other" })))).not.toBe(a);
  });

  it("rerolling one player leaves the others unchanged", () => {
    const before = generateDraft(base());
    const after = generateDraft(base({ rerolls: { Dave: 1 } }));
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);
    expect(after[1].picks).not.toEqual(before[1].picks);
  });

  it("gives players different orders", () => {
    const [a, b] = generateDraft(base());
    expect(a.picks.map(x => x.label)).not.toEqual(b.picks.map(x => x.label));
  });

  it("honors several overlapping rules", () => {
    const rules = [
      { id: "1", label: "QB", maxRound: 3 },
      { id: "2", label: "K", minRound: 28 },
      { id: "3", label: "Any DB", minRound: 20, maxRound: 25 },
      { id: "4", label: "WR", maxRound: 8 },
    ];
    for (let i = 0; i < 300; i++) {
      for (const p of generateDraft(base({ seed: `m${i}`, rules }))) {
        expect(validatePicks(p.picks, DEFAULT_ROSTER, rules)).toBe(true);
      }
    }
  });
});

describe("rule checks", () => {
  it("accepts the default rules", () => {
    expect(checkRules(DEFAULT_RULES, DEFAULT_ROSTER)).toBeNull();
  });
  it("rejects infeasible rules", () => {
    const tooMany = [{ id: "1", label: "WR", maxRound: 2 }];
    expect(checkRules(tooMany, DEFAULT_ROSTER)).not.toBeNull();
    const inverted = [{ id: "1", label: "QB", minRound: 9, maxRound: 4 }];
    expect(checkRules(inverted, DEFAULT_ROSTER)).not.toBeNull();
    const pileUp = [
      { id: "1", label: "QB", maxRound: 1 },
      { id: "2", label: "K", maxRound: 1 },
    ];
    expect(checkRules(pileUp, DEFAULT_ROSTER)).not.toBeNull();
  });
  it("rejects rules for unknown positions", () => {
    expect(checkRules([{ id: "1", label: "XYZ", maxRound: 3 }], DEFAULT_ROSTER)).not.toBeNull();
  });
  it("validateConfig catches bad names", () => {
    expect(validateConfig(base({ names: ["A"] }))).not.toBeNull();
    expect(validateConfig(base({ names: ["A", "a"] }))).not.toBeNull();
    expect(validateConfig(base())).toBeNull();
  });
});

describe("asText", () => {
  it("prints a header and one row per round", () => {
    expect(asText(generateDraft(base())).split("\n")).toHaveLength(32);
  });
});

describe("progress", () => {
  it("tallies remaining slots and ignores finished picks", async () => {
    const { remainingSlots, pickKey, emptyProgress } = await import("./progress");
    const [p] = generateDraft(base());
    const progress = emptyProgress();
    expect(remainingSlots(p.picks, p.name, progress, DEFAULT_ROSTER).reduce((n, x) => n + x.left, 0)).toBe(31);
    progress.picks[pickKey(p.name, 1)] = { note: "Lamar Jackson" };
    const rest = remainingSlots(p.picks, p.name, progress, DEFAULT_ROSTER);
    expect(rest.reduce((n, x) => n + x.left, 0)).toBe(30);
  });
});


describe("teams", () => {
  it("has 32 teams with unique ids and abbreviations", async () => {
    const { TEAMS, DIVISIONS } = await import("./teams");
    expect(TEAMS).toHaveLength(32);
    expect(new Set(TEAMS.map(t => t.id)).size).toBe(32);
    expect(new Set(TEAMS.map(t => t.abbr)).size).toBe(32);
    expect(DIVISIONS).toHaveLength(8);
    expect(DIVISIONS.every(d => d.teams.length === 4)).toBe(true);
  });

  const withTeams = (teams: Record<string, string>) => base({ teams });

  it("requires a team for every player when asked", () => {
    const partial = withTeams({ Matt: "kc", Dave: "buf" });
    expect(validateConfig(partial, { requireTeams: true })).toMatch(/Pick a team for Chris/);
    const all = withTeams({ Matt: "kc", Dave: "buf", Chris: "sf", Sam: "dal" });
    expect(validateConfig(all, { requireTeams: true })).toBeNull();
  });

  it("rejects a team used twice and unknown teams", () => {
    const dup = withTeams({ Matt: "kc", Dave: "kc", Chris: "sf", Sam: "dal" });
    expect(validateConfig(dup, { requireTeams: true })).toMatch(/Kansas City Chiefs.*once/);
    expect(validateConfig(dup)).not.toBeNull();
    expect(validateConfig(withTeams({ Matt: "zzz" }))).toMatch(/Unknown team/);
  });

  it("still accepts drafts saved before teams existed", () => {
    expect(validateConfig(base())).toBeNull();
    expect(generateDraft(base())[0].team).toBeUndefined();
  });

  it("attaches the team to each player draft", () => {
    const players = generateDraft(withTeams({ Matt: "kc", Dave: "buf", Chris: "sf", Sam: "dal" }));
    expect(players.map(p => p.team?.abbr)).toEqual(["KC", "BUF", "SF", "DAL"]);
  });


});
