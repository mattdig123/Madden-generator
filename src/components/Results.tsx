import { useState } from "react";
import type { PlayerDraft } from "../core/generate";
import { asText } from "../core/text";
import type { Drafts } from "../state/useDrafts";
import { DraftGrid, Legend } from "./DraftGrid";
import { ShareButton } from "./ShareButton";

interface Props {
  drafts: Drafts;
  players: PlayerDraft[];
  onNeedSetup: () => void;
}

export function Results({ drafts, players, onNeedSetup }: Props) {
  const working = drafts.store.working;
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  if (!working) {
    return (
      <section className="panel">
        <p>No draft yet.</p>
        <button className="primary" onClick={onNeedSetup}>Go to Setup</button>
      </section>
    );
  }

  const { config } = working;
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
          <input
            className="title-input" value={working.title} aria-label="Draft title"
            onChange={e => drafts.setTitle(e.target.value)}
          />
          {working.inHistory
            ? <span className="badge">Saved in history</span>
            : <button className="primary" onClick={drafts.saveToHistory}>Save to history</button>}
        </div>
        <div className="hint">
          Seed <code>{config.seed}</code> · {players.length} players · {players[0]?.picks.length} rounds
          {ruleText.length > 0 && <> · Rules: {ruleText.join("; ")}</>}
        </div>
      </section>

      <div className="row controls first">
        <button onClick={drafts.rerollAll}>Re-roll all</button>
        <button onClick={copy}>Copy as text</button>
        <ShareButton config={config} />
        <button onClick={() => window.print()}>Print</button>
        {msg && <span className={`msg ${msg.kind} inline-msg`}>{msg.text}</span>}
      </div>
      <Legend />
      <DraftGrid players={players} onReroll={drafts.rerollPlayer} highlightRound={working.progress.currentRound} />
    </>
  );
}
