export type Match = {
  id: string;
  map: string;
  playedAt: string | null;
  displayedDate?: string;
  mode?: string;
  rating?: number | null;
  firstKills?: number | null;
  firstDeaths?: number | null;
  timeToDamage?: number | null;
  preaim?: number | null;
  won: boolean | null;
  ownScore: number;
  enemyScore: number;
  kills: number;
  deaths: number;
  assists: number;
  adr: number | null;
  headshot: number | null;
  url: string | null;
};
export type MatchResponse = {
  source: "faceit" | "csrep-import" | "unavailable" | "leetify+csrep";
  available?: boolean;
  reason?: string;
  sourceUrl?: string;
  live?: boolean;
  seasons?: { id: number; matches: number; reportedWinRate: number }[];
  overview?: Record<string, number | string>;
  providers?: { source: string; configured: boolean; available: boolean; matchCount: number; message: string }[];
  leetifyProfile?: Record<string, unknown> | null;
  csrepProfile?: Record<string, unknown> | null;
  fetchedAt: string;
  matches: Match[];
};
export type Profile = {
  steamId: string;
  name: string;
  avatar: string;
  url: string;
  visibility: string;
  memberSince: string;
  source: string;
  fetchedAt: string;
};
export type SteamGameData = {
  configured: boolean;
  available: boolean;
  reason: string;
  ownsCs2: boolean;
  playtimeMinutes: number | null;
  recentPlaytimeMinutes: number | null;
  stats: { name: string; value: number }[];
  fetchedAt: string;
};
export type SearchHit = { name: string; avatar: string; profileUrl: string; source?: "community" | "friends" };
export type Reputation = {
  steamBans: {
    available: boolean;
    configured: boolean;
    communityBanned: boolean;
    vacBanned: boolean;
    vacBanCount: number;
    gameBanCount: number;
    daysSinceLastBan: number;
    economyBan: string;
    fetchedAt: string;
  };
  community: { unverifiedReports: number; fetchedAt: string };
  publicSignalScore: number | null;
  scoreMeaning: string;
  vacBanDeduction: number;
  gameBanDeduction: number;
  reportDeduction: number;
};
export const STEAM_ID = "76561198103634204";
export const mapNames: Record<string, string> = {
  mirage: "Mirage",
  inferno: "Inferno",
  dust2: "Dust II",
  ancient: "Ancient",
  nuke: "Nuke",
  anubis: "Anubis",
  vertigo: "Vertigo",
};
export const mapName = (map: string) => mapNames[map] || map;
export function stats(matches: Match[]) {
  const kills = matches.reduce((a, m) => a + m.kills, 0);
  const deaths = matches.reduce((a, m) => a + m.deaths, 0);
  const adrRows = matches.filter((m) => m.adr !== null);
  const hsRows = matches.filter((m) => m.headshot !== null);
  const rounds = adrRows.reduce((a, m) => a + m.ownScore + m.enemyScore, 0);
  const hsKills = hsRows.reduce((a, m) => a + m.kills, 0);
  return {
    kd: deaths ? kills / deaths : null,
    winRate: matches.length
      ? (100 * matches.filter((m) => m.won).length) / matches.length
      : null,
    adr: rounds
      ? adrRows.reduce((a, m) => a + m.adr! * (m.ownScore + m.enemyScore), 0) /
        rounds
      : null,
    hs: hsKills
      ? hsRows.reduce((a, m) => a + m.headshot! * m.kills, 0) / hsKills
      : null,
  };
}
export async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
export function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}
export function exportCsv(matches: Match[]) {
  const cols: (keyof Match)[] = [
    "id",
    "map",
    "playedAt",
    "won",
    "ownScore",
    "enemyScore",
    "kills",
    "deaths",
    "assists",
    "adr",
    "headshot",
  ];
  const escape = (value: unknown) =>
    '"' +
    String(value ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const csv = [
    cols.join(","),
    ...matches.map((m) => cols.map((c) => escape(m[c])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "cs2-matches.csv";
  a.click();
  URL.revokeObjectURL(url);
}
