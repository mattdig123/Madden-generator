import { useEffect, useState } from "react";
import { validateConfig } from "../core/generate";
import { checkRules, validateRoster } from "../core/rules";
import { TEAM_BY_ID, teamLabel } from "../core/teams";
import { siteLink } from "../state/links";
import type { League } from "../state/useLeague";
import { RosterEditor } from "./RosterEditor";
import { RulesEditor } from "./RulesEditor";
import { TeamLogo } from "./TeamLogo";

type Msg = { text: string; kind: "ok" | "error" } | null;

export function Commissioner({ league }: { league: League }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!league.isAdmin) {
    return (
      <section className="panel">
        <h2>Commissioner</h2>
        <p className="hint">Enter the commissioner passcode to manage the league, create the draft and fix picks.</p>
        <div className="row first">
          <input
            type="password" value={passcode} placeholder="Commissioner passcode" aria-label="Commissioner passcode"
            autoComplete="off"
            onChange={e => setPasscode(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void league.adminLogin(passcode).then(setError); }}
          />
          <button className="primary" onClick={() => void league.adminLogin(passcode).then(setError)}>Unlock</button>
        </div>
        {error && <div className="msg error" role="alert">{error}</div>}
      </section>
    );
  }
  return <Tools league={league} />;
}

function Tools({ league }: { league: League }) {
  const { league: row, members, current } = league;
  const [name, setName] = useState(row?.name ?? "");
  const [rules, setRules] = useState(league.rules);
  const [roster, setRoster] = useState(league.roster);
  const [title, setTitle] = useState(`Draft ${new Date().getFullYear()}`);
  const [seed, setSeed] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const [claim, setClaim] = useState<{ member: string; link: string } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    let off = false;
    league.getInvite().then(code => { if (!off) setInvite(code); }).catch(() => { if (!off) setInvite(null); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<string | null>, ok?: string) => {
    const err = await fn();
    setMsg(err ? { text: err, kind: "error" } : ok ? { text: ok, kind: "ok" } : null);
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ text: `${what} copied.`, kind: "ok" });
    } catch {
      setMsg({ text: "Copy failed. Select the text and copy it by hand.", kind: "error" });
    }
  };

  const settingsError = validateRoster(roster) ?? checkRules(rules, roster) ?? (name.trim() ? null : "Give the league a name.");
  const inviteLink = invite ? siteLink({ join: invite }) : "";
  const previewError = current?.status === "preview" ? validateConfig(current.config, { requireTeams: true }) : null;

  return (
    <>
      {msg && <div className={`banner ${msg.kind}`}>{msg.text}</div>}

      <section className="panel">
        <h2>Invite link</h2>
        <p className="hint">Send this to your league. Anyone who opens it can join with their name and team until the draft starts.</p>
        {invite ? (
          <div className="row first">
            <input readOnly value={inviteLink} aria-label="Invite link" className="grow" onFocus={e => e.currentTarget.select()} />
            <button onClick={() => void copy(inviteLink, "Invite link")}>Copy</button>
          </div>
        ) : <p className="hint">Loading…</p>}
      </section>

      <section className="panel">
        <h2>Draft</h2>
        {current?.status === "live" && (
          <>
            <p>"{current.title}" is live (round {current.current_round}). Manage it from the Live board.</p>
            <div className="row first">
              <button onClick={() => { if (confirm("End the draft now? Picks that are still empty stay empty.")) void run(() => league.finishDraft(current.id), "Draft finished."); }}>
                Finish draft early
              </button>
            </div>
          </>
        )}
        {current?.status === "preview" && (
          <>
            <p>A preview of "{current.title}" is ready. Review it on the Draft tab, re-roll if you like, then start it.</p>
            {previewError && <div className="msg error">{previewError}</div>}
            <div className="row first">
              <button onClick={() => void run(() => league.rerollAll(current.id), "Re-rolled everyone.")}>Re-roll all</button>
              <button
                className="primary" disabled={!!previewError}
                onClick={() => { if (confirm("Start the draft? Positions lock and no one can join until it ends.")) void run(() => league.startDraft(current.id)); }}
              >
                Start draft
              </button>
              <button onClick={() => void run(() => league.deleteDraft(current.id), "Preview discarded.")}>Discard preview</button>
            </div>
          </>
        )}
        {(!current || current.status === "complete") && (
          <>
            <p className="hint">
              Creates a draft from the {members.length} member{members.length === 1 ? "" : "s"} who joined, using the rules and roster below.
              You can look it over and re-roll before it starts.
            </p>
            <div className="row first">
              <input value={title} aria-label="Draft title" className="grow" onChange={e => setTitle(e.target.value)} />
              <input value={seed} placeholder="Seed (optional)" aria-label="Seed" onChange={e => setSeed(e.target.value)} />
              <button className="primary" onClick={() => void run(() => league.createPreview(title, seed))}>Create draft preview</button>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Members <span className="count">{members.length}</span></h2>
        {members.length === 0 && <p className="hint">No one has joined yet.</p>}
        {members.map(m => (
          <div key={m.id} className="admin-member">
            <TeamLogo team={TEAM_BY_ID[m.team]} size={30} />
            <div className="grow"><strong>{m.name}</strong> <span className="hint">{TEAM_BY_ID[m.team] ? teamLabel(TEAM_BY_ID[m.team]) : m.team}</span></div>
            <button className="small" onClick={async () => {
              try {
                const token = await league.issueClaim(m.id);
                setClaim({ member: m.name, link: siteLink({ claim: `${m.id}.${token}` }) });
              } catch (e) { setMsg({ text: (e as Error).message, kind: "error" }); }
            }}>Sign-in link</button>
            <button className="small" disabled={current?.status === "live"} onClick={() => {
              if (confirm(`Remove ${m.name} from the league?`)) void run(() => league.removeMember(m.id), `${m.name} removed.`);
            }}>Remove</button>
          </div>
        ))}
        {claim && (
          <div className="claim-box">
            <div className="hint">
              Send this link to {claim.member}. Opening it signs them in on a new device. It replaces their old sign-in, so any other device they used stops working.
            </div>
            <div className="row first">
              <input readOnly value={claim.link} aria-label="Sign-in link" className="grow" onFocus={e => e.currentTarget.select()} />
              <button onClick={() => void copy(claim.link, "Sign-in link")}>Copy</button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>League settings</h2>
        <label htmlFor="league-name">League name</label>
        <input id="league-name" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        <h3>Rules</h3>
        <RulesEditor rules={rules} roster={roster} onChange={setRules} />
        <details>
          <summary><h3 className="inline">Roster</h3></summary>
          <RosterEditor roster={roster} onChange={setRoster} />
        </details>
        <div className="row">
          <button className="primary" disabled={!!settingsError} onClick={() => void run(() => league.saveSettings(name, rules, roster), "Settings saved.")}>
            Save settings
          </button>
        </div>
        <div className="hint">Saving discards any draft preview, since its positions depend on these settings.</div>
        {settingsError && <div className="msg error">{settingsError}</div>}
      </section>

      <div className="row">
        <button onClick={league.adminLogout}>Lock commissioner tools on this device</button>
      </div>
    </>
  );
}
