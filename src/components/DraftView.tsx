import { useState } from "react";
import type { PlayerDraft } from "../core/generate";
import { asText } from "../core/text";
import type { League } from "../state/useLeague";
import { DraftGrid, Legend } from "./DraftGrid";

interface Props {
  league: League;
  players: PlayerDraft[];
}

export function DraftView({ league, players }: Props) {
  const { draft, isAdmin, me } = league;
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  if (!draft) {
    return <section className="panel"><p>No draft yet. The commissioner will create one once everyone has joined.</p></section>;
  }

  const { config } = draft;
  const preview = draft.status === "preview";
  const run = async (fn: () => Promise<string | null>, ok?: string) => {
    const err = await fn();
    setMsg(err ? { text: err, kind: "error" } : ok ? { text: ok, kind: "ok" } : null);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText(players));
      setMsg({ text: "Copied to clipboard.", kind: "ok" });
    } catch {
      setMsg({ text: "Copy failed. Your browser blocked clipboard access.", kind: "error" });
    }
  };
  const ruleText = config.rules.map(r => {
    const parts = [];
    if (r.minRound) parts.push(`round ${r.minRound}+`);
    if (r.maxRound) parts.push(`by round ${r.maxRound}`);
    return `${r.label} ${parts.join(", ")}`;
  });

  return (
    <>
      <section className="panel">
        <div className="row first">
          <h2 className="grow">{draft.title}</h2>
          {draft.status === "live" && <span className="live-pill"><span className="live-dot" />Live</span>}
          {preview && <span className="badge warn">Preview</span>}
          {draft.status === "complete" && <span className="badge">Complete</span>}
        </div>
        {preview && (
          <p className="hint">Positions can still change. They lock when the commissioner starts the draft.</p>
        )}
        <div className="hint">
          {players.length} players · {players[0]?.picks.length} rounds
          {ruleText.length > 0 && <> · Rules: {ruleText.join("; ")}</>}
        </div>
      </section>

      <div className="row controls first">
        {isAdmin && preview && (
          <>
            <button onClick={() => run(() => league.rerollAll(draft.id), "Re-rolled everyone.")}>Re-roll all</button>
            <button
              className="primary"
              onClick={() => {
                if (confirm("Start the draft? Positions lock and no one can join until it ends.")) void run(() => league.startDraft(draft.id));
              }}
            >
              Start draft
            </button>
          </>
        )}
        <button onClick={copy}>Copy as text</button>
        <button onClick={() => window.print()}>Print</button>
        {msg && <span className={`msg ${msg.kind} inline-msg`}>{msg.text}</span>}
      </div>

      <Legend />
      <DraftGrid
        players={players}
        mine={me?.name}
        highlightRound={draft.status === "live" ? draft.current_round : undefined}
        onReroll={isAdmin && preview ? name => void run(() => league.rerollPlayer(draft.id, name)) : undefined}
        version={name => `${config.seed}:${config.rerolls[name] ?? 0}:${name}`}
      />
    </>
  );
}
