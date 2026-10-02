import type { CSSProperties, ReactNode } from "react";
import type { PlayerDraft } from "../core/generate";
import { GROUP_NAMES } from "../core/roster";
import { TeamLogo } from "./TeamLogo";
import { GROUPS, type RosterEntry } from "../core/types";

interface Props {
  players: PlayerDraft[];
  /** 1-based round to highlight. */
  highlightRound?: number;
  onReroll?: (name: string) => void;
  /** Changing a player's version replays the entrance animation for that column. */
  version?: (name: string) => string;
  /** Replaces the default position chip. */
  renderCell?: (player: PlayerDraft, round: number, entry: RosterEntry) => ReactNode;
}

export function PosChip({ entry, dim }: { entry: RosterEntry; dim?: boolean }) {
  return <span className={`pos g-${entry.group}${dim ? " dim" : ""}`}>{entry.label}</span>;
}

export function Legend() {
  return (
    <div className="legend" aria-label="Position colors">
      {GROUPS.map(g => (
        <span key={g} className="legend-item">
          <span className={`swatch g-${g}`} />
          {GROUP_NAMES[g]}
        </span>
      ))}
    </div>
  );
}

export function DraftGrid({ players, highlightRound, onReroll, version, renderCell }: Props) {
  const rounds = players[0]?.picks.length ?? 0;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="round">Rd</th>
            {players.map(p => (
              <th key={p.name}>
                <div className="th-player">
                  <TeamLogo team={p.team} size={40} />
                  <span className="th-name">{p.name}</span>
                  {p.team && <span className="th-team">{p.team.name}</span>}
                  {onReroll && <button className="small" onClick={() => onReroll(p.name)}>Re-roll</button>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, i) => (
            <tr key={i} className={[highlightRound === i + 1 && "current", (i + 1) % 5 === 0 && "five"].filter(Boolean).join(" ") || undefined}>
              <td className="round">{i + 1}</td>
              {players.map(p => (
                <td key={version ? version(p.name) : p.name} style={{ "--i": i } as CSSProperties}>
                  {renderCell ? renderCell(p, i + 1, p.picks[i]) : <PosChip entry={p.picks[i]} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
