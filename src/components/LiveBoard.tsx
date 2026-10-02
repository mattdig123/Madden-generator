import { useEffect, useRef } from "react";
import type { PlayerDraft } from "../core/generate";
import { getPick, isPicked, remainingSlots } from "../core/progress";
import { totalRounds } from "../core/rules";
import type { Progress } from "../core/types";
import type { League } from "../state/useLeague";
import { DraftGrid, Legend, PosChip } from "./DraftGrid";
import { PickInput } from "./PickInput";
import { TeamLogo } from "./TeamLogo";

interface Props {
  league: League;
  players: PlayerDraft[];
  progress: Progress;
  goTo: (tab: "draft" | "commissioner") => void;
}

export function LiveBoard({ league, players, progress, goTo }: Props) {
  const { draft, me, isAdmin } = league;
  const currentRound = draft?.current_round;
  const boardRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

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
        <p>The draft hasn't started yet. The live board opens when the commissioner starts it.</p>
        <button onClick={() => goTo("draft")}>See the positions</button>
      </section>
    );
  }

  const rounds = totalRounds(draft.config.roster);
  const live = draft.status === "live";
  const finished = draft.status === "complete";
  const config = draft.config;

  const canEdit = (player: string, round: number) => {
    if (isAdmin) return true;
    return live && !!me && me.name === player && round <= draft.current_round;
  };

  return (
    <>
      <section className="panel">
        <div className="row first">
          {isAdmin && live ? (
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
        {isAdmin && live && (
          <label className="check">
            <input type="checkbox" checked={draft.auto_advance} onChange={e => void league.setAutoAdvance(draft.id, e.target.checked)} />
            Auto-advance when everyone has entered a pick
          </label>
        )}
        <div className="hint">
          {isAdmin
            ? "You're the commissioner, so you can enter or fix anyone's pick."
            : me && live
              ? "Type your pick under your position and press Enter. Everyone sees it right away."
              : me && !live
                ? "This draft is over, so picks are locked."
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
                <PosChip entry={entry} dim={picked} />
                {canEdit(p.name, round) ? (
                  <PickInput
                    value={pick.note ?? ""}
                    picked={picked}
                    label={`${p.name} round ${round} ${entry.label}: player taken`}
                    onCommit={text => void (isAdmin ? league.adminSetPick(draft.id, p.name, round, text) : league.submitPick(round, text))}
                  />
                ) : (
                  <div className={`note readonly${picked ? " picked" : ""}`} title={pick.note}>
                    {picked ? pick.note : "—"}
                  </div>
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
