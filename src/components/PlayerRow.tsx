import { DIVISIONS, TEAM_BY_ID, teamLabel } from "../core/teams";
import type { SetupPlayer } from "../state/storage";
import { TeamLogo } from "./TeamLogo";

interface Props {
  index: number;
  player: SetupPlayer;
  /** Team ids already chosen by other players. */
  taken: Set<string>;
  canRemove: boolean;
  onChange: (patch: Partial<SetupPlayer>) => void;
  onRemove: () => void;
}

export function PlayerRow({ index, player, taken, canRemove, onChange, onRemove }: Props) {
  return (
    <div className="player-row">
      <span className="player-num">{index + 1}</span>
      <input
        className="player-name"
        value={player.name}
        placeholder={`Player ${index + 1}`}
        aria-label={`Player ${index + 1} name`}
        onChange={e => onChange({ name: e.target.value })}
      />
      <div className="team-pick">
        <span className="team-slot">
          <TeamLogo team={TEAM_BY_ID[player.team]} size={30} />
        </span>
        <select
          value={player.team}
          aria-label={`Player ${index + 1} team`}
          onChange={e => onChange({ team: e.target.value })}
        >
          <option value="">Choose team…</option>
          {DIVISIONS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.teams.map(team => (
                <option key={team.id} value={team.id} disabled={taken.has(team.id) && team.id !== player.team}>
                  {teamLabel(team)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <button className="small" onClick={onRemove} disabled={!canRemove} aria-label={`Remove player ${index + 1}`}>
        Remove
      </button>
    </div>
  );
}
