import { useEffect, useMemo, useState } from "react";
import { HistoryList } from "./components/HistoryList";
import { LiveBoard } from "./components/LiveBoard";
import { Results } from "./components/Results";
import { SetupPanel } from "./components/SetupPanel";
import { generateDraft, type PlayerDraft } from "./core/generate";
import { decodeConfig } from "./core/share";
import { useDrafts } from "./state/useDrafts";

type Tab = "setup" | "results" | "live" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "results", label: "Results" },
  { id: "live", label: "Live board" },
  { id: "history", label: "History" },
];

export function App() {
  const drafts = useDrafts();
  const { working } = drafts.store;
  const [tab, setTab] = useState<Tab>(working ? "results" : "setup");
  const [notice, setNotice] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  // Open a share link, then clear the hash so a reload doesn't replace the working draft again.
  const { openShared } = drafts;
  useEffect(() => {
    const consume = () => {
      if (!location.hash.startsWith("#/d/")) return;
      const config = decodeConfig(location.hash);
      const error = config ? openShared(config) : "That share link is invalid or damaged.";
      history.replaceState(null, "", location.pathname + location.search);
      if (error) {
        setNotice({ text: error, kind: "error" });
      } else {
        setNotice({ text: "Opened a shared draft. Use \"Save to history\" to keep it.", kind: "ok" });
        setTab("results");
      }
    };
    consume();
    window.addEventListener("hashchange", consume);
    return () => window.removeEventListener("hashchange", consume);
  }, [openShared]);

  const config = working?.config;
  const { players, error } = useMemo<{ players: PlayerDraft[]; error: string | null }>(() => {
    if (!config) return { players: [], error: null };
    try {
      return { players: generateDraft(config), error: null };
    } catch (e) {
      return { players: [], error: (e as Error).message };
    }
  }, [config]);

  return (
    <main>
      <header className="hero">
        <div className="logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <ellipse cx="16" cy="16" rx="13" ry="8" transform="rotate(-35 16 16)" />
            <path d="M10.5 21.5l11-11M14 18l2.2-2.2M16.8 20.6l2.2-2.2M11.4 15.4l2.2-2.2" />
          </svg>
        </div>
        <div>
          <h1>Draft Generator</h1>
          <p className="sub">Every player drafts the same positions, each in their own random order.</p>
        </div>
      </header>

      {!drafts.storageOk && (
        <div className="banner error">
          Browser storage is unavailable, so drafts and live-board progress won't be saved after you close this page.
        </div>
      )}
      {notice && <div className={`banner ${notice.kind}`}>{notice.text}</div>}
      {error && <div className="banner error">{error}</div>}

      <nav className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "setup" && <SetupPanel drafts={drafts} onGenerated={() => { setNotice(null); setTab("results"); }} />}
      {tab === "results" && <Results drafts={drafts} players={players} onNeedSetup={() => setTab("setup")} />}
      {tab === "live" && <LiveBoard drafts={drafts} players={players} onNeedSetup={() => setTab("setup")} />}
      {tab === "history" && <HistoryList drafts={drafts} onOpen={() => setTab("results")} />}
    </main>
  );
}
