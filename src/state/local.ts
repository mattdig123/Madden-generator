// Per-browser memory: who this device is, and whether it has unlocked the commissioner tools.
// Everything shared lives in the database; losing this just means signing in again.

const IDENTITY_KEY = "madden-league:identity";
const ADMIN_KEY = "madden-league:admin";

export interface Identity {
  memberId: string;
  token: string;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

export function loadIdentity(): Identity | null {
  try {
    const raw = read(IDENTITY_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.memberId === "string" && typeof v.token === "string" ? v : null;
  } catch { return null; }
}
export const saveIdentity = (id: Identity | null) => write(IDENTITY_KEY, id ? JSON.stringify(id) : null);

export const loadAdmin = (): string | null => read(ADMIN_KEY);
export const saveAdmin = (passcode: string | null) => write(ADMIN_KEY, passcode);
