import type { PlayerDraft } from "./generate";

/** Plain-text grid for copy/paste (rounds down, players across). */
export function asText(players: PlayerDraft[]): string {
  const rounds = players[0]?.picks.length ?? 0;
  const rows = [["Rd", ...players.map(p => p.name)]];
  for (let r = 0; r < rounds; r++) rows.push([String(r + 1), ...players.map(p => p.picks[r].label)]);
  const widths = rows[0].map((_, c) => Math.max(...rows.map(row => row[c].length)));
  return rows.map(row => row.map((cell, c) => cell.padEnd(widths[c])).join("  ").trimEnd()).join("\n");
}
