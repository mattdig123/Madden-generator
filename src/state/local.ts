// Per-browser memory: the league key this device was given, and which player (if any) is "me" here.
// Everything shared lives in the database; losing this just means opening the league link again.

const KEY_KEY = "madden-league:key";
const ME_KEY = "madden-league:me";

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

export const loadKey = (): string | null => read(KEY_KEY);
export const saveKey = (key: string | null) => write(KEY_KEY, key);

export const loadMe = (): string | null => read(ME_KEY);
export const saveMe = (playerId: string | null) => write(ME_KEY, playerId);
