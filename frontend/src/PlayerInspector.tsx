import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Flag, ShieldAlert, ShieldCheck, Swords, X } from "lucide-react";
import { getJson, mapName, stats, type MatchResponse, type Profile, type Reputation, type SteamGameData } from "./data";
import type { Language } from "./i18n";

type Session = { authenticated: boolean; steamId?: string; csrfToken?: string };
type Tab = "overview" | "matches" | "stats" | "steam" | "reputation";

export function PlayerInspector({
  profile,
  lang,
  onClose,
}: {
  profile: Profile;
  lang: Language;
  onClose: () => void;
}) {
  const pt = lang === "pt";
  const [tab, setTab] = useState<Tab>("overview");
  const [analyticsSection, setAnalyticsSection] = useState("performance");
  const [matches, setMatches] = useState<MatchResponse | null>(null);
  const [matchUnavailable, setMatchUnavailable] = useState(false);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [steamData, setSteamData] = useState<SteamGameData | null>(null);
  const [steamDataUnavailable, setSteamDataUnavailable] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [category, setCategory] = useState("aimbot");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setMatches(null);
    setMatchUnavailable(false);
    setReputation(null);
    setSteamData(null);
    setSteamDataUnavailable(false);
    setNotice("");
    setTab("overview");
    getJson<MatchResponse>(
      `/api/v1/players/${profile.steamId}/match-data`,
      controller.signal,
    )
      .then(setMatches)
      .catch(() => { if (!controller.signal.aborted) setMatchUnavailable(true); });
    getJson<Reputation>(
      `/api/v1/players/${profile.steamId}/reputation`,
      controller.signal,
    ).then(setReputation).catch(() => {});
    getJson<SteamGameData>(`/api/v1/players/${profile.steamId}/steam-data`, controller.signal)
      .then(setSteamData)
      .catch(() => { if (!controller.signal.aborted) setSteamDataUnavailable(true); });
    fetch("/api/v1/auth/session", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (!controller.signal.aborted && value) setSession(value); });
    return () => controller.abort();
  }, [profile.steamId]);

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!session?.csrfToken) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/players/${profile.steamId}/reputation/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify({ category, evidenceUrl }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 409
        ? (pt ? "Você já enviou uma denúncia para este perfil." : "You already reported this profile.")
        : (body.detail || (pt ? "Não foi possível enviar." : "Could not submit the report.")));
      const updated = await fetch(`/api/v1/players/${profile.steamId}/reputation`).then((item) => item.ok ? item.json() as Promise<Reputation> : null);
      if (updated) setReputation(updated);
      setEvidenceUrl("");
      setNotice(pt ? "Denúncia registrada como não verificada." : "Report recorded as unverified.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : (pt ? "Falha ao enviar." : "Submission failed."));
    } finally {
      setBusy(false);
    }
  }

  const allMatches = matches?.matches ?? [];
  const premier = allMatches.filter((match) => match.mode === "Premier");
  const metrics = stats(premier);
  const latest = allMatches.slice(0, 5);
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: pt ? "Resumo" : "Overview" },
    { id: "matches", label: pt ? "Partidas" : "Matches" },
    { id: "stats", label: pt ? "Estatísticas" : "Statistics" },
    { id: "steam", label: pt ? "Dados Steam" : "Steam data" },
    { id: "reputation", label: pt ? "Reputação" : "Reputation" },
  ];
  const statSections = [
    ["seasons", pt ? "Temporadas" : "Seasons"],
    ["performance", pt ? "Performance" : "Performance"],
    ["weapons", pt ? "Armas" : "Weapons"],
    ["inventory", pt ? "Inventário" : "Inventory"],
  ];

  return (
    <div className="player-profile-page">
      <main className="player-inspector" aria-labelledby="inspected-player-name">
        <header className="player-inspector-header">
          <div className="inspected-identity">
            {profile.avatar && <img src={profile.avatar} alt="" />}
            <div>
              <span className="eyebrow">{pt ? "PERFIL PÚBLICO · STEAM" : "PUBLIC PLAYER · STEAM"}</span>
              <h2 id="inspected-player-name">{profile.name}</h2>
              <small>{profile.steamId}</small>
            </div>
          </div>
          <div className="inspected-actions">
            <a className="button secondary" href={profile.url} target="_blank" rel="noreferrer">
              {pt ? "Abrir Steam" : "Open Steam"}<ExternalLink size={14} />
            </a>
            <button className="button secondary" onClick={onClose} aria-label={pt ? "Voltar" : "Go back"}><X size={16} />{pt ? "Voltar" : "Back"}</button>
          </div>
        </header>
        <nav className="inspector-tabs" aria-label={pt ? "Seções do perfil" : "Player profile sections"}>
          {tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} aria-current={tab === item.id ? "page" : undefined}>{item.label}</button>)}
        </nav>
        <div className="inspected-body">
          {tab === "overview" && <>
            <section className="inspected-section">
              <div className="inspected-section-title"><Swords size={18} /><h3>Premier</h3></div>
              {matches?.available === false ? <p className="inspected-note">{pt
                ? "Este perfil pode ter partidas. A Valve só libera o histórico Premier quando o próprio jogador autoriza o acesso com o código de autenticação de jogo; esse perfil ainda não conectou essa fonte."
                : "This profile may have matches. Valve releases Premier history when the player authorizes access with a game authentication code; this profile has not connected that source."}</p> : matches ? <>
                <div className="inspected-stats">
                  <div><small>{pt ? "Partidas Premier" : "Premier matches"}</small><strong>{premier.length || "—"}</strong></div>
                  <div><small>K/D</small><strong>{metrics.kd?.toFixed(2) ?? "—"}</strong></div>
                  <div><small>ADR</small><strong>{metrics.adr?.toFixed(1) ?? "—"}</strong></div>
                  <div><small>{pt ? "Taxa de vitória" : "Win rate"}</small><strong>{metrics.winRate == null ? "—" : `${metrics.winRate.toFixed(0)}%`}</strong></div>
                </div>
                <p className="inspected-source">{pt ? "Modos registrados" : "Recorded modes"}: {new Set(allMatches.map((match) => match.mode).filter(Boolean)).size || "—"} · {pt ? "atualizado" : "updated"} {new Date(matches.fetchedAt).toLocaleString(pt ? "pt-BR" : "en-US")}{matches.sourceUrl && <> · <a href={matches.sourceUrl} target="_blank" rel="noreferrer">CSREP ↗</a></>}</p>
              </> : <p className="inspected-note">{matchUnavailable
                ? (pt ? "Não há histórico de partidas importado para este jogador. A Steam não disponibiliza partidas Premier pelo perfil público." : "No match history is imported for this player. Steam does not expose Premier matches through public profiles.")
                : (pt ? "Carregando histórico…" : "Loading match history…")}</p>}
            </section>
            <section className="inspected-section">
              <div className="inspected-section-title"><Swords size={18} /><h3>{pt ? "Partidas recentes" : "Recent matches"}</h3><button className="text-button" onClick={() => setTab("matches")}>{pt ? "Ver todas" : "View all"} ↗</button></div>
              {latest.length ? <MatchTable matches={latest} lang={lang} /> : <p className="inspected-note">{matches?.available === false
                ? (pt ? "O app ainda não conectou uma fonte que entregue as partidas deste perfil." : "The app has not connected a source that provides this profile's matches yet.")
                : (pt ? "Nenhuma partida nesta fonte." : "No matches in this source.")}</p>}
            </section>
          </>}

          {tab === "matches" && <section className="inspected-section">
            <div className="inspected-section-title"><Swords size={18} /><h3>{pt ? "Partidas das fontes conectadas" : "Matches from connected sources"}</h3></div>
            {matches?.providers && <div className="provider-status-list">{matches.providers.map((provider) => <div key={provider.source}>
              <strong>{provider.source === "leetify" ? "Leetify" : "CSRep"}</strong>
              <span className={provider.available ? "provider-available" : "provider-unavailable"}>{provider.available
                ? `${provider.matchCount} ${pt ? "partidas" : "matches"}`
                : provider.message === "api_key_missing"
                  ? "CSREP_API_KEY missing"
                  : (pt ? "perfil indisponível, privado ou não encontrado" : "profile unavailable, private, or not found")}</span>
            </div>)}</div>}
            {allMatches.length ? <MatchTable matches={allMatches} lang={lang} /> : <p className="inspected-note">{matchUnavailable
              ? (pt ? "Não foi possível consultar as fontes agora." : "Could not query the sources right now.")
              : (pt ? "As fontes consultadas não retornaram partidas para este perfil. Veja a disponibilidade acima." : "The queried sources returned no matches for this profile. Check provider availability above.")}</p>}
          </section>}

          {tab === "stats" && <section className="inspected-section">
            <div className="inspected-section-title"><Swords size={18} /><h3>{pt ? "Estatísticas detalhadas" : "Detailed statistics"}</h3></div>
            <div className="inspector-subtabs">
              {statSections.map(([id, label]) => <button key={id} className={analyticsSection === id ? "active" : ""} onClick={() => setAnalyticsSection(id)}>{label}</button>)}
            </div>
            <ProviderMetrics data={matches} section={analyticsSection} lang={lang} />
          </section>}

          {tab === "steam" && <section className="inspected-section">
            <div className="inspected-section-title"><Swords size={18} /><h3>{pt ? "Dados oficiais da Steam" : "Official Steam data"}</h3></div>
            {steamData?.available ? <>
              <div className="inspected-stats">
                <div><small>{pt ? "CS2 na biblioteca" : "CS2 in library"}</small><strong>{steamData.ownsCs2 ? (pt ? "Sim" : "Yes") : (pt ? "Não listado" : "Not listed")}</strong></div>
                <div><small>{pt ? "Tempo total" : "Total playtime"}</small><strong>{steamData.playtimeMinutes == null ? "—" : `${Math.floor(steamData.playtimeMinutes / 60)}h`}</strong></div>
                <div><small>{pt ? "Últimas 2 semanas" : "Last 2 weeks"}</small><strong>{steamData.recentPlaytimeMinutes == null ? "—" : `${Math.floor(steamData.recentPlaytimeMinutes / 60)}h`}</strong></div>
                <div><small>{pt ? "Estatísticas públicas" : "Public game stats"}</small><strong>{steamData.stats.length || "—"}</strong></div>
              </div>
              {steamData.stats.length > 0 ? <div className="steam-stat-grid">{steamData.stats.map((stat) => <article key={stat.name}><small>{humanizeStat(stat.name)}</small><strong>{stat.value.toLocaleString(pt ? "pt-BR" : "en-US")}</strong></article>)}</div>
                : <p className="inspected-note">{pt ? "A Steam não retornou estatísticas públicas de CS2 para este perfil." : "Steam returned no public CS2 game stats for this profile."}</p>}
              <p className="inspected-source">{pt ? "Fonte: Steam Web API · atualização" : "Source: Steam Web API · updated"} {new Date(steamData.fetchedAt).toLocaleString(pt ? "pt-BR" : "en-US")}</p>
            </> : <p className="inspected-note">{steamDataUnavailable
              ? (pt ? "A Steam Web API está indisponível." : "Steam Web API is unavailable.")
              : steamData?.reason === "api_key_missing"
                ? (pt ? "Configure STEAM_API_KEY no servidor para consultar biblioteca, tempo de jogo e estatísticas oficiais." : "Configure STEAM_API_KEY on the server to query the library, playtime and official stats.")
                : steamData?.reason === "game_details_private_or_unavailable"
                  ? (pt ? "Dados de jogos privados ou indisponíveis neste perfil Steam." : "Game details are private or unavailable for this Steam profile.")
                  : steamData?.reason === "cs2_not_in_owned_games"
                    ? (pt ? "CS2 não aparece na lista de jogos compartilhada pela Steam. O perfil pode ocultar esses dados." : "CS2 is not listed in Steam's shared games. The profile may hide these details.")
                    : (pt ? "Carregando dados oficiais da Steam…" : "Loading official Steam data…")}</p>}
            <div className="integrity-note"><ShieldAlert size={16} /><p>{pt
              ? "Histórico de partidas Premier requer autorização de jogo dada pelo próprio jogador. Os dados acima são contadores agregados do jogo, se o perfil os tornar públicos."
              : "Premier match history requires game access authorization from the player. The data above are aggregate game counters when the profile makes them public."}</p></div>
          </section>}

          {tab === "reputation" && <section className="inspected-section reputation-section">
            <div className="inspected-section-title"><ShieldCheck size={18} /><h3>{pt ? "Reputação e integridade" : "Reputation & integrity"}</h3></div>
            {reputation ? <>
              <div className="reputation-score-card">
                <div><span>{pt ? "Índice de sinais públicos" : "Public signal index"}</span><strong>{reputation.publicSignalScore ?? "—"}<small>/100</small></strong></div>
                <p>{reputation.publicSignalScore == null
                  ? (pt ? "Índice indisponível: a API oficial de bans não respondeu." : "Index unavailable: the official ban API did not respond.")
                  : (pt
                    ? `Cálculo: 100 − ${reputation.vacBanDeduction} VAC − ${reputation.gameBanDeduction} Game − ${reputation.reportDeduction} denúncias.`
                    : `Formula: 100 − ${reputation.vacBanDeduction} VAC − ${reputation.gameBanDeduction} Game − ${reputation.reportDeduction} reports.`)}</p>
              </div>
              <div className="reputation-grid">
                <article>
                  <span>{pt ? "Banimentos oficiais da Steam" : "Official Steam bans"}</span>
                  {reputation.steamBans.available ? <strong className={reputation.steamBans.vacBanCount + reputation.steamBans.gameBanCount > 0 ? "reputation-flag" : "reputation-clear"}>
                    {reputation.steamBans.vacBanCount + reputation.steamBans.gameBanCount > 0
                      ? `${reputation.steamBans.vacBanCount} VAC · ${reputation.steamBans.gameBanCount} ${pt ? "Game" : "Game"}`
                      : (pt ? "Nenhum registrado" : "None recorded")}
                  </strong> : <strong className="reputation-muted">{pt ? "Fonte indisponível" : "Source unavailable"}</strong>}
                  <small>{reputation.steamBans.available
                    ? (pt
                      ? `Comunidade: ${reputation.steamBans.communityBanned ? "banida" : "sem ban"} · Economia: ${reputation.steamBans.economyBan} · Último ban: ${reputation.steamBans.daysSinceLastBan ? `${reputation.steamBans.daysSinceLastBan} dias` : "—"}`
                      : `Community: ${reputation.steamBans.communityBanned ? "banned" : "not banned"} · Economy: ${reputation.steamBans.economyBan} · Last ban: ${reputation.steamBans.daysSinceLastBan ? `${reputation.steamBans.daysSinceLastBan} days ago` : "—"}`)
                    : reputation.steamBans.configured
                      ? (pt ? "A API oficial da Steam não está disponível agora." : "Steam's official API is unavailable right now.")
                      : (pt ? "Configure STEAM_API_KEY para consultar a API oficial." : "Configure STEAM_API_KEY to query the official API.")}</small>
                </article>
                <article>
                  <span>{pt ? "Denúncias da comunidade" : "Community reports"}</span>
                  <strong>{reputation.community.unverifiedReports}</strong>
                  <small>{pt ? "Não verificadas; não provam trapaça." : "Unverified; not proof of cheating."}</small>
                </article>
              </div>
              <div className="integrity-note"><ShieldAlert size={16} /><p>{pt
                ? "Este índice resume sinais públicos; não é probabilidade nem veredito de trapaça. Bans da Steam podem ser de outros jogos. Denúncias são não verificadas, têm peso baixo e impacto limitado."
                : "This index summarizes public signals; it is not a cheating probability or verdict. Steam bans may relate to other games. Reports are unverified, weighted lightly and capped."}</p></div>
            </> : <p className="inspected-note">{pt ? "Carregando sinais de reputação…" : "Loading reputation signals…"}</p>}
            {session?.authenticated && session.steamId !== profile.steamId && <form className="report-form" onSubmit={submitReport}>
              <label>{pt ? "Enviar denúncia com evidência pública" : "Submit a report with public evidence"}
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="aimbot">Aim assist / aimbot</option><option value="wallhack">Wallhack / ESP</option><option value="other">{pt ? "Outro comportamento" : "Other behavior"}</option>
                </select>
              </label>
              <div className="report-form-row"><input type="url" required maxLength={500} placeholder="https://…" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} /><button className="button secondary" disabled={busy} type="submit"><Flag size={14} />{pt ? "Enviar" : "Submit"}</button></div>
              {notice && <p role="status">{notice}</p>}
              <small>{pt ? "Uma denúncia por conta por jogador. O link fica privado e não é exibido no perfil." : "One report per account per player. The link stays private and is not shown on the profile."}</small>
            </form>}
            {session?.authenticated && session.steamId === profile.steamId && <p className="inspected-note">{pt ? "Você não pode denunciar seu próprio perfil." : "You cannot report your own profile."}</p>}
            {!session?.authenticated && <a className="report-login" href="/api/v1/auth/steam">{pt ? "Entre com Steam para enviar uma denúncia com evidência" : "Sign in with Steam to submit an evidence-based report"}<ExternalLink size={13} /></a>}
            {notice && !session?.authenticated && <p role="status">{notice}</p>}
          </section>}
          <p className="inspected-disclaimer">{pt
            ? "Este painel é independente da sua conta conectada. Dados ausentes significam que a fonte não os disponibiliza."
            : "This panel is separate from your connected account. Missing data means the source does not provide it."}</p>
        </div>
        </main>
    </div>
  );
}

