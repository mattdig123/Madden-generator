import { useEffect, useRef, useState } from "react";
import type { PlayerDraft } from "../core/generate";
import { getPick, isPicked, remainingSlots } from "../core/progress";
import { totalRounds } from "../core/rules";
import type { Progress } from "../core/types";
import { loadShowNames, saveShowNames } from "../state/local";
import type { League } from "../state/useLeague";
import { DraftGrid, Legend, PosChip } from "./DraftGrid";
import { PickInput } from "./PickInput";
import { TeamLogo } from "./TeamLogo";

interface Props {
  league: League;
  players: PlayerDraft[];
  progress: Progress;
  goTo: (tab: "draft" | "setup") => void;
}

export function LiveBoard({ league, players, progress, goTo }: Props) {
  const { draft, me, canEdit } = league;
  const currentRound = draft?.current_round;
  const boardRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const [showNames, setShowNames] = useState(loadShowNames);

  // Keep the round on the clock in view as it moves, including when someone else's pick advances it.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const row = boardRef.current?.querySelector("tr.current");
    row?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    // If you were typing picks, carry on in the first empty box of the new round.
    if (document.activeElement instanceof HTMLInputElement && boardRef.current?.contains(document.activeElement)) {
      const next = [...(row?.querySelectorAll<HTMLInputElement>("input.note") ?? [])].find(i => i.value.trim() === "");
      next?.focus({ preventScroll: true });
    }
  }, [currentRound]);

  if (!draft) {
    return <section className="panel"><p>No draft yet.</p></section>;
  }
  if (draft.status === "preview") {
    return (
      <section className="panel">
        <p>The draft hasn't started yet. The live board opens when the draft is started.</p>
        <button onClick={() => goTo("draft")}>See the positions</button>
      </section>
    );
  }

  const rounds = totalRounds(draft.config.roster);
  const live = draft.status === "live";
  const finished = draft.status === "complete";
  const config = draft.config;

  return (
    <>
      <section className="panel">
        <div className="row first">
          {canEdit && live ? (
            <>
              <button onClick={() => void league.setRound(draft.id, draft.current_round - 1)} disabled={draft.current_round <= 1}>
                Previous round
              </button>
              <strong className="clock">Round {draft.current_round} of {rounds}</strong>
              <button className="primary" onClick={() => void league.setRound(draft.id, draft.current_round + 1)} disabled={draft.current_round >= rounds}>
                Next round
              </button>
            </>
          ) : (
            <>
              {live && <span className="live-pill"><span className="live-dot" />Live</span>}
              <strong className="clock">{finished ? "Draft complete" : `Round ${draft.current_round} of ${rounds}`}</strong>
            </>
          )}
        </div>
        {canEdit && live && (
          <label className="check">
            <input type="checkbox" checked={draft.auto_advance} onChange={e => void league.setAutoAdvance(draft.id, e.target.checked)} />
            Auto-advance when every player has a pick
          </label>
        )}
        {canEdit && (
          <label className="check">
            <input
              type="checkbox" checked={showNames}
              onChange={e => { setShowNames(e.target.checked); saveShowNames(e.target.checked); }}
            />
            Show player-name boxes (optional)
          </label>
        )}
        <div className="hint">
          {canEdit
            ? showNames
              ? "Tap a position to mark it picked, or type who was taken and press Enter. Either one counts, and everyone watching sees it right away."
              : "Tap a position when it has been picked. Everyone watching sees it right away."
            : live
              ? "You're watching this draft live. Picks appear as people make them."
              : "This draft is over. Browse the picks below."}
        </div>
      </section>

      <Legend />
      <div ref={boardRef}>
        <DraftGrid
          players={players}
          mine={me?.name}
          highlightRound={live ? draft.current_round : undefined}
          version={name => `${config.seed}:${config.rerolls[name] ?? 0}:${name}`}
          renderCell={(p, round, entry) => {
            const pick = getPick(progress, p.name, round);
            const picked = isPicked(pick);
            return (
              <div className={`live-cell${picked ? " picked" : ""}`}>
                {canEdit ? (
                  <button
                    className="chip-btn"
                    aria-pressed={picked}
                    aria-label={`${p.name} round ${round} ${entry.label}${picked ? ", picked" : ""}`}
                    title={pick.note ? "Clear the name below to undo this pick" : picked ? "Tap to undo" : "Tap to mark as picked"}
                    onClick={() => { if (!pick.note) void league.markPick(draft.id, p.name, round, !picked); }}
                  >
                    <PosChip entry={entry} dim={picked} />
                  </button>
                ) : (
                  <PosChip entry={entry} dim={picked} />
                )}
                {canEdit && showNames && (
                  <PickInput
                    value={pick.note ?? ""}
                    picked={!!pick.note}
                    label={`${p.name} round ${round} ${entry.label}: player taken`}
                    onCommit={text => void league.setPick(draft.id, p.name, round, text)}
                  />
                )}
                {!(canEdit && showNames) && pick.note && (
                  <div className="note readonly picked" title={pick.note}>{pick.note}</div>
                )}
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
