import { describe, expect, it } from "vitest";
import { generateDraft, validateConfig } from "./generate";
import { DEFAULT_ROSTER, DEFAULT_RULES, expandSlots } from "./roster";
import { checkRules, totalRounds, validatePicks } from "./rules";
import { decodeConfig, encodeConfig } from "./share";
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

describe("share links", () => {
  it("round-trips the default config", () => {
    const c = base({ rerolls: { Sam: 2 } });
    expect(decodeConfig(encodeConfig(c))).toEqual(c);
  });
  it("round-trips custom rules, roster and unicode names", () => {
    const c = base({
      names: ["José", "Zoë", "李"],
      rules: [{ id: "r", label: "K", minRound: 25 }],
      roster: [{ label: "QB", count: 1, group: "qb" }, { label: "K", count: 30, group: "k" }],
    });
    const back = decodeConfig(encodeConfig(c));
    expect(back?.names).toEqual(c.names);
    expect(back?.rules).toEqual(c.rules);
    expect(back?.roster).toEqual(c.roster);
  });
  it("regenerates identical results from a link", () => {
    const c = base();
    expect(generateDraft(decodeConfig(encodeConfig(c))!)).toEqual(generateDraft(c));
  });
  it("rejects garbage", () => {
    expect(decodeConfig("#/d/not-valid")).toBeNull();
    expect(decodeConfig("#/other")).toBeNull();
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

describe("auto-advance", () => {
  it("moves to the next round once every player has entered a name", async () => {
    const { applyPick, emptyProgress } = await import("./progress");
    const names = ["A", "B", "C"];
    let p = emptyProgress();
    p = applyPick(p, names, 31, "A", 1, "Mahomes");
    p = applyPick(p, names, 31, "B", 1, "Allen");
    expect(p.currentRound).toBe(1);
    p = applyPick(p, names, 31, "C", 1, "Burrow");
    expect(p.currentRound).toBe(2);
  });
  it("does not count blank or whitespace-only entries", async () => {
    const { applyPick, emptyProgress } = await import("./progress");
    const names = ["A", "B"];
    let p = applyPick(emptyProgress(), names, 31, "A", 1, "Lamar");
    p = applyPick(p, names, 31, "B", 1, "   ");
    expect(p.currentRound).toBe(1);
  });
  it("ignores corrections, clearing, other rounds, the last round and the off switch", async () => {
    const { applyPick, emptyProgress } = await import("./progress");
    const names = ["A", "B"];
    // finishing a round that is not on the clock does not move the pointer
    let p = applyPick(emptyProgress(), names, 31, "A", 3, "x");
    p = applyPick(p, names, 31, "B", 3, "y");
    expect(p.currentRound).toBe(1);
    // fixing a name in a round that is already complete does not advance
    let q = applyPick(applyPick(emptyProgress(), names, 31, "A", 1, "x"), names, 31, "B", 1, "y");
    expect(q.currentRound).toBe(2);
    q = { ...q, currentRound: 1 };
    q = applyPick(q, names, 31, "A", 1, "x2");
    expect(q.currentRound).toBe(1);
    // clearing then re-entering counts as a new pick
    q = applyPick(q, names, 31, "A", 1, "");
    q = applyPick(q, names, 31, "A", 1, "x3");
    expect(q.currentRound).toBe(2);
    // last round stays put
    const last = { ...emptyProgress(), currentRound: 31 };
    const done = applyPick(applyPick(last, names, 31, "A", 31, "a"), names, 31, "B", 31, "b");
    expect(done.currentRound).toBe(31);
    // switched off
    const off = { ...emptyProgress(), autoAdvance: false };
    const stay = applyPick(applyPick(off, names, 31, "A", 1, "a"), names, 31, "B", 1, "b");
    expect(stay.currentRound).toBe(1);
  });
});
