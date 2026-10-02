import { DIVISIONS, TEAM_BY_ID, teamLabel } from "../core/teams";
import { TeamLogo } from "./TeamLogo";

interface Props {
  value: string;
  /** Team ids that can't be chosen (already used by someone else). */
  taken: Set<string>;
  label: string;
  onChange: (team: string) => void;
}

/** A team dropdown grouped by division, with a logo preview beside it. */
export function TeamSelect({ value, taken, label, onChange }: Props) {
  return (
    <div className="team-pick">
      <span className="team-slot">
        <TeamLogo team={TEAM_BY_ID[value]} size={30} />
      </span>
      <select value={value} aria-label={label} onChange={e => onChange(e.target.value)}>
        <option value="">Choose team…</option>
        {DIVISIONS.map(group => (
          <optgroup key={group.label} label={group.label}>
            {group.teams.map(team => (
              <option key={team.id} value={team.id} disabled={taken.has(team.id) && team.id !== value}>
                {teamLabel(team)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
