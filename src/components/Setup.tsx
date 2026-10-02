import { useState } from "react";
import { validateConfig } from "../core/generate";
import { MIN_KEY_LENGTH, newLeagueKey } from "../core/rng";
import { checkRules, validateRoster } from "../core/rules";
import { siteLink } from "../state/links";
import type { League } from "../state/useLeague";
import { RosterEditor } from "./RosterEditor";
import { RulesEditor } from "./RulesEditor";

type Msg = { text: string; kind: "ok" | "error" } | null;

export function Setup({ league }: { league: League }) {
  if (!league.canEdit) return <KeyPrompt league={league} />;
  return <Tools league={league} />;
}

function KeyPrompt({ league }: { league: League }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => setError(await league.applyKey(value));

  return (
    <section className="panel">
      <h2>Make changes</h2>
      <p className="hint">
        Anyone with the league link can add players, change settings, start the draft and enter picks.
        Open the link you were sent, or paste its key here. Without it you can still watch everything live.
      </p>
      <div className="row first">
        <input
          type="password" value={value} placeholder="League key" aria-label="League key" autoComplete="off"
          className="grow" onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void submit(); }}
        />
        <button className="primary" onClick={submit}>Use key</button>
      </div>
      {error && <div className="msg error" role="alert">{error}</div>}
    </section>
  );
}

function Tools({ league }: { league: League }) {
  const { league: row, players, current, key } = league;
  const [name, setName] = useState(row?.name ?? "");
  const [rules, setRules] = useState(league.rules);
  const [roster, setRoster] = useState(league.roster);
  const [title, setTitle] = useState(`Draft ${new Date().getFullYear()}`);
  const [seed, setSeed] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

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
  const link = key ? siteLink({ key }) : "";
  const weakKey = !!key && key.length < MIN_KEY_LENGTH;
  const previewError = current?.status === "preview" ? validateConfig(current.config, { requireTeams: true }) : null;

  return (
    <>
      {msg && <div className={`banner ${msg.kind}`}>{msg.text}</div>}

      <section className="panel">
        <h2>League link</h2>
        <p className="hint">
          Send this to everyone who should be able to add players and enter picks. Anyone with it can change the league, so share it only with people you trust.
          Everyone else can still watch by using the plain site address.
        </p>
        {weakKey && (
          <div className="msg error">
            This league's key is short enough to guess. Make a new link below before sharing it widely.
          </div>
        )}
        <div className="row first">
          <input readOnly value={link} aria-label="League link" className="grow" onFocus={e => e.currentTarget.select()} />
          <button onClick={() => void copy(link, "League link")}>Copy</button>
        </div>
        <div className="row first">
          <button onClick={() => {
            if (confirm("Make a new league link? The old link and key stop working right away, so anyone who had it will need the new one.")) {
              void run(() => league.rotateKey(newLeagueKey()), "New league link made. Send it to everyone who needs it.");
            }
          }}>
            Make a new league link
          </button>
          <button onClick={league.forgetKey}>Stop editing on this device</button>
        </div>
      </section>

      <section className="panel">
        <h2>Draft</h2>
        {current?.status === "live" && (
          <>
            <p>"{current.title}" is live (round {current.current_round}). Run it from the Live board.</p>
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
                onClick={() => { if (confirm("Start the draft? Positions lock and players can't be changed until it ends.")) void run(() => league.startDraft(current.id)); }}
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
              Creates a draft from the {players.length} player{players.length === 1 ? "" : "s"} on the Players tab, using the rules and roster below.
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
    </>
  );
}
