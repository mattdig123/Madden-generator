import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeEach, describe, expect, it } from "vitest";

const MIGRATION = readFileSync(new URL("../../supabase/migrations/0001_league.sql", import.meta.url), "utf8");
const PASS = "correct-horse-battery";
const INVITE = "JOIN123";
// 3 rounds keeps the draft short: QB, RB, RB.
const ROSTER = JSON.stringify([
  { label: "QB", count: 1, group: "qb" },
  { label: "RB", count: 2, group: "skill" },
]);

let db: PGlite;

beforeEach(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec("create role anon nologin; create role authenticated nologin; create publication supabase_realtime;");
  await db.exec(MIGRATION);
  await db.query("select bootstrap_league($1, $2, $3)", ["Test League", PASS, INVITE]);
});

type Member = { id: string; token: string; name: string };

/** Runs a query as the public `anon` role, like the browser does. */
async function asAnon<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("set role anon");
  try {
    return (await db.query<T>(text, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function join(name: string, team: string): Promise<Member> {
  const [row] = await asAnon<{ r: { member_id: string; token: string } }>("select join_league($1, $2, $3) as r", [INVITE, name, team]);
  return { id: row.r.member_id, token: row.r.token, name };
}

async function seedLeague(count = 3): Promise<Member[]> {
  const teams = ["kc", "buf", "sf", "dal"];
  const members: Member[] = [];
  for (let i = 0; i < count; i++) members.push(await join(["Matt", "Dave", "Chris", "Sam"][i], teams[i]));
  return members;
}

async function createPreview(): Promise<string> {
  const [row] = await asAnon<{ id: string }>("select admin_create_preview($1, $2, $3, $4::jsonb, $5::jsonb) as id", [PASS, "Draft", "seed1", "[]", ROSTER]);
  return row.id;
}

async function startDraft(): Promise<string> {
  const id = await createPreview();
  await asAnon("select admin_start_draft($1, $2::uuid)", [PASS, id]);
  return id;
}

const pick = (draft: string, m: Member, round: number, text: string, token = m.token) =>
  asAnon("select submit_pick($1::uuid, $2::uuid, $3, $4::int, $5)", [draft, m.id, token, round, text]);

const draftRow = async (id: string) => (await db.query<{ status: string; current_round: number }>("select status, current_round from drafts where id = $1", [id])).rows[0];
const pickCount = async (id: string) => Number((await db.query<{ n: number }>("select count(*)::int as n from picks where draft_id = $1", [id])).rows[0].n);

describe("migration hygiene", () => {
  it("never runs UPDATE or DELETE without a WHERE clause (Supabase rejects those)", () => {
    const sql = MIGRATION.replace(/--.*$/gm, "");
    const statements = sql.split(";").map(s => s.trim().replace(/\s+/g, " "));
    const bad = statements.filter(s => /^(update|delete from) /i.test(s) && !/\bwhere\b/i.test(s));
    expect(bad).toEqual([]);
  });
});

describe("permissions", () => {
  it("lets the public read league data but not write it", async () => {
    await seedLeague(2);
    expect(await asAnon("select name from members")).toHaveLength(2);
    expect(await asAnon("select name from league")).toHaveLength(1);
    await expect(asAnon("insert into members (name, team) values ('Eve', 'ne')")).rejects.toThrow();
    await expect(asAnon("update league set name = 'Hacked'")).rejects.toThrow();
    await expect(asAnon("delete from members")).rejects.toThrow();
  });

  it("hides the secret tables", async () => {
    await seedLeague(1);
    await expect(asAnon("select * from league_secret")).rejects.toThrow();
    await expect(asAnon("select * from member_secret")).rejects.toThrow();
  });

  it("does not let the browser call internal functions or bootstrap", async () => {
    await expect(asAnon("select bootstrap_league('x', 'long-enough-pass', 'abcd')")).rejects.toThrow();
    await expect(asAnon("select _require_admin($1)", [PASS])).rejects.toThrow();
    await expect(asAnon("select _write_pick(gen_random_uuid(), 'a', 1, 'b')")).rejects.toThrow();
    await expect(asAnon("select _new_token()")).rejects.toThrow();
  });

  it("bootstrap refuses weak passcodes and a second league", async () => {
    await expect(db.query("select bootstrap_league('x', 'short', 'abcd')")).rejects.toThrow();
    await expect(db.query("select bootstrap_league('x', 'long-enough-pass', 'abcd')")).rejects.toThrow(/already exists/);
  });

  it("checks the commissioner passcode", async () => {
    expect((await asAnon<{ ok: boolean }>("select admin_login($1) as ok", [PASS]))[0].ok).toBe(true);
    expect((await asAnon<{ ok: boolean }>("select admin_login($1) as ok", ["wrong-passcode"]))[0].ok).toBe(false);
    await expect(asAnon("select admin_get_invite($1)", ["wrong-passcode"])).rejects.toThrow(/passcode/);
    expect((await asAnon<{ c: string }>("select admin_get_invite($1) as c", [PASS]))[0].c).toBe(INVITE);
  });
});

describe("joining", () => {
  it("rejects a bad invite code, duplicate names and duplicate teams", async () => {
    await join("Matt", "kc");
    await expect(asAnon("select join_league('nope', 'Dave', 'buf')")).rejects.toThrow(/invite/);
    await expect(asAnon("select join_league($1, 'matt', 'buf')", [INVITE])).rejects.toThrow(/name/);
    await expect(asAnon("select join_league($1, 'Dave', 'kc')", [INVITE])).rejects.toThrow(/team/);
  });

  it("stops new members once a draft is live", async () => {
    await seedLeague(2);
    await startDraft();
    await expect(asAnon("select join_league($1, 'Late', 'ne')", [INVITE])).rejects.toThrow(/in progress/);
  });

  it("clears a stale preview when someone joins", async () => {
    await seedLeague(2);
    await createPreview();
    await join("Chris", "sf");
    expect(await asAnon("select id from drafts")).toHaveLength(0);
  });
});

describe("draft lifecycle", () => {
  it("needs two members, and only one draft can be live", async () => {
    await join("Matt", "kc");
    await expect(createPreview()).rejects.toThrow(/At least 2/);
    await join("Dave", "buf");
    await startDraft();
    await expect(createPreview()).rejects.toThrow(/in progress/);
  });

  it("snapshots members and teams into the draft config", async () => {
    await seedLeague(3);
    const id = await createPreview();
    const [{ config }] = (await db.query<{ config: { names: string[]; teams: Record<string, string>; roster: unknown[] } }>("select config from drafts where id = $1", [id])).rows;
    expect(config.names).toEqual(["Matt", "Dave", "Chris"]);
    expect(config.teams).toEqual({ Matt: "kc", Dave: "buf", Chris: "sf" });
    expect(config.roster).toHaveLength(2);
  });

  it("re-rolls only while a preview", async () => {
    await seedLeague(2);
    const id = await createPreview();
    await asAnon("select admin_reroll($1, $2::uuid, 'seed2', null)", [PASS, id]);
    await asAnon("select admin_reroll($1, $2::uuid, null, 'Dave')", [PASS, id]);
    await asAnon("select admin_reroll($1, $2::uuid, null, 'Dave')", [PASS, id]);
    const [{ config }] = (await db.query<{ config: { seed: string; rerolls: Record<string, number> } }>("select config from drafts where id = $1", [id])).rows;
    expect(config.seed).toBe("seed2");
    expect(config.rerolls).toEqual({ Dave: 2 });
    await expect(asAnon("select admin_reroll($1, $2::uuid, null, 'Nobody')", [PASS, id])).rejects.toThrow(/No such player/);
    await asAnon("select admin_start_draft($1, $2::uuid)", [PASS, id]);
    await expect(asAnon("select admin_reroll($1, $2::uuid, 'seed3', null)", [PASS, id])).rejects.toThrow(/preview/);
  });

  it("can only be started and managed with the passcode", async () => {
    await seedLeague(2);
    const id = await createPreview();
    await expect(asAnon("select admin_start_draft('wrong-passcode', $1::uuid)", [id])).rejects.toThrow(/passcode/);
    await expect(asAnon("select admin_delete_draft('wrong-passcode', $1::uuid)", [id])).rejects.toThrow(/passcode/);
  });
});

describe("entering picks", () => {
  it("only accepts picks with the member's own token", async () => {
    const [matt, dave] = await seedLeague(3);
    const id = await startDraft();
    await expect(pick(id, matt, 1, "Mahomes", "bad-token")).rejects.toThrow(/not signed in/);
    // Dave's token cannot be used to act as Matt
    await expect(pick(id, matt, 1, "Mahomes", dave.token)).rejects.toThrow(/not signed in/);
    await pick(id, matt, 1, "Mahomes");
    const rows = (await db.query<{ player: string }>("select player from picks where draft_id = $1", [id])).rows;
    expect(rows).toEqual([{ player: "Matt" }]);
  });

  it("blocks future rounds, unknown rounds, and non-live drafts", async () => {
    const [matt] = await seedLeague(2);
    const preview = await createPreview();
    await expect(pick(preview, matt, 1, "x")).rejects.toThrow(/not live/);
    await asAnon("select admin_start_draft($1, $2::uuid)", [PASS, preview]);
    await expect(pick(preview, matt, 2, "x")).rejects.toThrow(/not opened/);
    await expect(pick(preview, matt, 9, "x")).rejects.toThrow(/no round/);
  });

  it("advances once every member has entered a name for the round on the clock", async () => {
    const [matt, dave, chris] = await seedLeague(3);
    const id = await startDraft();
    await pick(id, matt, 1, "Mahomes");
    await pick(id, dave, 1, "Allen");
    expect((await draftRow(id)).current_round).toBe(1);
    await pick(id, chris, 1, "Lamar");
    expect((await draftRow(id)).current_round).toBe(2);
  });

  it("ignores blank entries, corrections and clearing when deciding to advance", async () => {
    const [matt, dave] = await seedLeague(2);
    const id = await startDraft();
    await pick(id, matt, 1, "Mahomes");
    await pick(id, dave, 1, "   "); // whitespace is not a pick
    expect((await draftRow(id)).current_round).toBe(1);
    expect(await pickCount(id)).toBe(1);
    await pick(id, matt, 1, "Mahomes II"); // a correction is not a new pick
    expect((await draftRow(id)).current_round).toBe(1);
    await pick(id, matt, 1, ""); // clearing removes it
    expect(await pickCount(id)).toBe(0);
    await pick(id, matt, 1, "Mahomes");
    await pick(id, dave, 1, "Allen");
    expect((await draftRow(id)).current_round).toBe(2);
  });

  it("does not advance when auto-advance is off, and the commissioner can move the round", async () => {
    const [matt, dave] = await seedLeague(2);
    const id = await startDraft();
    await asAnon("select admin_set_auto_advance($1, $2::uuid, false)", [PASS, id]);
    await pick(id, matt, 1, "Mahomes");
    await pick(id, dave, 1, "Allen");
    expect((await draftRow(id)).current_round).toBe(1);
    await asAnon("select admin_set_round($1, $2::uuid, 3)", [PASS, id]);
    expect((await draftRow(id)).current_round).toBe(3);
    await expect(asAnon("select admin_set_round($1, $2::uuid, 4)", [PASS, id])).rejects.toThrow(/no round/);
  });

  it("completes the draft when every cell is filled, then locks member edits", async () => {
    const [matt, dave] = await seedLeague(2);
    const id = await startDraft();
    for (const round of [1, 2, 3]) {
      await pick(id, matt, round, `M${round}`);
      await pick(id, dave, round, `D${round}`);
    }
    const row = await draftRow(id);
    expect(row.status).toBe("complete");
    expect(row.current_round).toBe(3);
    await expect(pick(id, matt, 3, "late edit")).rejects.toThrow(/not live/);
  });

  it("lets the commissioner enter or fix anyone's pick, and still auto-advances", async () => {
    await seedLeague(2);
    const id = await startDraft();
    await asAnon("select admin_set_pick($1, $2::uuid, 'Matt', 1, 'Mahomes')", [PASS, id]);
    await asAnon("select admin_set_pick($1, $2::uuid, 'Dave', 1, 'Allen')", [PASS, id]);
    expect((await draftRow(id)).current_round).toBe(2);
    await asAnon("select admin_set_pick($1, $2::uuid, 'Dave', 1, 'Josh Allen')", [PASS, id]);
    const [{ player_taken }] = (await db.query<{ player_taken: string }>("select player_taken from picks where draft_id = $1 and player = 'Dave'", [id])).rows;
    expect(player_taken).toBe("Josh Allen");
    await expect(asAnon("select admin_set_pick('wrong-passcode', $1::uuid, 'Matt', 1, 'x')", [id])).rejects.toThrow(/passcode/);
    await expect(asAnon("select admin_set_pick($1, $2::uuid, 'Ghost', 1, 'x')", [PASS, id])).rejects.toThrow(/No such player/);
  });

  it("can end a draft early and keep it in history", async () => {
    const [matt] = await seedLeague(2);
    const id = await startDraft();
    await pick(id, matt, 1, "Mahomes");
    await asAnon("select admin_finish_draft($1, $2::uuid)", [PASS, id]);
    expect((await draftRow(id)).status).toBe("complete");
    expect(await pickCount(id)).toBe(1);
    // a new draft can now be created
    await expect(createPreview()).resolves.toBeTruthy();
  });
});

describe("member management", () => {
  it("issues a new token and the old one stops working", async () => {
    const [matt] = await seedLeague(2);
    const id = await startDraft();
    const [{ t }] = await asAnon<{ t: string }>("select admin_issue_claim_token($1, $2::uuid) as t", [PASS, matt.id]);
    await expect(pick(id, matt, 1, "Mahomes", matt.token)).rejects.toThrow(/not signed in/);
    await pick(id, matt, 1, "Mahomes", t);
    await expect(asAnon("select admin_issue_claim_token('wrong-passcode', $1::uuid)", [matt.id])).rejects.toThrow(/passcode/);
  });

  it("removes members only outside a live draft", async () => {
    const [matt] = await seedLeague(3);
    await asAnon("select admin_remove_member($1, $2::uuid)", [PASS, matt.id]);
    expect(await asAnon("select id from members")).toHaveLength(2);
    await startDraft();
    const [{ id }] = await asAnon<{ id: string }>("select id from members limit 1");
    await expect(asAnon("select admin_remove_member($1, $2::uuid)", [PASS, id])).rejects.toThrow(/live draft/);
  });

  it("saves league settings and clears a stale preview", async () => {
    await seedLeague(2);
    await createPreview();
    await asAnon("select admin_save_settings($1, 'Renamed', $2::jsonb, $3::jsonb)", [PASS, "[]", ROSTER]);
    expect((await asAnon<{ name: string }>("select name from league"))[0].name).toBe("Renamed");
    expect(await asAnon("select id from drafts")).toHaveLength(0);
  });
});
