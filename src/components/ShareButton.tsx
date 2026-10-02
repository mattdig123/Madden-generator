import { useState } from "react";
import { encodeConfig } from "../core/share";
import type { DraftConfig } from "../core/types";

export function ShareButton({ config }: { config: DraftConfig }) {
  const [status, setStatus] = useState<string | null>(null);
  const share = async () => {
    const url = location.href.split("#")[0] + encodeConfig(config);
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      window.prompt("Copy this link:", url);
      setStatus(null);
    }
  };
  return (
    <>
      <button onClick={share}>Copy share link</button>
      {status && <span className="msg ok inline-msg">{status}</span>}
    </>
  );
}
