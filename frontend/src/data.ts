export type Match = { id: string; map: string; playedAt: string; won: boolean; ownScore: number; enemyScore: number; kills: number; deaths: number; assists: number; adr: number | null; headshot: number | null; url: string | null };
export type MatchResponse = { source: 'demo' | 'faceit'; fetchedAt: string; matches: Match[] };
export type Profile = { steamId: string; name: string; avatar: string; url: string; visibility: string; memberSince: string; source: string; fetchedAt: string };
export const STEAM_ID = '76561198103634204';
export const snapshot: Profile = { steamId: STEAM_ID, name: 'import io.ipadawan', avatar: '/images/avatar.jpg', url: `https://steamcommunity.com/profiles/${STEAM_ID}/`, visibility: 'public', memberSince: 'August 19, 2013', source: 'snapshot', fetchedAt: '2026-10-18T21:00:00Z' };
export const mapNames: Record<string, string> = { mirage: 'Mirage', inferno: 'Inferno', dust2: 'Dust II', ancient: 'Ancient', nuke: 'Nuke', anubis: 'Anubis', vertigo: 'Vertigo' };
export const mapName = (map: string) => mapNames[map] || map;
export function stats(matches: Match[]) {
  const kills = matches.reduce((a, m) => a + m.kills, 0);
  const deaths = matches.reduce((a, m) => a + m.deaths, 0);
  const adrRows = matches.filter(m => m.adr !== null);
  const hsRows = matches.filter(m => m.headshot !== null);
  const rounds = adrRows.reduce((a,m) => a+m.ownScore+m.enemyScore,0);
  const hsKills = hsRows.reduce((a,m) => a+m.kills,0);
  return {
    kd: deaths ? kills / deaths : null,
    winRate: matches.length ? 100 * matches.filter(m => m.won).length / matches.length : null,
    adr: rounds ? adrRows.reduce((a,m) => a+m.adr!*(m.ownScore+m.enemyScore),0)/rounds : null,
    hs: hsKills ? hsRows.reduce((a,m) => a+m.headshot!*m.kills,0)/hsKills : null,
  };
}
export async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
export function readStored<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
export function store(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be unavailable in private browsing. */ } }
export function exportCsv(matches: Match[]) {
  const cols: (keyof Match)[] = ['id', 'map', 'playedAt', 'won', 'ownScore', 'enemyScore', 'kills', 'deaths', 'assists', 'adr', 'headshot'];
  const escape = (value: unknown) => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  const csv = [cols.join(','), ...matches.map(m => cols.map(c => escape(m[c])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = `${matches[0]?.id.startsWith('demo-') ? 'demo' : 'faceit'}-matches.csv`; a.click(); URL.revokeObjectURL(url);
}
