export interface Team {
  /** ESPN logo slug, also used as the stable id. */
  id: string;
  abbr: string;
  city: string;
  name: string;
  /** Primary brand color, used for the fallback badge. */
  color: string;
  conference: "AFC" | "NFC";
  division: "East" | "North" | "South" | "West";
}

const t = (
  id: string, abbr: string, city: string, name: string, color: string,
  conference: Team["conference"], division: Team["division"],
): Team => ({ id, abbr, city, name, color, conference, division });

export const TEAMS: Team[] = [
  t("buf", "BUF", "Buffalo", "Bills", "#00338D", "AFC", "East"),
  t("mia", "MIA", "Miami", "Dolphins", "#008E97", "AFC", "East"),
  t("ne", "NE", "New England", "Patriots", "#002244", "AFC", "East"),
  t("nyj", "NYJ", "New York", "Jets", "#125740", "AFC", "East"),
  t("bal", "BAL", "Baltimore", "Ravens", "#241773", "AFC", "North"),
  t("cin", "CIN", "Cincinnati", "Bengals", "#FB4F14", "AFC", "North"),
  t("cle", "CLE", "Cleveland", "Browns", "#FF3C00", "AFC", "North"),
  t("pit", "PIT", "Pittsburgh", "Steelers", "#FFB612", "AFC", "North"),
  t("hou", "HOU", "Houston", "Texans", "#03202F", "AFC", "South"),
  t("ind", "IND", "Indianapolis", "Colts", "#002C5F", "AFC", "South"),
  t("jax", "JAX", "Jacksonville", "Jaguars", "#006778", "AFC", "South"),
  t("ten", "TEN", "Tennessee", "Titans", "#4B92DB", "AFC", "South"),
  t("den", "DEN", "Denver", "Broncos", "#FB4F14", "AFC", "West"),
  t("kc", "KC", "Kansas City", "Chiefs", "#E31837", "AFC", "West"),
  t("lv", "LV", "Las Vegas", "Raiders", "#A5ACAF", "AFC", "West"),
  t("lac", "LAC", "Los Angeles", "Chargers", "#0080C6", "AFC", "West"),
  t("dal", "DAL", "Dallas", "Cowboys", "#003594", "NFC", "East"),
  t("nyg", "NYG", "New York", "Giants", "#0B2265", "NFC", "East"),
  t("phi", "PHI", "Philadelphia", "Eagles", "#004C54", "NFC", "East"),
  t("wsh", "WSH", "Washington", "Commanders", "#5A1414", "NFC", "East"),
  t("chi", "CHI", "Chicago", "Bears", "#0B162A", "NFC", "North"),
  t("det", "DET", "Detroit", "Lions", "#0076B6", "NFC", "North"),
  t("gb", "GB", "Green Bay", "Packers", "#203731", "NFC", "North"),
  t("min", "MIN", "Minnesota", "Vikings", "#4F2683", "NFC", "North"),
  t("atl", "ATL", "Atlanta", "Falcons", "#A71930", "NFC", "South"),
  t("car", "CAR", "Carolina", "Panthers", "#0085CA", "NFC", "South"),
  t("no", "NO", "New Orleans", "Saints", "#D3BC8D", "NFC", "South"),
  t("tb", "TB", "Tampa Bay", "Buccaneers", "#D50A0A", "NFC", "South"),
  t("ari", "ARI", "Arizona", "Cardinals", "#97233F", "NFC", "West"),
  t("lar", "LAR", "Los Angeles", "Rams", "#003594", "NFC", "West"),
  t("sf", "SF", "San Francisco", "49ers", "#AA0000", "NFC", "West"),
  t("sea", "SEA", "Seattle", "Seahawks", "#002244", "NFC", "West"),
];

export const TEAM_BY_ID: Record<string, Team> = Object.fromEntries(TEAMS.map(team => [team.id, team]));

export const teamLabel = (team: Team) => `${team.city} ${team.name}`;

export const teamLogoUrl = (id: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${id}.png`;

/** Division groups in display order, for grouped dropdowns. */
export const DIVISIONS: { label: string; teams: Team[] }[] = (["AFC", "NFC"] as const).flatMap(conference =>
  (["East", "North", "South", "West"] as const).map(division => ({
    label: `${conference} ${division}`,
    teams: TEAMS.filter(x => x.conference === conference && x.division === division),
  })),
);
