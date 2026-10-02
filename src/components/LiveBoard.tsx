import type { PlayerDraft } from "../core/generate";
import { getPick, pickKey, remainingSlots } from "../core/progress";
import type { Drafts } from "../state/useDrafts";
import { DraftGrid, PosChip } from "./DraftGrid";

interface Props {
  drafts: Drafts;
  players: PlayerDraft[];
  onNeedSetup: () => void;
}

export function LiveBoard({ drafts, players, onNeedSetup }: Props) {
  const working = drafts.store.working;
  if (!working) {
    return (
      <section className="panel">
        <p>Generate a draft first.</p>
        <button className="primary" onClick={onNeedSetup}>Go to Setup</button>
      </section>
    );
  }

  const { progress, config } = working;
  const rounds = players[0]?.picks.length ?? 0;
  const goTo = (round: number) =>
    drafts.setProgress(p => ({ ...p, currentRound: Math.min(Math.max(round, 1), rounds) }));
  const finished = players.every(p => p.picks.every((_, i) => getPick(progress, p.name, i + 1).done));

  return (
    <>
      <section className="panel">
        <div className="row first">
          <button onClick={() => goTo(progress.currentRound - 1)} disabled={progress.currentRound <= 1}>Previous round</button>
          <strong className="clock">{finished ? "Draft complete" : `Round ${progress.currentRound} of ${rounds}`}</strong>
          <button className="primary" onClick={() => goTo(progress.currentRound + 1)} disabled={progress.currentRound >= rounds}>
            Next round
          </button>
        </div>
        <div className="hint">Tap a position to mark it picked. Add the player you took in the box underneath.</div>
      </section>

      <DraftGrid
        players={players}
        highlightRound={progress.currentRound}
        renderCell={(p, round, entry) => {
          const key = pickKey(p.name, round);
          const pick = getPick(progress, p.name, round);
          return (
            <div className="live-cell">
              <button
                className={`chip-btn${pick.done ? " done" : ""}`}
                aria-pressed={pick.done}
                aria-label={`${p.name} round ${round} ${entry.label}${pick.done ? ", picked" : ""}`}
                onClick={() => drafts.setPick(key, { ...pick, done: !pick.done })}
              >
                <PosChip entry={entry} dim={pick.done} />
              </button>
              <input
                className="note" placeholder="Player taken" value={pick.note ?? ""} aria-label={`${p.name} round ${round} player taken`}
                onChange={e => drafts.setPick(key, { ...pick, note: e.target.value })}
              />
            </div>
          );
        }}
      />

      <section className="panel remaining">
        <h2>Still needed</h2>
        {players.map(p => {
          const left = remainingSlots(p.picks, p.name, progress, config.roster);
          return (
            <div className="remaining-row" key={p.name}>
              <strong>{p.name}</strong>
              {left.length === 0
                ? <span className="hint">All filled</span>
                : left.map(r => <span key={r.label} className="tally">{r.label} × {r.left}</span>)}
            </div>
          );
        })}
      </section>
    </>
  );
}