function ProviderMetrics({ data, section, lang }: { data: MatchResponse | null; section: string; lang: Language }) {
  const pt = lang === "pt";
  const matches = data?.matches ?? [];
  if (section !== "performance") return <p className="inspected-note">{pt
    ? "As fontes conectadas ainda não entregam dados detalhados de temporadas, armas ou inventário. Nenhum dado foi estimado."
    : "Connected sources do not currently provide detailed season, weapon or inventory data. No values were estimated."}</p>;
  if (!matches.length) return <p className="inspected-note">{pt
    ? "Sem partidas retornadas pelas fontes para calcular métricas."
    : "No matches returned by the connected sources to calculate metrics."}</p>;
  const kills = matches.reduce((sum, match) => sum + match.kills, 0);
  const deaths = matches.reduce((sum, match) => sum + match.deaths, 0);
  const adrRows = matches.filter((match) => match.adr != null);
  const rounds = adrRows.reduce((sum, match) => sum + match.ownScore + match.enemyScore, 0);
  const adr = rounds ? adrRows.reduce((sum, match) => sum + match.adr! * (match.ownScore + match.enemyScore), 0) / rounds : null;
  const wins = matches.filter((match) => match.won === true).length;
  const completed = matches.filter((match) => match.won != null).length;
  return <div className="inspected-stats">
    <div><small>{pt ? "Partidas retornadas" : "Matches returned"}</small><strong>{matches.length}</strong></div>
    <div><small>K/D</small><strong>{deaths ? (kills / deaths).toFixed(2) : "—"}</strong></div>
    <div><small>ADR</small><strong>{adr == null ? "—" : adr.toFixed(1)}</strong></div>
    <div><small>{pt ? "Vitórias" : "Wins"}</small><strong>{completed ? `${Math.round(wins * 100 / completed)}%` : "—"}</strong></div>
  </div>;
}

