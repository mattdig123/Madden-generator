import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  label: string;
  picked: boolean;
  /** Called with the finished text when the box loses focus or Enter is pressed. */
  onCommit: (value: string) => void;
}

/**
 * Holds typing locally so a pick only counts (and the round only advances) once the name is
 * finished, not on the first keystroke.
 */
export function PickInput({ value, label, picked, onCommit }: Props) {
  const [text, setText] = useState(value);
  // The latest typed text, readable even if a blur lands before React has re-rendered.
  const latest = useRef(value);
  useEffect(() => { latest.current = value; setText(value); }, [value]);

  const commit = () => { if (latest.current !== value) onCommit(latest.current); };

  return (
    <input
      className={`note${picked ? " picked" : ""}`}
      placeholder="Player taken"
      value={text}
      aria-label={label}
      enterKeyHint="next"
      onChange={e => { latest.current = e.target.value; setText(e.target.value); }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key !== "Enter") return;
        commit();
        // Hop to the next empty box in this round so picks can be typed in order.
        const inputs = [...(e.currentTarget.closest("tr")?.querySelectorAll<HTMLInputElement>("input.note") ?? [])];
        const next = inputs.slice(inputs.indexOf(e.currentTarget) + 1).find(i => i.value.trim() === "");
        // On the last box, keep focus: if that finished the round, the board moves it to the next round.
        next?.focus();
      }}
    />
  );
}
