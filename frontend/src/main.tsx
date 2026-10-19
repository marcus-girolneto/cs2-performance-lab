import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Database,
  ExternalLink,
  Globe2,
  Layers3,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dictionaries, type Language } from "./i18n";
import {
  exportCsv,
  getJson,
  mapName,
  readStored,
  stats,
  store,
  type Match,
  type MatchResponse,
  type Profile,
} from "./data";
import "./styles.css";
import { Analytics } from "./Analytics";
import { SteamLogin } from "./SteamLogin";
import { PlayerSearch } from "./PlayerSearch";
import { PlayerInspector } from "./PlayerInspector";
import { LiveMatch } from "./LiveMatch";

type Page =
  | "overview"
  | "live"
  | "matches"
  | "maps"
  | "training"
  | "sources"
  | "seasons"
  | "performance"
  | "weapons"
  | "inventory";
const nav = [
  { id: "overview", icon: LayoutDashboard },
  { id: "live", icon: Activity },
  { id: "matches", icon: Swords },
  { id: "maps", icon: Layers3 },
  { id: "seasons", icon: Trophy },
  { id: "performance", icon: Activity },
  { id: "weapons", icon: Target },
  { id: "inventory", icon: Layers3 },
  { id: "training", icon: Crosshair },
  { id: "sources", icon: Database },
] as const;