function MatchTable({ matches, lang }: { matches: MatchResponse["matches"]; lang: Language }) {
  const pt = lang === "pt";
  return <div className="inspector-match-list">
    {matches.map((match) => <article key={match.id}>
      <div><strong>{mapName(match.map)}</strong><small>{match.mode ?? "CS2"} · {match.playedAt ? new Date(match.playedAt).toLocaleDateString(pt ? "pt-BR" : "en-US") : (match.displayedDate ?? (pt ? "Data indisponível" : "Date unavailable"))}</small></div>
      <div className="inspector-match-score"><strong>{match.ownScore} : {match.enemyScore}</strong><small className={match.won ? "positive" : ""}>{match.won === null ? (pt ? "Empate" : "Draw") : match.won ? (pt ? "Vitória" : "Win") : (pt ? "Derrota" : "Loss")}</small></div>
      <div><strong>{match.kills} / {match.deaths} / {match.assists}</strong><small>K / D / A</small></div>
      <div><strong>{match.adr == null ? "—" : match.adr.toFixed(1)}</strong><small>ADR</small></div>
      <div><strong>{match.rating == null ? "—" : match.rating.toFixed(2)}</strong><small>Rating</small></div>
      {match.url && <a href={match.url} target="_blank" rel="noreferrer" aria-label={pt ? "Abrir partida" : "Open match"}><ExternalLink size={14} /></a>}
    </article>)}
  </div>;
}

function humanizeStat(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
