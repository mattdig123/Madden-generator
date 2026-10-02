import { useState } from "react";
import { totalRounds } from "../core/rules";
import { TEAM_BY_ID, teamLabel } from "../core/teams";
import type { League } from "../state/useLeague";
import { AddPlayerForm } from "./AddPlayerForm";
import { TeamLogo } from "./TeamLogo";
import { TeamSelect } from "./TeamSelect";

interface Props {
  league: League;
  goTo: (tab: "draft" | "live" | "setup") => void;
}

export function LeagueHome({ league, goTo }: Props) {
  const { players, me, current, canEdit } = league;
  const live = current?.status === "live";
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!league.league) {
    return (
      <section className="panel">
        <h2>This league isn't set up yet</h2>
        <p className="hint">
          The database is connected but no league exists. Run the setup step in <code>docs/SETUP.md</code>
          (the <code>bootstrap_league</code> command) to create it.
        </p>
      </section>
    );
  }

  const startEdit = (id: string) => {
    const p = players.find(x => x.id === id)!;
    setEditing(id);
    setEditName(p.name);
    setEditTeam(p.team);
    setError(null);
  };
  const saveEdit = async () => {
    if (!editing) return;
    const err = await league.updatePlayer(editing, editName.trim(), editTeam);
    setError(err);
    if (!err) setEditing(null);
  };

  return (
    <>
      <section className="panel">
        <h2>Draft status</h2>
        {!current && <p>No draft yet. {canEdit ? "Add everyone below, then create the draft on the Setup tab." : "Whoever runs the league will create one soon."}</p>}
        {current?.status === "preview" && <p>A draft preview is ready. Positions lock when the draft starts.</p>}
        {live && current && (
          <p>
            <span className="live-pill"><span className="live-dot" />Live</span>{" "}
            Round {current.current_round} of {totalRounds(current.config.roster)} is on the clock.
          </p>
        )}
        {current?.status === "complete" && <p>The last draft is complete. Browse it in History.</p>}
        <div className="row">
          {current && <button onClick={() => goTo("draft")}>View positions</button>}
          {live && <button className="primary" onClick={() => goTo("live")}>Open live board</button>}
          {canEdit && !live && <button onClick={() => goTo("setup")}>Go to Setup</button>}
        </div>
      </section>

      <section className="panel">
        <h2>Players <span className="count">{players.length}</span></h2>
        {canEdit && <AddPlayerForm league={league} />}
        {!canEdit && (
          <p className="hint">
            You're watching. To add players or enter picks, open the league link you were sent (or paste the key on the Setup tab).
          </p>
        )}
        {error && <div className="msg error" role="alert">{error}</div>}
        {players.length === 0 && <p className="hint">No players yet.</p>}
        <div className="cards">
          {players.map(p => {
            const team = TEAM_BY_ID[p.team];
            const isMe = me?.id === p.id;
            if (editing === p.id) {
              return (
                <div key={p.id} className="member-card editing">
                  <input value={editName} aria-label="Player name" maxLength={40} onChange={e => setEditName(e.target.value)} />
                  <TeamSelect value={editTeam} taken={new Set(players.filter(x => x.id !== p.id).map(x => x.team))} label="Team" onChange={setEditTeam} />
                  <div className="row first">
                    <button className="primary small" onClick={saveEdit}>Save</button>
                    <button className="small" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={p.id} className={`member-card${isMe ? " me" : ""}`}>
                <TeamLogo team={team} size={44} />
                <div className="grow">
                  <strong>{p.name}</strong>
                  <div className="hint">{team ? teamLabel(team) : p.team}</div>
                </div>
                {isMe && <span className="badge">Me</span>}
                {canEdit && (
                  <div className="card-actions">
                    <button className="small" onClick={() => league.setMe(isMe ? null : p.id)}>{isMe ? "Not me" : "This is me"}</button>
                    <button className="small" disabled={live} onClick={() => startEdit(p.id)}>Edit</button>
                    <button className="small" disabled={live} onClick={() => { if (confirm(`Remove ${p.name}?`)) void league.removePlayer(p.id); }}>Remove</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