function App() {
  const [lang, setLang] = useState<Language>(() =>
    readStored<string>("cslab:lang", "pt") === "en" ? "en" : "pt",
  );
  const t = dictionaries[lang];
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const [page, setPage] = useState<Page>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [source, setSource] = useState("premier");
  const [steamId, setSteamId] = useState("");
  const [loadedProfile, setProfile] = useState<Profile | null>(null);
  const [inspectedProfile, setInspectedProfile] = useState<Profile | null>(null);
  const profileReturnPath = useRef("/");
  const [profileError, setProfileError] = useState(false);
  const profile = loadedProfile ?? {
    steamId,
    name: profileError ? t.noData : t.syncing,
    avatar: "",
    url: `https://steamcommunity.com/profiles/${steamId}/`,
    visibility: "",
    memberSince: "",
    source: "",
    fetchedAt: "",
  };
  const [data, setData] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [map, setMap] = useState("all");
  const [period, setPeriod] = useState(10000);
  const [result, setResult] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Match | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [done, setDone] = useState<number[]>(() => {
    const v = readStored<unknown>("cslab:training", []);
    return Array.isArray(v)
      ? v.filter((n) => Number.isInteger(n) && n >= 0 && n < 4)
      : [];
  });
  function openPlayerProfile(player: Profile) {
    if (!window.location.pathname.startsWith("/player/")) profileReturnPath.current = window.location.pathname + window.location.search;
    window.history.pushState({}, "", `/player/${player.steamId}`);
    setInspectedProfile(player);
  }
  function closePlayerProfile() {
    window.history.pushState({}, "", profileReturnPath.current || "/");
    setInspectedProfile(null);
  }
  useEffect(() => {
    const syncProfileRoute = () => {
      const match = window.location.pathname.match(/^\/player\/(7656119\d{10})\/?$/);
      if (!match) {
        setInspectedProfile(null);
        return null;
      }
      const controller = new AbortController();
      getJson<Profile>(`/api/v1/players/${match[1]}`, controller.signal)
        .then(setInspectedProfile)
        .catch(() => setInspectedProfile(null));
      return controller;
    };
    const initialController = syncProfileRoute();
    const onPopState = () => syncProfileRoute();
    window.addEventListener("popstate", onPopState);
    return () => {
      initialController?.abort();
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    store("cslab:lang", lang);
  }, [lang, locale]);
  useEffect(() => {
    store("cslab:training", done);
  }, [done]);
  useEffect(() => {
    if (!steamId) {
      setProfile(null);
      setProfileError(false);
      return;
    }
    const controller = new AbortController();
    setProfile(null);
    setProfileError(false);
    getJson<Profile>(`/api/v1/players/${steamId}`, controller.signal)
      .then(setProfile)
      .catch(() => {
        if (!controller.signal.aborted) setProfileError(true);
      });
    return () => controller.abort();
  }, [steamId, reload]);
  useEffect(() => {
    if (!steamId) {
      setLoading(false);
      setError(false);
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    getJson<MatchResponse>(
      `/api/v1/players/${steamId}/matches?source=${source}`,
      controller.signal,
    )
      .then((d) => {
        if (!Array.isArray(d.matches)) throw new Error("Invalid response");
        setData(d);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [steamId, source, reload]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const matches = useMemo(
    () =>
      (data?.matches ?? [])
        .slice(0, period)
        .filter(
          (m) =>
            (map === "all" || map === m.map) &&
            (result === "all" ||
              (result === "draw"
                ? m.won === null
                : m.won === (result === "win"))) &&
            mapName(m.map).toLowerCase().includes(query.toLowerCase()),
        ),
    [data, period, map, result, query],
  );
  const metric = stats(matches);
  const mapRows = [...new Set(matches.map((m) => m.map))]
    .map((name) => {
      const list = matches.filter((m) => m.map === name);
      return { name, count: list.length, ...stats(list) };
    })
    .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  const number = (n: number | null, digits = 0) =>
    n === null
      ? "—"
      : new Intl.NumberFormat(locale, {
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
        }).format(n);
  const date = (d: string | null) =>
    d === null
      ? t.noData
      : new Date(d + (d.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString(
          locale,
          { day: "2-digit", month: "short" },
        );
  const go = (p: Page) => {
    setPage(p);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const clear = () => {
    setMap("all");
    setResult("all");
    setQuery("");
    setPeriod(10000);
  };
  const chart = [...matches].reverse().map((m, index) => ({
    index: index + 1,
    label: `${mapName(m.map)} · ${m.playedAt ? date(m.playedAt) : (m.displayedDate ?? t.noData)}`,
    kd: m.deaths ? Number((m.kills / m.deaths).toFixed(2)) : null,
  }));
  function Table({ limit }: { limit?: number }) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t.map}</th>
              <th>{t.result}</th>
              <th>{t.score}</th>
              <th>K / D / A</th>
              <th>{t.kd}</th>
              <th>Rating</th>
              <th>FK / FD</th>
              <th>TTD</th>
              <th>{t.adr}</th>
              <th>{t.date}</th>
              <th>
                <span className="sr-only">{t.details}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {matches.slice(0, limit).map((m) => (
              <tr key={m.id}>
                <td>
                  <button className="map-link" onClick={() => setSelected(m)}>
                    <span className={`map-symbol ${m.map}`}>
                      {m.map.slice(0, 1).toUpperCase()}
                    </span>
                    {mapName(m.map)}
                  </button>
                </td>
                <td>
                  <span className={`result ${m.won ? "win" : "loss"}`}>
                    {m.won === null ? t.draw : m.won ? t.win : t.loss}
                  </span>
                </td>
                <td className="score">
                  {m.ownScore} <span>:</span> {m.enemyScore}
                </td>
                <td>
                  {m.kills}
                  <span className="muted">
                    {" "}
                    / {m.deaths} / {m.assists}
                  </span>
                </td>
                <td className={m.kills >= m.deaths ? "positive" : ""}>
                  {number(m.deaths ? m.kills / m.deaths : null, 2)}
                </td>
                <td>{number(m.rating ?? null)}</td>
                <td>
                  {number(m.firstKills ?? null)} /{" "}
                  {number(m.firstDeaths ?? null)}
                </td>
                <td>{number(m.timeToDamage ?? null)} ms</td>
                <td>{number(m.adr, 1)}</td>
                <td className="muted">
                  {m.playedAt
                    ? date(m.playedAt)
                    : (m.displayedDate ?? t.noData)}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`${t.details}: ${mapName(m.map)} ${m.playedAt ? date(m.playedAt) : (m.displayedDate ?? t.noData)}`}
                    onClick={() => setSelected(m)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!matches.length && (
          <div className="empty">
            <Search />
            <p>{t.noMatches}</p>
            <button className="button" onClick={clear}>
              {t.clear}
            </button>
          </div>
        )}
      </div>
    );
  }
  function Maps({ compact = false }: { compact?: boolean }) {
    return (
      <div className={compact ? "map-list" : "map-grid"}>
        {mapRows.slice(0, compact ? 4 : undefined).map((m, i) => (
          <button
            key={m.name}
            className="map-card"
            onClick={() => {
              setMap(m.name);
              go("matches");
            }}
          >
            <div className="map-card-title">
              <span className={`map-symbol ${m.name}`}>
                {m.name[0].toUpperCase()}
              </span>
              <div>
                <strong>{mapName(m.name)}</strong>
                <span>
                  {m.count} {t.matches.toLowerCase()}
                </span>
              </div>
              <span className="map-rate">
                {number(m.winRate)}
                <small>%</small>
              </span>
            </div>
            <div className="progress">
              <i
                style={{
                  width: `${m.winRate}%`,
                  background: i === 0 ? "var(--accent)" : undefined,
                }}
              />
            </div>
            {!compact && (
              <div className="map-bottom">
                <span>
                  K/D <b>{number(m.kd, 2)}</b>
                </span>
                <span>
                  ADR <b>{number(m.adr, 1)}</b>
                </span>
                <ArrowUpRight size={18} />
              </div>
            )}
          </button>
        ))}
        {!mapRows.length && <p className="empty">{t.noMatches}</p>}
      </div>
    );
  }
  if (inspectedProfile) return <PlayerInspector profile={inspectedProfile} lang={lang} onClose={closePlayerProfile} />;
  if (!steamId) {
    return (
      <main className="welcome-screen">
        <div className="welcome-art" />
        <header className="welcome-topbar">
          <a className="brand" href="#">
            <span className="brand-mark"><Crosshair size={23} /></span>
            <span>CS2<span className="brand-lab">PERFORMANCE LAB</span></span>
          </a>
          <div className="welcome-actions">
            <Globe2 size={15} />
            <select aria-label={t.language} value={lang} onChange={(e) => setLang(e.target.value as Language)}>
              <option value="pt">Português</option>
              <option value="en">English</option>
            </select>
          </div>
        </header>
        <section className="welcome-content">
          <div className="welcome-eyebrow"><span /> CS2 PERFORMANCE LAB</div>
          <h1>{lang === "pt" ? <>Seu jogo.<br /><em>Em perspectiva.</em></> : <>Your game.<br /><em>In perspective.</em></>}</h1>
          <p>{lang === "pt" ? "Explore estatísticas reais de Counter-Strike 2. Conecte sua Steam ou procure qualquer perfil público para começar." : "Explore real Counter-Strike 2 stats. Connect your Steam account or find any public profile to get started."}</p>
          <div className="welcome-options">
            <div className="welcome-option">
              <span className="welcome-option-icon"><ShieldCheck size={21} /></span>
              <div><h2>{lang === "pt" ? "Conecte sua Steam" : "Connect your Steam"}</h2><p>{lang === "pt" ? "Entre com segurança usando o login oficial da Steam." : "Sign in securely with Steam's official login."}</p></div>
              <SteamLogin lang={lang} onProfile={(id) => setSteamId(id)} />
            </div>
            <div className="welcome-divider"><span>{lang === "pt" ? "OU ENCONTRE UM JOGADOR" : "OR FIND A PLAYER"}</span></div>
            <PlayerSearch lang={lang} onSelect={openPlayerProfile} />
          </div>
          <div className="welcome-foot"><span><Check size={14} /> {lang === "pt" ? "Sem conta necessária para explorar perfis públicos" : "No account needed to explore public profiles"}</span><span>{lang === "pt" ? "Seus dados continuam seus" : "Your data stays yours"}</span></div>
        </section>
        <div className="welcome-watermark">CS<span>2</span></div>
      </main>
    );
  }
  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label={t.close}
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <span className="brand-mark">
            <Crosshair size={23} />
          </span>
          <span>
            CS2<span className="brand-lab">PERFORMANCE LAB</span>
          </span>
        </a>
        <div className="sidebar-label">{t.workspace}</div>
        <nav>
          {nav.map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => go(id)}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{t[id]}</span>
              {id === "training" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-promo">
          <div className="promo-icon">
            <Target size={22} />
          </div>
          <strong>{t.coachTitle}</strong>
          <p>{t.trainingSub}</p>
          <button onClick={() => go("training")}>
            {t.training}
            <ArrowUpRight size={16} />
          </button>
        </div>
        <button className="sidebar-help" onClick={() => go("sources")}>
          <CircleHelp size={17} />
          {t.sources}
          <ArrowUpRight size={15} />
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={t.menu}
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{t[page]}</strong>
          </div>
          <div className="top-actions">
            <SteamLogin
              lang={lang}
              onProfile={(id) => {
                setSteamId(id);
                setData(null);
                setLoading(true);
                setReload((r) => r + 1);
                clear();
                go("overview");
              }}
            />
            <div className="language">
              <Globe2 size={15} />
              <select
                aria-label={t.language}
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
              </select>
            </div>
            <a
              href={profile.url}
              target="_blank"
              rel="noreferrer"
              className="top-avatar"
            >
              {profile.avatar && (
                <img src={profile.avatar} alt={profile.name} />
              )}
            </a>
          </div>
        </header>
        <main>
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> COUNTER-STRIKE 2
              </div>
              <h1>
                {page === "overview"
                  ? t.tagline
                  : page === "live"
                    ? t.liveSubtitle
                  : page === "training"
                    ? t.trainingTitle
                    : page === "sources"
                      ? t.sourcesTitle
                      : t[page]}
              </h1>
              <p>
                {page === "live"
                  ? t.liveDescription
                  : page === "training"
                  ? t.trainingSub
                  : page === "sources"
                    ? t.sourcesSub
                    : t.subtitle}
              </p>
            </div>
            {page !== "live" && <button
              className="button secondary"
              disabled={loading}
              onClick={() => setReload((r) => r + 1)}
            >
              <RefreshCw size={15} className={loading ? "spin" : ""} />
              {loading ? t.syncing : t.sync}
            </button>}
          </section>
          <PlayerSearch
            lang={lang}
            onSelect={openPlayerProfile}
          />
          {profileError && (
            <p className="sample-warning" role="status">
              {lang === "pt"
                ? "Não foi possível obter o perfil na Steam. Tente atualizar."
                : "Could not retrieve the Steam profile. Try refreshing."}
            </p>
          )}
          {page === "live" && <LiveMatch lang={lang} />}
          {page === "overview" && (
            <section className="hero">
              <img
                className="hero-art"
                src="/images/cs-0.jpg"
                alt="Counter-Strike 2"
              />
              <div className="hero-shade" />
              <div className="hero-grid" />
              <div className="hero-content">
                <div className="hero-kicker">
                  <ShieldCheck size={14} />{" "}
                  {loadedProfile
                    ? t.profileLive
                    : profileError
                      ? t.noData
                      : t.syncing}
                </div>
                <div className="hero-player">
                  {profile.avatar && <img src={profile.avatar} alt="" />}
                  <div>
                    <span className="player-label">PLAYER PROFILE</span>
                    <h2>{profile.name}</h2>
                    <span className="steam-id">STEAM ID · {steamId}</span>
                  </div>
                </div>
                <a
                  className="hero-link"
                  href={profile.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.profile}
                  <ArrowUpRight size={16} />
                </a>
              </div>
              <div className="hero-wordmark">
                COUNTER
                <br />
                <b>
                  STRIKE<span>2</span>
                </b>
              </div>
              <div className="hero-bottom">
                <span>
                  <span className="live-dot" /> STEAM COMMUNITY
                </span>
                <span>
                  {profile.memberSince} <span className="sep">/</span> CS2
                  PERFORMANCE LAB
                </span>
              </div>
            </section>
          )}
          {["overview", "matches", "maps"].includes(page) && (
            <>
              <div
                className={`source-notice ${source === "faceit" ? "live" : ""}`}
              >
                <Database size={16} />
                <span>{source === "faceit" ? t.liveNote : t.importNote}</span>
                <button onClick={() => go("sources")}>
                  {t.sources}
                  <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="filters">
                <div className="filter-group">
                  <label>
                    <span className="sr-only">{t.matchSource}</span>
                    <select
                      value={source}
                      onChange={(e) => {
                        setSource(e.target.value);
                        setData(null);
                        setLoading(true);
                        clear();
                      }}
                    >
                      <option value="premier">Premier · Valve</option>
                      <option value="gamersclub">GamersClub</option>
                      <option value="all">{t.allModes}</option>
                      <option value="faceit">FACEIT</option>
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">{t.map}</span>
                    <select
                      value={map}
                      onChange={(e) => setMap(e.target.value)}
                    >
                      <option value="all">{t.allMaps}</option>
                      {[...new Set(data?.matches.map((m) => m.map))]
                        .sort()
                        .map((m) => (
                          <option value={m} key={m}>
                            {mapName(m)}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span className="sr-only">{t.period}</span>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(Number(e.target.value))}
                  >
                    <option value={10000}>{t.allMatches}</option>
                    <option value={7}>{t.last7}</option>
                    <option value={14}>{t.last14}</option>
                    <option value={20}>{t.last20}</option>
                  </select>
                </label>
              </div>
              {loading ? (
                <div className="loading" role="status">
                  <RefreshCw className="spin" />
                  {t.syncing}
                </div>
              ) : error ? (
                <div className="error" role="alert">
                  <Database />
                  <p>{source === "faceit" ? t.connectionError : t.noImport}</p>
                  <button
                    className="button"
                    onClick={() => setReload((r) => r + 1)}
                  >
                    {t.retry}
                  </button>
                </div>
              ) : (
                <>
                  {source !== "faceit" && (
                    <div className="import-context">
                      <span>
                        {t.importedAt}:{" "}
                        {data &&
                          new Date(data.fetchedAt).toLocaleString(locale)}
                      </span>
                      <a
                        href={data?.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.viewSource}
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  )}
                  <section className="metrics">
                    {[
                      {
                        label: t.kd,
                        value: number(metric.kd, 2),
                        unit: "",
                        icon: Crosshair,
                        foot: t.ratio,
                      },
                      {
                        label: t.winRate,
                        value: number(metric.winRate, 1),
                        unit: "%",
                        icon: Trophy,
                        foot: `${matches.filter((m) => m.won).length} ${t.wins.toLowerCase()} / ${matches.length}`,
                      },
                      {
                        label: t.adr,
                        value: number(metric.adr, 1),
                        unit: "",
                        icon: Zap,
                        foot: "ADR",
                      },
                      {
                        label: source === "faceit" ? t.hs : t.latestRating,
                        value:
                          source === "faceit"
                            ? number(metric.hs, 1)
                            : number(
                                matches.find((m) => m.rating != null)?.rating ??
                                  null,
                              ),
                        unit: source === "faceit" ? "%" : "",
                        icon: Target,
                        foot: `${matches.length} ${t.sample}`,
                      },
                    ].map(({ label, value, unit, icon: Icon, foot }, i) => (
                      <article
                        key={label}
                        className={`metric ${i === 0 ? "metric-featured" : ""}`}
                      >
                        <div className="metric-top">
                          <span>{label}</span>
                          <Icon size={18} />
                        </div>
                        <div className="metric-value">
                          {value}
                          <small>{unit}</small>
                        </div>
                        <div className="metric-foot">
                          {i === 0 ? (
                            <Activity size={13} />
                          ) : (
                            <span className="tiny-dot" />
                          )}
                          {foot}
                        </div>
                      </article>
                    ))}
                  </section>
                  {page === "overview" && (
                    <>
                      <section className="analysis-grid">
                        <article className="panel chart-panel">
                          <div className="panel-heading">
                            <div>
                              <h3>{t.evolution}</h3>
                              <p>{t.evolutionSub}</p>
                            </div>
                            <span className="chart-legend">
                              <i />
                              K/D
                            </span>
                          </div>
                          <div className="chart">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={chart}
                                margin={{
                                  top: 15,
                                  right: 12,
                                  left: -30,
                                  bottom: 0,
                                }}
                              >
                                <defs>
                                  <linearGradient
                                    id="chartFill"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                  >
                                    <stop
                                      offset="0%"
                                      stopColor="#d4fb64"
                                      stopOpacity={0.22}
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor="#d4fb64"
                                      stopOpacity={0}
                                    />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid
                                  vertical={false}
                                  stroke="#ffffff0b"
                                />
                                <XAxis
                                  dataKey="index"
                                  tick={{ fill: "#787d88", fontSize: 11 }}
                                  axisLine={false}
                                  tickLine={false}
                                  minTickGap={22}
                                />
                                <YAxis
                                  domain={[0, "auto"]}
                                  tick={{ fill: "#787d88", fontSize: 11 }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <Tooltip
                                  content={({ active, payload }) =>
                                    active && payload?.length ? (
                                      <div className="chart-tooltip">
                                        <strong>
                                          {payload[0].payload.label}
                                        </strong>
                                        <span>
                                          K/D{" "}
                                          {number(Number(payload[0].value), 2)}
                                        </span>
                                      </div>
                                    ) : null
                                  }
                                />
                                <Area
                                  type="monotone"
                                  dataKey="kd"
                                  stroke="#d4fb64"
                                  strokeWidth={2}
                                  fill="url(#chartFill)"
                                  activeDot={{
                                    r: 5,
                                    stroke: "#101114",
                                    strokeWidth: 3,
                                  }}
                                  isAnimationActive={false}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="chart-caption">
                            <span>
                              {t.basedOn} {matches.length}{" "}
                              {t.matches.toLowerCase()}
                            </span>
                            <span>
                              {t.source}: {source.toUpperCase()}
                            </span>
                          </div>
                        </article>
                        <article className="coach-panel">
                          <div className="coach-top">
                            <span className="coach-icon">
                              <Crosshair size={21} />
                            </span>
                            <span>{t.coachTag}</span>
                            <span className="live-dot" />
                          </div>
                          <h3>{t.coachTitle}</h3>
                          <p>{t.coachText}</p>
                          {mapRows.length > 0 && (
                            <div className="coach-evidence">
                              <span>
                                {mapName(mapRows[mapRows.length - 1].name)}
                              </span>
                              <strong>
                                {number(mapRows[mapRows.length - 1].winRate)}%{" "}
                                <small>{t.winRate.toLowerCase()}</small>
                              </strong>
                            </div>
                          )}
                          <button
                            className="button primary"
                            onClick={() => go("training")}
                          >
                            {t.plan}
                            <ArrowRight size={16} />
                          </button>
                          <span className="coach-disclaimer">
                            {t.notEnough} · {t.coachSub}
                          </span>
                        </article>
                      </section>
                      <section className="bottom-grid">
                        <article className="panel">
                          <div className="panel-heading">
                            <div>
                              <h3>{t.recent}</h3>
                              <p>
                                {t.performance} · {source.toUpperCase()}
                              </p>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => go("matches")}
                            >
                              {t.viewAll}
                              <ArrowRight size={14} />
                            </button>
                          </div>
                          <Table limit={5} />
                        </article>
                        <article className="panel">
                          <div className="panel-heading">
                            <div>
                              <h3>{t.mapPool}</h3>
                              <p>{t.mapSub}</p>
                            </div>
                            <Layers3 size={18} className="muted" />
                          </div>
                          <Maps compact />
                        </article>
                      </section>
                    </>
                  )}
                  {page === "matches" && (
                    <section className="panel">
                      <div className="match-toolbar">
                        <div className="tabs">
                          {[
                            ["all", t.all],
                            ["win", t.wins],
                            ["loss", t.losses],
                            ["draw", t.draw],
                          ].map(([v, label]) => (
                            <button
                              key={v}
                              className={result === v ? "selected" : ""}
                              onClick={() => setResult(v)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="table-actions">
                          <label className="search">
                            <Search size={15} />
                            <input
                              aria-label={t.search}
                              placeholder={t.search}
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                            />
                          </label>
                          <button
                            className="icon-button"
                            onClick={() => exportCsv(matches)}
                            aria-label={t.download}
                            title={t.download}
                          >
                            <ArrowDownToLine size={18} />
                          </button>
                        </div>
                      </div>
                      <Table />
                    </section>
                  )}
                  {page === "maps" && (
                    <>
                      <Maps />
                      <p className="sample-warning">{t.sampleWarning}</p>
                    </>
                  )}
                  {data && (
                    <p className="data-time">
                      {t.sourceTime}:{" "}
                      {new Date(data.fetchedAt).toLocaleString(locale)} ·{" "}
                      {source.toUpperCase()}
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {["seasons", "performance", "weapons", "inventory"].includes(
            page,
          ) && (
            <Analytics
              key={page + steamId}
              steamId={steamId}
              lang={lang}
              section={page}
            />
          )}
          {page === "training" && (
            <section className="training-layout">
              <div>
                <div className="training-progress">
                  <span>
                    {done.length}/4 {t.completed}
                  </span>
                  <button className="text-button" onClick={() => setDone([])}>
                    {t.reset}
                    <RefreshCw size={13} />
                  </button>
                </div>
                <div className="progress">
                  <i style={{ width: `${done.length * 25}%` }} />
                </div>
                <div className="tasks">
                  {t.tasks.map(([title, time, description], i) => (
                    <button
                      key={i}
                      className={`task ${done.includes(i) ? "done" : ""}`}
                      aria-pressed={done.includes(i)}
                      onClick={() =>
                        setDone((v) =>
                          v.includes(i) ? v.filter((n) => n !== i) : [...v, i],
                        )
                      }
                    >
                      <span className="task-check">
                        {done.includes(i) ? <Check size={18} /> : `0${i + 1}`}
                      </span>
                      <span>
                        <strong>{title}</strong>
                        <span>{description}</span>
                      </span>
                      <small>{time}</small>
                    </button>
                  ))}
                </div>
                <p className="sample-warning">{t.localNote}</p>
              </div>
              <article className="training-art">
                <img src="/images/cs-2.jpg" alt="Counter-Strike 2" />
                <div>
                  <Target size={32} />
                  <h2>{t.trainingTitle}</h2>
                  <p>{t.coachTitle}</p>
                </div>
              </article>
            </section>
          )}
          {page === "sources" && (
            <section className="sources-grid">
              {[
                {
                  title: "Steam Community",
                  description: t.steamDesc,
                  status: t.available,
                  icon: ShieldCheck,
                  link: profile.url,
                },
                {
                  title: "FACEIT Data API",
                  description: t.faceitDesc,
                  status: t.optional,
                  icon: Trophy,
                  link: "https://developers.faceit.com/",
                },
                {
                  title: t.demoParser,
                  description: t.demoParserDesc,
                  status: t.roadmap,
                  icon: TrendingUp,
                },
              ].map(({ title, description, status, icon: Icon, link }) => (
                <article className="panel source-card" key={title}>
                  <div>
                    <Icon size={24} />
                    <span className="source-status">{status}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  {link && (
                    <a
                      className="text-button"
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.open}
                      <ArrowUpRight size={15} />
                    </a>
                  )}
                </article>
              ))}
            </section>
          )}
          <footer>
            <span>
              CS2<span className="footer-brand"> PERFORMANCE LAB</span>
              <small> / v0.1</small>
            </span>
            <span>{t.footer}</span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
        onCancel={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setSelected(null);
        }}
      >
        <div className="dialog-content">
          {selected && (
            <>
              <div className="dialog-heading">
                <span className="eyebrow">
                  {t.details} · {source.toUpperCase()}
                </span>
                <button
                  className="icon-button"
                  onClick={() => setSelected(null)}
                  aria-label={t.close}
                >
                  <X size={21} />
                </button>
              </div>
              <h2>{mapName(selected.map)}</h2>
              <p className="muted">
                {selected.playedAt
                  ? date(selected.playedAt)
                  : (selected.displayedDate ?? t.noData)}
              </p>
              <div className="match-score">
                <span className={selected.won ? "positive" : ""}>
                  {selected.ownScore}
                </span>
                <span>:</span>
                <span>{selected.enemyScore}</span>
                <small className={`result ${selected.won ? "win" : "loss"}`}>
                  {selected.won === null
                    ? t.draw
                    : selected.won
                      ? t.win
                      : t.loss}
                </small>
              </div>
              <div className="detail-stats">
                {[
                  [t.kills, selected.kills],
                  [t.deaths, selected.deaths],
                  [t.assists, selected.assists],
                  [t.adr, number(selected.adr, 1)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="evidence">
                <h3>{t.evidence}</h3>
                <p>{t.evidenceText}</p>
              </div>
              {selected.url && (
                <a
                  className="button primary"
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.matchLink}
                  <ExternalLink size={15} />
                </a>
              )}
            </>
          )}
        </div>
      </dialog>
      {inspectedProfile && <PlayerInspector profile={inspectedProfile} lang={lang} onClose={closePlayerProfile} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
