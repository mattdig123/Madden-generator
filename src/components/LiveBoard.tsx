import { useEffect, useRef } from "react";
import type { PlayerDraft } from "../core/generate";
import { getPick, isPicked, remainingSlots } from "../core/progress";
import type { Drafts } from "../state/useDrafts";
import { DraftGrid, Legend, PosChip } from "./DraftGrid";
import { PickInput } from "./PickInput";
import { TeamLogo } from "./TeamLogo";

interface Props {
  drafts: Drafts;
  players: PlayerDraft[];
  onNeedSetup: () => void;
}

export function LiveBoard({ drafts, players, onNeedSetup }: Props) {
  const working = drafts.store.working;
  const currentRound = working?.progress.currentRound;
  const boardRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Keep the round on the clock in view as it moves (including auto-advance).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const row = boardRef.current?.querySelector("tr.current");
    row?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    // If someone was typing picks, carry on in the first empty box of the new round.
    if (document.activeElement instanceof HTMLInputElement && boardRef.current?.contains(document.activeElement)) {
      const next = [...(row?.querySelectorAll<HTMLInputElement>("input.note") ?? [])].find(i => i.value.trim() === "");
      next?.focus({ preventScroll: true });
    }
  }, [currentRound]);

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
  const finished = players.every(p => p.picks.every((_, i) => isPicked(getPick(progress, p.name, i + 1))));

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
        <label className="check">
          <input
            type="checkbox"
            checked={progress.autoAdvance !== false}
            onChange={e => drafts.setProgress(p => ({ ...p, autoAdvance: e.target.checked ? undefined : false }))}
          />
          Auto-advance when everyone has entered a pick
        </label>
        <div className="hint">Type the player each person took under their position and press Enter. A pick counts once a name is entered.</div>
      </section>

      <Legend />
      <div ref={boardRef}>
        <DraftGrid
          players={players}
          highlightRound={progress.currentRound}
          version={name => `${config.seed}:${config.rerolls[name] ?? 0}:${name}`}
          renderCell={(p, round, entry) => {
            const pick = getPick(progress, p.name, round);
            const picked = isPicked(pick);
            return (
              <div className={`live-cell${picked ? " picked" : ""}`}>
                <PosChip entry={entry} dim={picked} />
                <PickInput
                  value={pick.note ?? ""}
                  picked={picked}
                  label={`${p.name} round ${round} ${entry.label}: player taken`}
                  onCommit={text => drafts.setPick(p.name, round, text)}
                />
              </div>
            );
          }}
        />
      </div>

      <section className="panel remaining">
        <h2>Still needed</h2>
        {players.map(p => {
          const left = remainingSlots(p.picks, p.name, progress, config.roster);
          return (
            <div className="remaining-row" key={p.name}>
              <strong className="who"><TeamLogo team={p.team} size={22} />{p.name}</strong>
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
