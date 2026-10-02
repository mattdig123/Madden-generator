import { useEffect, useMemo, useState } from "react";
import { DraftView } from "./components/DraftView";
import { HistoryList } from "./components/HistoryList";
import { LeagueHome } from "./components/LeagueHome";
import { LiveBoard } from "./components/LiveBoard";
import { Setup } from "./components/Setup";
import { generateDraft, type PlayerDraft } from "./core/generate";
import { totalRounds } from "./core/rules";
import { connect, type Connection } from "./state/connect";
import { toProgress } from "./state/derive";
import { clearParams } from "./state/links";
import type { Api } from "./state/types";
import { useLeague } from "./state/useLeague";

type Tab = "league" | "draft" | "live" | "history" | "setup";

const TABS: { id: Tab; label: string }[] = [
  { id: "league", label: "Players" },
  { id: "draft", label: "Draft" },
  { id: "live", label: "Live board" },
  { id: "history", label: "History" },
  { id: "setup", label: "Setup" },
];

export function App() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    connect().then(setConn).catch(e => setFailure(e instanceof Error ? e.message : String(e)));
  }, []);

  if (failure) return <Shell><div className="banner error">Couldn't start the app: {failure}</div></Shell>;
  if (!conn) return <Shell><p className="hint">Loading…</p></Shell>;
  if (conn.kind === "missing") return <Shell><ConfigMissing /></Shell>;
  return <Site api={conn.api} demo={conn.demo} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main>
      <Hero title="Madden Draft" sub="Every player drafts the same positions, each in their own random order." />
      {children}
    </main>
  );
}

function Hero({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <header className="hero">
      <div className="logo" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <ellipse cx="16" cy="16" rx="13" ry="8" transform="rotate(-35 16 16)" />
          <path d="M10.5 21.5l11-11M14 18l2.2-2.2M16.8 20.6l2.2-2.2M11.4 15.4l2.2-2.2" />
        </svg>
      </div>
      <div>
        <h1>{title}</h1>
        <p className="sub">{sub}</p>
      </div>
    </header>
  );
}

function ConfigMissing() {
  return (
    <section className="panel">
      <h2>Connect the database</h2>
      <p>This site needs its Supabase connection before it can show a league.</p>
      <ol className="steps">
        <li>Create a free Supabase project and run the SQL in <code>supabase/migrations/0001_league.sql</code>.</li>
        <li>Put the project URL and anon key in <code>.env.local</code> as <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, and add the same two variables to your host's build settings.</li>
        <li>Restart the dev server or redeploy.</li>
      </ol>
      <p className="hint">Full instructions are in <code>docs/SETUP.md</code>. To try the app with no database, run <code>npm run dev</code> and open the site with <code>?demo</code> on the end.</p>
    </section>
  );
}

function Site({ api, demo }: { api: Api; demo: boolean }) {
  const league = useLeague(api);
  const { draft, current } = league;
  const [tab, setTab] = useState<Tab>("league");
  const [notice, setNotice] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  // The league link carries the key: ?key=SECRET (older links used ?join=SECRET). Use it, then tidy the address.
  const { applyKey } = league;
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("key") ?? params.get("join");
    if (!code) return;
    clearParams("key", "join");
    void applyKey(code).then(err => {
      setNotice(err
        ? { text: "That league link isn't valid, so you can only watch. Ask for the current link.", kind: "error" }
        : { text: "League link accepted. You can now add players, change settings and enter picks on this device.", kind: "ok" });
      if (!err) setTab("league");
    });
  }, [applyKey]);

  const { players: grid, error } = useMemo<{ players: PlayerDraft[]; error: string | null }>(() => {
    if (!draft) return { players: [], error: null };
    try {
      return { players: generateDraft(draft.config), error: null };
    } catch (e) {
      return { players: [], error: (e as Error).message };
    }
  }, [draft]);
  const progress = useMemo(() => toProgress(draft, league.picks), [draft, league.picks]);

  const viewingPast = !!draft && !!current && draft.id !== current.id;
  const rounds = draft ? totalRounds(draft.config.roster) : 0;

  let sub: React.ReactNode = "No draft yet.";
  if (draft?.status === "live") sub = <><span className="live-pill on-dark"><span className="live-dot" />Live</span> Round {draft.current_round} of {rounds}</>;
  else if (draft?.status === "preview") sub = "Draft preview. Positions lock when the draft starts.";
  else if (draft?.status === "complete") sub = `${draft.title} is complete.`;

  if (!league.data) {
    return (
      <Shell>
        {league.loadError
          ? <div className="banner error">Couldn't load the league: {league.loadError}</div>
          : <p className="hint">Loading the league…</p>}
      </Shell>
    );
  }

  return (
    <main>
      <Hero title={league.league?.name ?? "Madden Draft"} sub={sub} />

      {demo && <div className="banner info">Demo mode: this runs on a practice database stored in your browser (add ?demo=reset to the address to start over). League key: <code>demo-league-key</code>. Open <code>?demo&amp;key=demo-league-key</code> to make changes.</div>}
      {league.loadError && <div className="banner error">Having trouble reaching the server ({league.loadError}). Retrying…</div>}
      {notice && <div className={`banner ${notice.kind}`}>{notice.text}</div>}
      {error && <div className="banner error">{error}</div>}
      {league.keyProblem && (
        <div className="banner error dismissible" role="alert">
          <span>{league.keyProblem}</span>
          <button className="small" onClick={league.dismissKeyProblem}>Dismiss</button>
        </div>
      )}
      {league.actionError && (
        <div className="banner error dismissible" role="alert">
          <span>{league.actionError}</span>
          <button className="small" onClick={league.dismissError}>Dismiss</button>
        </div>
      )}
      {viewingPast && draft && (
        <div className="banner info viewing">
          Viewing a past draft: <strong>{draft.title}</strong>
          <button className="small" onClick={() => league.viewDraft(null)}>Back to current draft</button>
        </div>
      )}

      <nav className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "league" && <LeagueHome league={league} goTo={setTab} />}
      {tab === "draft" && <DraftView league={league} players={grid} />}
      {tab === "live" && <LiveBoard league={league} players={grid} progress={progress} goTo={setTab} />}
      {tab === "history" && <HistoryList league={league} onOpen={() => setTab("live")} />}
      {tab === "setup" && <Setup league={league} />}
    </main>
  );
}
