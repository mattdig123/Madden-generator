import { useState } from "react";
import type { League } from "../state/useLeague";
import { TeamSelect } from "./TeamSelect";

interface Props {
  league: League;
  initialInvite: string;
}

export function JoinForm({ league, initialInvite }: Props) {
  const [invite, setInvite] = useState(initialInvite);
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const taken = new Set(league.members.map(m => m.team));

  const submit = async () => {
    if (!name.trim()) return setError("Enter your name.");
    if (!team) return setError("Choose the team you are drafting for.");
    if (!invite.trim()) return setError("Enter the invite code from your commissioner.");
    setBusy(true);
    const err = await league.join(invite.trim(), name.trim(), team);
    setBusy(false);
    setError(err);
  };

  return (
    <section className="panel">
      <h2>Join the league</h2>
      <p className="hint join-hint">Pick your name and the team you'll draft for. Each team can only be taken once.</p>
      <div className="player-row">
        <input className="player-name" value={name} placeholder="Your name" aria-label="Your name" maxLength={40}
          onChange={e => setName(e.target.value)} />
        <TeamSelect value={team} taken={taken} label="Your team" onChange={setTeam} />
      </div>
      {!initialInvite && (
        <div className="row first">
          <input value={invite} placeholder="Invite code" aria-label="Invite code" onChange={e => setInvite(e.target.value)} />
        </div>
      )}
      <div className="row">
        <button className="primary" onClick={submit} disabled={busy}>{busy ? "Joining…" : "Join"}</button>
      </div>
      {error && <div className="msg error" role="alert">{error}</div>}
    </section>
  );
}
