import { totalRounds } from "../core/rules";
import { TEAM_BY_ID, teamLabel } from "../core/teams";
import type { League } from "../state/useLeague";
import { JoinForm } from "./JoinForm";
import { TeamLogo } from "./TeamLogo";

interface Props {
  league: League;
  inviteFromUrl: string;
  goTo: (tab: "draft" | "live" | "commissioner") => void;
}

export function LeagueHome({ league, inviteFromUrl, goTo }: Props) {
  const { members, me, current } = league;
  const live = current?.status === "live";

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

  return (
    <>
      <section className="panel">
        <h2>Draft status</h2>
        {!current && <p>No draft yet. The commissioner will create one once everyone has joined.</p>}
        {current?.status === "preview" && <p>A draft preview is ready. Positions lock when the commissioner starts the draft.</p>}
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
        </div>
      </section>

      {me && (
        <section className="panel you-panel">
          <TeamLogo team={TEAM_BY_ID[me.team]} size={48} />
          <div>
            <strong>You're {me.name}</strong>
            <div className="hint">Drafting for the {teamLabel(TEAM_BY_ID[me.team])}</div>
          </div>
          <button className="small" onClick={league.forgetIdentity}>Not you? Sign out on this device</button>
        </section>
      )}

      {!me && !live && <JoinForm league={league} initialInvite={inviteFromUrl} />}
      {!me && live && (
        <section className="panel">
          <p className="hint">The draft is under way, so new members can't join right now. You're watching live.</p>
        </section>
      )}

      <section className="panel">
        <h2>Members <span className="count">{members.length}</span></h2>
        {members.length === 0 && <p className="hint">No one has joined yet.</p>}
        <div className="cards">
          {members.map(m => (
            <div key={m.id} className={`member-card${me?.id === m.id ? " me" : ""}`}>
              <TeamLogo team={TEAM_BY_ID[m.team]} size={44} />
              <div>
                <strong>{m.name}</strong>
                <div className="hint">{TEAM_BY_ID[m.team] ? teamLabel(TEAM_BY_ID[m.team]) : m.team}</div>
              </div>
              {me?.id === m.id && <span className="badge">You</span>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
