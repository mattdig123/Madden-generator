import { MAX_PLAYERS } from "./rules";

/** Names split on newlines/commas. With no names typed, falls back to "Player N" for `count` players. */
export function parseNames(text: string, count: number): { names?: string[]; error?: string } {
  const raw = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  if (raw.length === 0) {
    if (!Number.isInteger(count) || count < 2 || count > MAX_PLAYERS) {
      return { error: `Enter names, or a player count between 2 and ${MAX_PLAYERS}.` };
    }
    return { names: Array.from({ length: count }, (_, i) => `Player ${i + 1}`) };
  }
  return { names: raw };
}
