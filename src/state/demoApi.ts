// Dev-only demo backend: runs the real migration in an in-browser Postgres (PGlite) so the whole
// app can be exercised with no Supabase project. Enabled with `?demo` while running `npm run dev`.
// The data is kept in this browser's IndexedDB so it survives reloads (use `?demo=reset` to start over).
// It is not shared between tabs or browsers.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import migration1 from "../../supabase/migrations/0001_league.sql?raw";
import migration2 from "../../supabase/migrations/0002_shared_key.sql?raw";
import migration3 from "../../supabase/migrations/0003_optional_names.sql?raw";
import type { Api, DraftRow, LeagueData, LeagueRow, MemberRow, PickRow } from "./types";

export const DEMO_KEY = "demo-league-key";

const DB_NAME = "madden-demo";

export async function createDemoApi(): Promise<Api> {
  if (new URLSearchParams(location.search).get("demo") === "reset") {
    await new Promise<void>(done => {
      const req = indexedDB.deleteDatabase(`/pglite/${DB_NAME}`);
      req.onsuccess = req.onerror = req.onblocked = () => done();
    });
    const u = new URL(location.href);
    u.searchParams.set("demo", "");
    history.replaceState(null, "", u.pathname + u.search);
  }

  const db = new PGlite(`idb://${DB_NAME}`, { extensions: { pgcrypto } });
  await db.waitReady;
  const exists = (await db.query<{ r: string | null }>("select to_regclass('public.league') as r")).rows[0].r;
  if (!exists) {
    await db.exec("create role anon nologin; create role authenticated nologin; create publication supabase_realtime;");
    await db.exec(migration1);
    await db.exec(migration2);
    await db.exec(migration3);
    await db.query("select bootstrap_league($1, $2)", ["Demo League", DEMO_KEY]);
  }

  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());

  /** Runs as the public `anon` role, exactly like the browser does against Supabase. */
  const asAnon = <T>(text: string, params: unknown[] = []): Promise<T[]> =>
    db.transaction(async tx => {
      await tx.exec("set local role anon");
      return (await tx.query<T>(text, params)).rows;
    });

  return {
    async loadLeague(): Promise<LeagueData> {
      const [league, members, drafts] = await Promise.all([
        asAnon<LeagueRow>("select name, rules, roster from league"),
        asAnon<MemberRow>("select id, name, team, joined_at::text from members order by join_order"),
        asAnon<DraftRow>("select id, title, status, config, current_round, auto_advance, created_at::text, completed_at::text from drafts order by created_at desc"),
      ]);
      return { league: league[0] ?? null, members, drafts };
    },

    loadPicks: draftId => asAnon<PickRow>("select draft_id, player, round, player_taken from picks where draft_id = $1::uuid", [draftId]),

    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const keys = Object.keys(args);
      const params = keys.map(k => {
        const v = args[k];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      const call = `select ${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`;
      try {
        const rows = await asAnon<{ result: T }>(call, params);
        return rows[0]?.result as T;
      } finally {
        notify();
      }
    },

    subscribe(onChange) {
      listeners.add(onChange);
      return () => { listeners.delete(onChange); };
    },
  };
}
