import { DEFAULT_ROSTER, DEFAULT_RULES } from "./roster";
import { GROUPS, type DraftConfig, type Group, type RosterEntry, type Rule } from "./types";

const VERSION = 1;
const PREFIX = "#/d/";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (data.length % 4)) % 4);
  const bin = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

const sameAsDefault = (value: unknown, fallback: unknown) => JSON.stringify(value) === JSON.stringify(fallback);

/** The default roster and rules are left out of the link to keep it short. */
export function encodeConfig(config: DraftConfig): string {
  const payload: Record<string, unknown> = { v: VERSION, s: config.seed, n: config.names };
  const rerolls = Object.fromEntries(Object.entries(config.rerolls).filter(([, c]) => c > 0));
  if (Object.keys(rerolls).length > 0) payload.x = rerolls;
  if (!sameAsDefault(config.rules, DEFAULT_RULES)) payload.u = config.rules;
  if (!sameAsDefault(config.roster, DEFAULT_ROSTER)) payload.r = config.roster;
  return PREFIX + toBase64Url(JSON.stringify(payload));
}

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

function parseRoster(value: unknown): RosterEntry[] | null {
  if (!Array.isArray(value)) return null;
  const out: RosterEntry[] = [];
  for (const r of value) {
    if (!r || typeof r.label !== "string" || !isInt(r.count) || !GROUPS.includes(r.group as Group)) return null;
    out.push({ label: r.label, count: r.count, group: r.group });
  }
  return out;
}

function parseRules(value: unknown): Rule[] | null {
  if (!Array.isArray(value)) return null;
  const out: Rule[] = [];
  for (const r of value) {
    if (!r || typeof r.id !== "string" || typeof r.label !== "string") return null;
    if (r.minRound !== undefined && !isInt(r.minRound)) return null;
    if (r.maxRound !== undefined && !isInt(r.maxRound)) return null;
    out.push({ id: r.id, label: r.label, minRound: r.minRound, maxRound: r.maxRound });
  }
  return out;
}

/** Returns null if the hash is not a valid share link. */
export function decodeConfig(hash: string): DraftConfig | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const p = JSON.parse(fromBase64Url(hash.slice(PREFIX.length)));
    if (p.v !== VERSION || typeof p.s !== "string") return null;
    if (!Array.isArray(p.n) || !p.n.every((n: unknown) => typeof n === "string")) return null;
    const roster = p.r === undefined ? DEFAULT_ROSTER : parseRoster(p.r);
    const rules = p.u === undefined ? DEFAULT_RULES : parseRules(p.u);
    if (!roster || !rules) return null;
    const rerolls: Record<string, number> = {};
    if (p.x && typeof p.x === "object") {
      for (const [k, v] of Object.entries(p.x)) if (isInt(v) && v > 0) rerolls[k] = v;
    }
    return { seed: p.s, names: p.n, rerolls, rules, roster };
  } catch {
    return null;
  }
}
