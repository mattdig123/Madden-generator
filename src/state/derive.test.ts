import { describe, expect, it } from "vitest";
import { DEFAULT_ROSTER, DEFAULT_RULES } from "../core/roster";
import { getPick, isPicked, remainingSlots } from "../core/progress";
import { pickCurrent, toProgress } from "./derive";
import type { DraftRow, PickRow } from "./types";

const draft = (id: string, status: DraftRow["status"], over: Partial<DraftRow> = {}): DraftRow => ({
  id, title: id, status, current_round: 1, auto_advance: true, created_at: "", completed_at: null,
  config: { seed: "s", names: ["A", "B"], rerolls: {}, rules: DEFAULT_RULES, roster: DEFAULT_ROSTER },
  ...over,
});

describe("pickCurrent", () => {
  it("prefers live, then preview, then the newest finished draft", () => {
    const done1 = draft("done-new", "complete");
    const done2 = draft("done-old", "complete");
    expect(pickCurrent([done1, done2])?.id).toBe("done-new");
    expect(pickCurrent([done1, draft("pre", "preview"), done2])?.id).toBe("pre");
    expect(pickCurrent([done1, draft("pre", "preview"), draft("live", "live")])?.id).toBe("live");
    expect(pickCurrent([])).toBeUndefined();
  });
});

describe("toProgress", () => {
  const rows: PickRow[] = [
    { draft_id: "d", player: "A", round: 1, player_taken: "Mahomes" },
    { draft_id: "d", player: "B", round: 2, player_taken: "Allen" },
  ];
  it("maps picks and the draft's pointer into Progress", () => {
    const p = toProgress(draft("d", "live", { current_round: 3, auto_advance: false }), rows);
    expect(p.currentRound).toBe(3);
    expect(p.autoAdvance).toBe(false);
    expect(isPicked(getPick(p, "A", 1))).toBe(true);
    expect(isPicked(getPick(p, "A", 2))).toBe(false);
    expect(getPick(p, "B", 2).note).toBe("Allen");
  });
  it("feeds the remaining-slots tally", () => {
    const picks = Array.from({ length: 31 }, (_, i) => DEFAULT_ROSTER.flatMap(r => Array(r.count).fill(r))[i]);
    const left = remainingSlots(picks, "A", toProgress(draft("d", "live"), rows), DEFAULT_ROSTER);
    expect(left.reduce((n, x) => n + x.left, 0)).toBe(30);
  });
  it("handles no draft", () => {
    expect(toProgress(undefined, []).currentRound).toBe(1);
  });
});
