import { useState } from "react";
import { MAX_PLAYERS } from "../core/rules";
import { blankPlayer, type SetupPlayer } from "../state/storage";
import type { Drafts } from "../state/useDrafts";
import { PlayerRow } from "./PlayerRow";
import { RosterEditor } from "./RosterEditor";
import { RulesEditor } from "./RulesEditor";

const MIN_PLAYERS = 2;

interface Props {
  drafts: Drafts;
  onGenerated: () => void;
}

export function SetupPanel({ drafts, onGenerated }: Props) {
  const { setup } = drafts.store;
  const [error, setError] = useState<string | null>(null);

  const updatePlayer = (i: number, patch: Partial<SetupPlayer>) =>
    drafts.setSetup({ players: setup.players.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const generate = () => {
    const err = drafts.generate();
    setError(err);
    if (!err) onGenerated();
  };

  return (
    <>
      <section className="panel">
        <h2><span className="step">1</span>Players</h2>
        <p className="hint players-hint">Add each person and the team they are drafting for. Each team can only be used once.</p>
        {setup.players.map((player, i) => (
          <PlayerRow
            key={player.id}
            index={i}
            player={player}
            taken={new Set(setup.players.map(p => p.team).filter(Boolean))}
            canRemove={setup.players.length > MIN_PLAYERS}
            onChange={patch => updatePlayer(i, patch)}
            onRemove={() => drafts.setSetup({ players: setup.players.filter((_, j) => j !== i) })}
          />
        ))}
        <div className="row">
          <button onClick={() => drafts.setSetup({ players: [...setup.players, blankPlayer()] })} disabled={setup.players.length >= MAX_PLAYERS}>
            Add player
          </button>
          <input
            value={setup.seed} placeholder="Seed (optional)" aria-label="Seed"
            onChange={e => drafts.setSetup({ seed: e.target.value })}
          />
          <button className="primary" onClick={generate}>Generate</button>
        </div>
        <div className="hint">Leave a name blank to use Player 1, Player 2, etc. The same seed, players, rules and roster always give the same draft. A blank seed picks a random one.</div>
        {error && <div className="msg error" role="alert">{error}</div>}
      </section>

      <section className="panel">
        <h2><span className="step">2</span>Rules</h2>
        <RulesEditor rules={setup.rules} roster={setup.roster} onChange={rules => drafts.setSetup({ rules })} />
      </section>

      <section className="panel">
        <details>
          <summary><h2 className="inline"><span className="step">3</span>Roster</h2></summary>
          <RosterEditor roster={setup.roster} onChange={roster => drafts.setSetup({ roster })} />
        </details>
      </section>

      <div className="row">
        <button onClick={drafts.resetSetup}>Reset setup to defaults</button>
      </div>
    </>
  );
}
