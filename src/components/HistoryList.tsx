import { useRef, useState } from "react";
import type { Drafts } from "../state/useDrafts";

interface Props {
  drafts: Drafts;
  onOpen: () => void;
}

export function HistoryList({ drafts, onOpen }: Props) {
  const { saved, working } = drafts.store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ v: 1, saved }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "madden-drafts.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    const res = drafts.importDrafts(await file.text());
    setMsg(res.error ? { text: res.error, kind: "error" } : { text: `Imported ${res.count} draft(s).`, kind: "ok" });
  };

  return (
    <>
      <section className="panel">
        <div className="row first">
          <button onClick={exportAll} disabled={saved.length === 0}>Export all</button>
          <button onClick={() => fileRef.current?.click()}>Import</button>
          <input
            ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
          {msg && <span className={`msg ${msg.kind} inline-msg`}>{msg.text}</span>}
        </div>
        <div className="hint">
          Drafts are saved in this browser only. Export a file to back them up or move them to another device.
        </div>
      </section>

      {saved.length === 0 && <section className="panel"><p>Nothing saved yet. Use "Save to history" on the Results tab.</p></section>}
      {saved.map(d => (
        <section className="panel history-item" key={d.id}>
          <div>
            <strong>{d.title}</strong>
            {working?.id === d.id && <span className="badge">Open</span>}
            <div className="hint">
              {new Date(d.createdAt).toLocaleString()} · {d.config.names.join(", ")}
            </div>
          </div>
          <div className="row first">
            <button className="primary" onClick={() => { drafts.openSaved(d.id); onOpen(); }}>Open</button>
            <button onClick={() => drafts.duplicateSaved(d.id)}>Duplicate</button>
            <button onClick={() => { if (confirm(`Delete "${d.title}"?`)) drafts.deleteSaved(d.id); }}>Delete</button>
          </div>
        </section>
      ))}
    </>
  );
}
