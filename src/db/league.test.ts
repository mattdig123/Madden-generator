import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeEach, describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const MIGRATIONS = [read("0001_league.sql"), read("0002_shared_key.sql"), read("0003_optional_names.sql")];
const KEY = "a-long-shared-league-key";
// 3 rounds keeps the draft short: QB, RB, RB.
const ROSTER = JSON.stringify([
  { label: "QB", count: 1, group: "qb" },
  { label: "RB", count: 2, group: "skill" },
]);

let db: PGlite;

beforeEach(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec("create role anon nologin; create role authenticated nologin; create publication supabase_realtime;");
  for (const sql of MIGRATIONS) await db.exec(sql);
  await db.query("select bootstrap_league($1, $2)", ["Test League", KEY]);
});

/** Runs a query as the public `anon` role, like the browser does. */
async function asAnon<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("set role anon");
  try {
    return (await db.query<T>(text, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

type Player = { id: string; name: string };

async function addPlayer(name: string, team: string, key = KEY): Promise<Player> {
  const [row] = await asAnon<{ id: string }>("select add_player($1, $2, $3) as id", [key, name, team]);
  return { id: row.id, name };
}

async function seed(count = 3): Promise<Player[]> {
  const teams = ["kc", "buf", "sf", "dal"];
  const out: Player[] = [];
  for (let i = 0; i < count; i++) out.push(await addPlayer(["Matt", "Dave", "Chris", "Sam"][i], teams[i]));
  return out;
}

async function createPreview(): Promise<string> {
  const [row] = await asAnon<{ id: string }>("select create_preview($1, $2, $3, $4::jsonb, $5::jsonb) as id", [KEY, "Draft", "seed1", "[]", ROSTER]);
  return row.id;
}

async function startDraft(): Promise<string> {
  const id = await createPreview();
  await asAnon("select start_draft($1, $2::uuid)", [KEY, id]);
  return id;
}

const pick = (draft: string, player: string, round: number, text: string, key = KEY) =>
  asAnon("select set_pick($1, $2::uuid, $3, $4::int, $5)", [key, draft, player, round, text]);

const draftRow = async (id: string) => (await db.query<{ status: string; current_round: number; auto_advance: boolean }>("select status, current_round, auto_advance from drafts where id = $1", [id])).rows[0];
const pickCount = async (id: string) => Number((await db.query<{ n: number }>("select count(*)::int as n from picks where draft_id = $1", [id])).rows[0].n);

describe("migration hygiene", () => {
  it("never runs UPDATE or DELETE without a WHERE clause (Supabase rejects those)", () => {
    const sql = MIGRATIONS.join("\n").replace(/--.*$/gm, "");
    const statements = sql.split(";").map(s => s.trim().replace(/\s+/g, " "));
    const bad = statements.filter(s => /^(update|delete from) /i.test(s) && !/\bwhere\b/i.test(s));
    expect(bad).toEqual([]);
  });

  it("leaves no commissioner or per-person secrets behind", async () => {
    const tables = (await db.query<{ t: string }>("select table_name as t from information_schema.tables where table_schema = 'public'")).rows.map(r => r.t);
    expect(tables).not.toContain("member_secret");
    const cols = (await db.query<{ c: string }>("select column_name as c from information_schema.columns where table_name = 'league_secret'")).rows.map(r => r.c);
    expect(cols).toEqual(expect.arrayContaining(["league_key"]));
    expect(cols).not.toContain("passcode_hash");
  });
});

describe("permissions", () => {
  it("lets the public read league data but not write it", async () => {
    await seed(2);
    expect(await asAnon("select name from members")).toHaveLength(2);
    expect(await asAnon("select name from league")).toHaveLength(1);
    await expect(asAnon("insert into members (name, team) values ('Eve', 'ne')")).rejects.toThrow();
    await expect(asAnon("update league set name = 'Hacked'")).rejects.toThrow();
    await expect(asAnon("delete from members")).rejects.toThrow();
    await expect(asAnon("insert into picks (draft_id, player, round, player_taken) values (gen_random_uuid(), 'a', 1, 'b')")).rejects.toThrow();
  });

  it("hides the key table", async () => {
    await expect(asAnon("select * from league_secret")).rejects.toThrow();
  });

  it("does not let the browser call internal functions or bootstrap", async () => {
    await expect(asAnon("select bootstrap_league('x', 'a-long-enough-key')")).rejects.toThrow();
    await expect(asAnon("select _require_key($1)", [KEY])).rejects.toThrow();
    await expect(asAnon("select _write_pick(gen_random_uuid(), 'a', 1, 'b')")).rejects.toThrow();
  });

  it("only exposes the intended functions to the public", async () => {
    const rows = (await db.query<{ fn: string }>(
      `select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
         and p.proname not in ('crypt', 'digest', 'gen_salt', 'gen_random_bytes', 'gen_random_uuid')
         and p.prokind = 'f' and p.pronamespace = 'public'::regnamespace
         and p.proname !~ '^(pg_|armor|dearmor|decrypt|encrypt|hmac|pgp_|crypt)'
       order by 1`,
    )).rows.map(r => r.fn);
    expect(rows).toEqual([
      "add_player", "check_key", "create_preview", "delete_draft", "finish_draft", "mark_pick", "remove_player",
      "reroll", "rotate_key", "save_settings", "set_auto_advance", "set_pick", "set_round", "start_draft", "update_player",
    ]);
  });

  it("bootstrap refuses short keys and a second league", async () => {
    await expect(db.query("select bootstrap_league('x', 'a-long-enough-key')")).rejects.toThrow(/already exists/);
    const empty = new PGlite({ extensions: { pgcrypto } });
    await empty.exec("create role anon nologin; create role authenticated nologin; create publication supabase_realtime;");
    for (const sql of MIGRATIONS) await empty.exec(sql);
    await expect(empty.query("select bootstrap_league('x', 'short')")).rejects.toThrow(/at least 12/);
    await expect(empty.query("select bootstrap_league('x', null)")).rejects.toThrow(/at least 12/);
  });

  it("rejects a wrong or missing key on every function", async () => {
    const [matt] = await seed(2);
    const draft = await startDraft();
    const bad = "not-the-key";
    // [function, sql, what the second parameter is]
    const calls: [string, string, "member" | "draft" | null][] = [
      ["add_player", "select add_player($1, 'Eve', 'ne')", null],
      ["update_player", "select update_player($1, $2::uuid, 'Eve', 'ne')", "member"],
      ["remove_player", "select remove_player($1, $2::uuid)", "member"],
      ["save_settings", "select save_settings($1, 'x', null, null)", null],
      ["create_preview", "select create_preview($1, 't', 's', '[]'::jsonb, '[]'::jsonb)", null],
      ["reroll", "select reroll($1, $2::uuid, 's', null)", "draft"],
      ["start_draft", "select start_draft($1, $2::uuid)", "draft"],
      ["set_pick", "select set_pick($1, $2::uuid, 'Matt', 1, 'x')", "draft"],
      ["mark_pick", "select mark_pick($1, $2::uuid, 'Matt', 1, true)", "draft"],
      ["set_round", "select set_round($1, $2::uuid, 2)", "draft"],
      ["set_auto_advance", "select set_auto_advance($1, $2::uuid, false)", "draft"],
      ["finish_draft", "select finish_draft($1, $2::uuid)", "draft"],
      ["delete_draft", "select delete_draft($1, $2::uuid)", "draft"],
      ["rotate_key", "select rotate_key($1, 'another-long-league-key')", null],
    ];
    for (const [name, sql, kind] of calls) {
      const params = kind === null ? [bad] : [bad, kind === "member" ? matt.id : draft];
      await expect(asAnon(sql, params), name).rejects.toThrow(/league key/);
    }
    await expect(asAnon("select add_player(null, 'Eve', 'ne')")).rejects.toThrow(/league key/);
    // nothing was changed by any of those
    expect(await asAnon("select id from members")).toHaveLength(2);
    expect((await draftRow(draft)).status).toBe("live");
  });

  it("checks keys without raising", async () => {
    expect((await asAnon<{ ok: boolean }>("select check_key($1) as ok", [KEY]))[0].ok).toBe(true);
    expect((await asAnon<{ ok: boolean }>("select check_key('nope') as ok"))[0].ok).toBe(false);
    expect((await asAnon<{ ok: boolean }>("select check_key(null) as ok"))[0].ok).toBe(false);
  });
});

describe("players", () => {
  it("adds many players with one key and no sign-in", async () => {
    const players = await seed(4);
    expect(players).toHaveLength(4);
    expect((await asAnon<{ name: string }>("select name from members order by join_order")).map(r => r.name)).toEqual(["Matt", "Dave", "Chris", "Sam"]);
  });

  it("rejects duplicate names (any case) and duplicate teams", async () => {
    await addPlayer("Matt", "kc");
    await expect(addPlayer("matt", "buf")).rejects.toThrow(/name/);
    await expect(addPlayer("Dave", "kc")).rejects.toThrow(/team/);
  });

  it("limits the league to 32 players", async () => {
    const teams = ["ari","atl","bal","buf","car","chi","cin","cle","dal","den","det","gb","hou","ind","jax","kc","lv","lac","lar","mia","min","ne","no","nyg","nyj","phi","pit","sf","sea","tb","ten","wsh"];
    for (let i = 0; i < 32; i++) await addPlayer(`P${i}`, teams[i]);
    await expect(addPlayer("One more", "xyz")).rejects.toThrow(/full/);
  });

  it("edits and removes players, keeping names and teams unique", async () => {
    const [matt, dave] = await seed(2);
    await asAnon("select update_player($1, $2::uuid, 'Matthew', 'ne')", [KEY, matt.id]);
    expect((await asAnon<{ name: string; team: string }>("select name, team from members where id = $1::uuid", [matt.id]))[0]).toEqual({ name: "Matthew", team: "ne" });
    await asAnon("select update_player($1, $2::uuid, 'Matthew', 'ne')", [KEY, matt.id]); // saving unchanged values is fine
    await expect(asAnon("select update_player($1, $2::uuid, 'matthew', 'buf')", [KEY, dave.id])).rejects.toThrow(/name/);
    await expect(asAnon("select update_player($1, $2::uuid, 'Dave', 'ne')", [KEY, dave.id])).rejects.toThrow(/team/);
    await asAnon("select remove_player($1, $2::uuid)", [KEY, dave.id]);
    expect(await asAnon("select id from members")).toHaveLength(1);
  });

  it("blocks adding, editing and removing during a live draft", async () => {
    const [matt] = await seed(2);
    await startDraft();
    await expect(addPlayer("Late", "ne")).rejects.toThrow(/live draft/);
    await expect(asAnon("select update_player($1, $2::uuid, 'X', 'ne')", [KEY, matt.id])).rejects.toThrow(/live draft/);
    await expect(asAnon("select remove_player($1, $2::uuid)", [KEY, matt.id])).rejects.toThrow(/live draft/);
  });

  it("clears a stale preview when the players change", async () => {
    const [matt] = await seed(2);
    await createPreview();
    await addPlayer("Chris", "sf");
    expect(await asAnon("select id from drafts")).toHaveLength(0);
    await createPreview();
    await asAnon("select update_player($1, $2::uuid, 'Matty', 'kc')", [KEY, matt.id]);
    expect(await asAnon("select id from drafts")).toHaveLength(0);
  });
});

describe("draft lifecycle", () => {
  it("needs two players, and only one draft can be live", async () => {
    await addPlayer("Matt", "kc");
    await expect(createPreview()).rejects.toThrow(/at least 2/i);
    await addPlayer("Dave", "buf");
    await startDraft();
    await expect(createPreview()).rejects.toThrow(/in progress/);
  });

  it("snapshots players and teams into the draft config", async () => {
    await seed(3);
    const id = await createPreview();
    const [{ config }] = (await db.query<{ config: { names: string[]; teams: Record<string, string>; roster: unknown[] } }>("select config from drafts where id = $1", [id])).rows;
    expect(config.names).toEqual(["Matt", "Dave", "Chris"]);
    expect(config.teams).toEqual({ Matt: "kc", Dave: "buf", Chris: "sf" });
    expect(config.roster).toHaveLength(2);
  });

  it("re-rolls only while a preview", async () => {
    await seed(2);
    const id = await createPreview();
    await asAnon("select reroll($1, $2::uuid, 'seed2', null)", [KEY, id]);
    await asAnon("select reroll($1, $2::uuid, null, 'Dave')", [KEY, id]);
    await asAnon("select reroll($1, $2::uuid, null, 'Dave')", [KEY, id]);
    const [{ config }] = (await db.query<{ config: { seed: string; rerolls: Record<string, number> } }>("select config from drafts where id = $1", [id])).rows;
    expect(config.seed).toBe("seed2");
    expect(config.rerolls).toEqual({ Dave: 2 });
    await expect(asAnon("select reroll($1, $2::uuid, null, 'Nobody')", [KEY, id])).rejects.toThrow(/No such player/);
    await asAnon("select start_draft($1, $2::uuid)", [KEY, id]);
    await expect(asAnon("select reroll($1, $2::uuid, 'seed3', null)", [KEY, id])).rejects.toThrow(/preview/);
  });

  it("saves league settings and clears a stale preview", async () => {
    await seed(2);
    await createPreview();
    await asAnon("select save_settings($1, 'Renamed', $2::jsonb, $3::jsonb)", [KEY, "[]", ROSTER]);
    expect((await asAnon<{ name: string }>("select name from league"))[0].name).toBe("Renamed");
    expect(await asAnon("select id from drafts")).toHaveLength(0);
  });
});

describe("entering picks (anyone with the key, any player)", () => {
  it("sets any player's pick", async () => {
    await seed(3);
    const id = await startDraft();
    await pick(id, "Matt", 1, "Mahomes");
    await pick(id, "Dave", 1, "Allen");
    const rows = (await db.query<{ player: string; player_taken: string }>("select player, player_taken from picks where draft_id = $1 order by player", [id])).rows;
    expect(rows).toEqual([{ player: "Dave", player_taken: "Allen" }, { player: "Matt", player_taken: "Mahomes" }]);
  });

  it("rejects unknown players, unknown rounds and picks before the draft starts", async () => {
    await seed(2);
    const preview = await createPreview();
    await expect(pick(preview, "Matt", 1, "x")).rejects.toThrow(/not started/);
    await asAnon("select start_draft($1, $2::uuid)", [KEY, preview]);
    await expect(pick(preview, "Ghost", 1, "x")).rejects.toThrow(/No such player/);
    await expect(pick(preview, "Matt", 9, "x")).rejects.toThrow(/no round/);
    await expect(pick(preview, "Matt", 0, "x")).rejects.toThrow(/no round/);
  });

  it("lets picks be entered ahead of the round on the clock", async () => {
    await seed(2);
    const id = await startDraft();
    await pick(id, "Matt", 3, "Future pick");
    expect(await pickCount(id)).toBe(1);
    expect((await draftRow(id)).current_round).toBe(1);
  });

  it("advances once every player has entered a name for the round on the clock", async () => {
    await seed(3);
    const id = await startDraft();
    await pick(id, "Matt", 1, "Mahomes");
    await pick(id, "Dave", 1, "Allen");
    expect((await draftRow(id)).current_round).toBe(1);
    await pick(id, "Chris", 1, "Lamar");
    expect((await draftRow(id)).current_round).toBe(2);
  });

  it("ignores blank entries, corrections and clearing when deciding to advance", async () => {
    await seed(2);
    const id = await startDraft();
    await pick(id, "Matt", 1, "Mahomes");
    await pick(id, "Dave", 1, "   ");
    expect((await draftRow(id)).current_round).toBe(1);
    expect(await pickCount(id)).toBe(1);
    await pick(id, "Matt", 1, "Mahomes II");
    expect((await draftRow(id)).current_round).toBe(1);
    await pick(id, "Matt", 1, "");
    expect(await pickCount(id)).toBe(0);
    await pick(id, "Matt", 1, "Mahomes");
    await pick(id, "Dave", 1, "Allen");
    expect((await draftRow(id)).current_round).toBe(2);
  });

  it("does not advance when auto-advance is off, and the round can be moved by hand", async () => {
    await seed(2);
    const id = await startDraft();
    await asAnon("select set_auto_advance($1, $2::uuid, false)", [KEY, id]);
    await pick(id, "Matt", 1, "Mahomes");
    await pick(id, "Dave", 1, "Allen");
    expect((await draftRow(id)).current_round).toBe(1);
    await asAnon("select set_round($1, $2::uuid, 3)", [KEY, id]);
    expect((await draftRow(id)).current_round).toBe(3);
    await expect(asAnon("select set_round($1, $2::uuid, 4)", [KEY, id])).rejects.toThrow(/no round/);
  });

  it("completes the draft when every cell is filled", async () => {
    await seed(2);
    const id = await startDraft();
    for (const round of [1, 2, 3]) {
      await pick(id, "Matt", round, `M${round}`);
      await pick(id, "Dave", round, `D${round}`);
    }
    const row = await draftRow(id);
    expect(row.status).toBe("complete");
    expect(row.current_round).toBe(3);
    // a completed draft can still be corrected
    await pick(id, "Matt", 3, "Fixed");
    expect((await db.query<{ player_taken: string }>("select player_taken from picks where draft_id = $1 and player = 'Matt' and round = 3", [id])).rows[0].player_taken).toBe("Fixed");
  });

  it("can end a draft early and keep it in history", async () => {
    await seed(2);
    const id = await startDraft();
    await pick(id, "Matt", 1, "Mahomes");
    await asAnon("select finish_draft($1, $2::uuid)", [KEY, id]);
    expect((await draftRow(id)).status).toBe("complete");
    expect(await pickCount(id)).toBe(1);
    await expect(createPreview()).resolves.toBeTruthy();
  });

  it("deletes a draft and its picks", async () => {
    await seed(2);
    const id = await startDraft();
    await pick(id, "Matt", 1, "Mahomes");
    await asAnon("select delete_draft($1, $2::uuid)", [KEY, id]);
    expect(await asAnon("select id from drafts")).toHaveLength(0);
    expect(await asAnon("select 1 from picks")).toHaveLength(0);
  });
});

describe("marking picks without a name", () => {
  const mark = (draft: string, player: string, round: number, made = true, key = KEY) =>
    asAnon("select mark_pick($1, $2::uuid, $3, $4::int, $5::boolean)", [key, draft, player, round, made]);
  const taken = async (draft: string, player: string, round: number) =>
    (await db.query<{ player_taken: string }>("select player_taken from picks where draft_id = $1 and player = $2 and round = $3", [draft, player, round])).rows[0]?.player_taken;

  it("marks a pick as made with no name, and takes it back", async () => {
    await seed(2);
    const id = await startDraft();
    await mark(id, "Matt", 1);
    expect(await taken(id, "Matt", 1)).toBe("");
    expect(await pickCount(id)).toBe(1);
    await mark(id, "Matt", 1, false);
    expect(await taken(id, "Matt", 1)).toBeUndefined();
    expect(await pickCount(id)).toBe(0);
  });

  it("advances the round when everyone has marked or named a pick, in any mix", async () => {
    await seed(3);
    const id = await startDraft();
    await mark(id, "Matt", 1);
    await pick(id, "Dave", 1, "Allen");
    expect((await draftRow(id)).current_round).toBe(1);
    await mark(id, "Chris", 1);
    expect((await draftRow(id)).current_round).toBe(2);
  });

  it("never overwrites a name when marking, and a name can be added to a marked pick", async () => {
    await seed(2);
    const id = await startDraft();
    await pick(id, "Matt", 1, "Mahomes");
    await mark(id, "Matt", 1);
    expect(await taken(id, "Matt", 1)).toBe("Mahomes");
    await mark(id, "Dave", 1);
    await pick(id, "Dave", 1, "Allen");
    expect(await taken(id, "Dave", 1)).toBe("Allen");
  });

  it("clearing a name's text removes the pick, which is different from un-marking only when blank", async () => {
    await seed(2);
    const id = await startDraft();
    await mark(id, "Matt", 1);
    await pick(id, "Matt", 1, "");
    expect(await taken(id, "Matt", 1)).toBeUndefined();
  });

  it("does not advance twice or on re-marking, and completes a draft filled only by marks", async () => {
    await seed(2);
    const id = await startDraft();
    await mark(id, "Matt", 1);
    await mark(id, "Matt", 1);
    await mark(id, "Dave", 1);
    expect((await draftRow(id)).current_round).toBe(2);
    await mark(id, "Dave", 1); // already marked: no second advance
    expect((await draftRow(id)).current_round).toBe(2);
    for (const round of [2, 3]) {
      await mark(id, "Matt", round);
      await mark(id, "Dave", round);
    }
    expect((await draftRow(id)).status).toBe("complete");
  });

  it("respects the auto-advance switch and blocks previews, bad players and bad rounds", async () => {
    await seed(2);
    const preview = await createPreview();
    await expect(mark(preview, "Matt", 1)).rejects.toThrow(/not started/);
    await asAnon("select start_draft($1, $2::uuid)", [KEY, preview]);
    await expect(mark(preview, "Ghost", 1)).rejects.toThrow(/No such player/);
    await expect(mark(preview, "Matt", 9)).rejects.toThrow(/no round/);
    await asAnon("select set_auto_advance($1, $2::uuid, false)", [KEY, preview]);
    await mark(preview, "Matt", 1);
    await mark(preview, "Dave", 1);
    expect((await draftRow(preview)).current_round).toBe(1);
  });

  it("still rejects names longer than 80 characters", async () => {
    await seed(2);
    const id = await startDraft();
    await pick(id, "Matt", 1, "x".repeat(200));
    expect((await taken(id, "Matt", 1)).length).toBe(80);
  });
});

describe("rotating the key", () => {
  it("locks out the old key and accepts the new one", async () => {
    const NEW = "brand-new-league-key-1";
    await asAnon("select rotate_key($1, $2)", [KEY, NEW]);
    await expect(addPlayer("Matt", "kc", KEY)).rejects.toThrow(/league key/);
    await expect(addPlayer("Matt", "kc", NEW)).resolves.toBeTruthy();
    expect((await asAnon<{ ok: boolean }>("select check_key($1) as ok", [KEY]))[0].ok).toBe(false);
  });

  it("refuses short keys", async () => {
    await expect(asAnon("select rotate_key($1, 'too-short')", [KEY])).rejects.toThrow(/at least 12/);
    expect((await asAnon<{ ok: boolean }>("select check_key($1) as ok", [KEY]))[0].ok).toBe(true);
  });
});

describe("upgrading a league that used the old commissioner model", () => {
  it("keeps the old invite code as the league key and keeps existing data", async () => {
    const old = new PGlite({ extensions: { pgcrypto } });
    await old.exec("create role anon nologin; create role authenticated nologin; create publication supabase_realtime;");
    await old.exec(MIGRATIONS[0]);
    await old.query("select bootstrap_league('Old League', 'old-commissioner-pass', 'OLDCODE')");
    await old.query("select join_league('OLDCODE', 'Matt', 'kc')");
    await old.exec(MIGRATIONS[1]);
    await old.exec(MIGRATIONS[2]);
    expect((await old.query<{ ok: boolean }>("select check_key('OLDCODE') as ok")).rows[0].ok).toBe(true);
    expect((await old.query("select name from members")).rows).toEqual([{ name: "Matt" }]);
    expect((await old.query("select name from league")).rows).toEqual([{ name: "Old League" }]);
  });
});
