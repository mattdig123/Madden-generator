import { TEAM_BY_ID } from "../core/teams";
import type { League } from "../state/useLeague";
import { TeamLogo } from "./TeamLogo";

interface Props {
  league: League;
  onOpen: () => void;
}

export function HistoryList({ league, onOpen }: Props) {
  const shown = league.drafts.filter(d => d.status !== "preview");

  if (shown.length === 0) {
    return <section className="panel"><p>No drafts yet. Finished drafts will be kept here for the whole league to look back on.</p></section>;
  }

  return (
    <>
      {shown.map(d => (
        <section className="panel history-item" key={d.id}>
          <div>
            <strong>{d.title}</strong>
            {d.status === "live" && <span className="live-pill ml"><span className="live-dot" />Live</span>}
            {d.status === "complete" && <span className="badge">Complete</span>}
            {league.current?.id === d.id && league.viewedId === null && <span className="badge info">Current</span>}
            <div className="hint">
              {new Date(d.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })} · {d.config.names.length} players
            </div>
            <div className="history-players">
              {d.config.names.map(n => (
                <span key={n} className="history-player">
                  <TeamLogo team={TEAM_BY_ID[d.config.teams?.[n] ?? ""]} size={18} />
                  {n}
                </span>
              ))}
            </div>
          </div>
          <div className="row first">
            <button className="primary" onClick={() => { league.viewDraft(d.id); onOpen(); }}>Open</button>
            {league.isAdmin && (
              <button onClick={() => { if (confirm(`Delete "${d.title}" and all its picks? This can't be undone.`)) void league.deleteDraft(d.id); }}>
                Delete
              </button>
            )}
          </div>
        </section>
      ))}
    </>
  );
}
