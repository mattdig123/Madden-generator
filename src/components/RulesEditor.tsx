import { uid } from "../core/id";
import { checkRules } from "../core/rules";
import type { RosterEntry, Rule } from "../core/types";

interface Props {
  rules: Rule[];
  roster: RosterEntry[];
  onChange: (rules: Rule[]) => void;
}

const toRound = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));

export function RulesEditor({ rules, roster, onChange }: Props) {
  const error = checkRules(rules, roster);
  const patch = (id: string, change: Partial<Rule>) =>
    onChange(rules.map(r => (r.id === id ? { ...r, ...change } : r)));

  return (
    <div>
      <p className="hint">
        Each rule limits every slot of that position to a window of rounds. Leave a box blank for no limit.
      </p>
      {rules.length === 0 && <p className="hint">No rules. Every position can land in any round.</p>}
      {rules.map(r => (
        <div className="rule-row" key={r.id}>
          <select value={r.label} onChange={e => patch(r.id, { label: e.target.value })} aria-label="Position">
            {!roster.some(x => x.label === r.label) && <option value={r.label}>{r.label} (missing)</option>}
            {roster.map(x => <option key={x.label} value={x.label}>{x.label}</option>)}
          </select>
          <label>
            no earlier than round
            <input type="number" min={1} value={r.minRound ?? ""} onChange={e => patch(r.id, { minRound: toRound(e.target.value) })} />
          </label>
          <label>
            no later than round
            <input type="number" min={1} value={r.maxRound ?? ""} onChange={e => patch(r.id, { maxRound: toRound(e.target.value) })} />
          </label>
          <button className="small" onClick={() => onChange(rules.filter(x => x.id !== r.id))}>Remove</button>
        </div>
      ))}
      <div className="row">
        <button onClick={() => onChange([...rules, { id: uid(), label: roster[0]?.label ?? "", maxRound: 10 }])}>Add rule</button>
      </div>
      {error && <div className="msg error">{error}</div>}
    </div>
  );
}
