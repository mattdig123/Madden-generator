import { DEFAULT_ROSTER, GROUP_NAMES } from "../core/roster";
import { totalRounds, validateRoster } from "../core/rules";
import { GROUPS, type Group, type RosterEntry } from "../core/types";

interface Props {
  roster: RosterEntry[];
  onChange: (roster: RosterEntry[]) => void;
}

export function RosterEditor({ roster, onChange }: Props) {
  const error = validateRoster(roster);
  const patch = (i: number, change: Partial<RosterEntry>) =>
    onChange(roster.map((r, j) => (j === i ? { ...r, ...change } : r)));

  return (
    <div>
      <p className="hint">{totalRounds(roster)} positions, so the draft is {totalRounds(roster)} rounds.</p>
      {roster.map((r, i) => (
        <div className="roster-row" key={i}>
          <input value={r.label} onChange={e => patch(i, { label: e.target.value })} aria-label="Position name" />
          <input
            type="number" min={1} value={r.count} aria-label="Count"
            onChange={e => patch(i, { count: Number(e.target.value) })}
          />
          <select value={r.group} onChange={e => patch(i, { group: e.target.value as Group })} aria-label="Color group">
            {GROUPS.map(g => <option key={g} value={g}>{GROUP_NAMES[g]}</option>)}
          </select>
          <span className={`pos g-${r.group}`} style={{ minWidth: 70 }}>{r.label || "?"}</span>
          <button className="small" onClick={() => onChange(roster.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div className="row">
        <button onClick={() => onChange([...roster, { label: "", count: 1, group: "flex" }])}>Add position</button>
        <button onClick={() => onChange(DEFAULT_ROSTER.map(r => ({ ...r })))}>Reset to default</button>
      </div>
      {error && <div className="msg error">{error}</div>}
    </div>
  );
}
