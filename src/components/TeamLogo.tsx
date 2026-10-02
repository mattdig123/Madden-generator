import { useEffect, useState } from "react";
import { teamLabel, teamLogoUrl, type Team } from "../core/teams";

interface Props {
  team?: Team;
  size?: number;
}

/** Light team colors need dark lettering on the fallback badge. */
function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#111827" : "#fff";
}

/** The team's logo from ESPN's CDN, falling back to a colored abbreviation badge if it can't load. */
export function TeamLogo({ team, size = 32 }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [team?.id]);
  if (!team) return null;

  if (failed) {
    return (
      <span
        className="team-badge"
        role="img"
        aria-label={teamLabel(team)}
        style={{ width: size, height: size, background: team.color, color: readableOn(team.color), fontSize: size * 0.36 }}
      >
        {team.abbr}
      </span>
    );
  }
  return (
    <img
      className="team-logo"
      src={teamLogoUrl(team.id)}
      alt={teamLabel(team)}
      title={teamLabel(team)}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
