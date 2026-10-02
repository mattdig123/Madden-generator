import { useRef, useState } from "react";
import type { League } from "../state/useLeague";
import { TeamSelect } from "./TeamSelect";

/** Adds one player at a time and stays open, so a whole league can be entered in a row. */
export function AddPlayerForm({ league }: { league: League }) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const taken = new Set(league.players.map(p => p.team));
  const live = league.current?.status === "live";

  const submit = async () => {
    if (!name.trim()) return setError("Enter a name.");
    if (!team) return setError("Choose the team they are drafting for.");
    setBusy(true);
    const err = await league.addPlayer(name.trim(), team);
    setBusy(false);
    setError(err);
    if (!err) {
      setName("");
      setTeam("");
      nameRef.current?.focus();
    }
  };

  if (live) {
    return <p className="hint">The draft is under way, so players can't be added or changed until it ends.</p>;
  }

  return (
    <div>
      <div className="player-row" onKeyDown={e => { if (e.key === "Enter") void submit(); }}>
        <input
          ref={nameRef} className="player-name" value={name} placeholder="Name" aria-label="Player name" maxLength={40}
          onChange={e => setName(e.target.value)}
        />
        <TeamSelect value={team} taken={taken} label="Team" onChange={setTeam} />
        <button className="primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add player"}</button>
      </div>
      {error && <div className="msg error" role="alert">{error}</div>}
    </div>
  );
}
