import { useState } from "react";
import type { Drafts } from "../state/useDrafts";
import { RosterEditor } from "./RosterEditor";
import { RulesEditor } from "./RulesEditor";

interface Props {
  drafts: Drafts;
  onGenerated: () => void;
}

export function SetupPanel({ drafts, onGenerated }: Props) {
  const { setup } = drafts.store;
  const [error, setError] = useState<string | null>(null);

  const generate = () => {
    const err = drafts.generate();
    setError(err);
    if (!err) onGenerated();
  };

  return (
    <>
      <section className="panel">
        <h2><span className="step">1</span>Players</h2>
        <label htmlFor="names" className="sr-only">Players (one per line, or comma-separated)</label>
        <textarea
          id="names"
          value={setup.namesText}
          placeholder={"Matt\nDave\nChris\nSam"}
          onChange={e => drafts.setSetup({ namesText: e.target.value })}
        />
        <div className="hint">One name per line, or comma-separated. Leave blank and enter a number to use Player 1, Player 2, etc.</div>
        <div className="row">
          <input
            type="number" min={2} max={32} value={setup.count} aria-label="Number of players" className="narrow"
            onChange={e => drafts.setSetup({ count: Number(e.target.value) })}
          />
          <input
            value={setup.seed} placeholder="Seed (optional)" aria-label="Seed"
            onChange={e => drafts.setSetup({ seed: e.target.value })}
          />
          <button className="primary" onClick={generate}>Generate</button>
        </div>
        <div className="hint">The same seed, names, rules and roster always give the same draft. Blank picks a random seed.</div>
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
