import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getJson, type MatchResponse } from "./data";
import type { Language } from "./i18n";

type Weapon = {
  name: string;
  category: string;
  kills: number;
  damage: number;
  headHit: number;
  distance: number | null;
};
type InventoryItem = { name: string; image: string; text: string; url: string };
type AnalyticsData = MatchResponse & {
  weapons?: Weapon[];
  inventory?: InventoryItem[];
  maps?: { name: string; metrics: Record<string, string> }[];
};
export function Analytics({
  steamId,
  lang,
  section,
}: {
  steamId: string;
  lang: Language;
  section: string;
}) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("kills");
  const [metric, setMetric] = useState("rating");
  const pt = lang === "pt";
  const locale = pt ? "pt-BR" : "en-US";
  const number = (n: unknown) =>
    typeof n === "number"
      ? n.toLocaleString(locale, { maximumFractionDigits: 2 })
      : "—";
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    getJson<AnalyticsData>(
      `/api/v1/players/${steamId}/analytics`,
      controller.signal,
    )
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [steamId]);
  if (error)
    return (
      <div className="empty">
        {pt
          ? "Ainda não há uma importação real deste jogador."
          : "No real data import is available for this player yet."}
      </div>
    );
  if (!data)
    return (
      <div className="loading" role="status">
        {pt ? "Carregando..." : "Loading..."}
      </div>
    );
  const premier = data.matches.filter((m) => m.mode === "Premier");
  const trend = [...premier]
    .reverse()
    .map((m, i) => ({
      index: i + 1,
      rating: m.rating,
      adr: m.adr,
      timeToDamage: m.timeToDamage,
      preaim: m.preaim,
      date: m.playedAt ?? m.displayedDate,
    }));
  const aimMetrics: [string, string, string][] = [
    ["timeToDamage", pt ? "Tempo até causar dano" : "Time to damage", "ms"],
    ["reactionTime", pt ? "Tempo de reação" : "Reaction time", "ms"],
    [
      "crosshairPlacement",
      pt ? "Posicionamento de mira" : "Crosshair placement",
      "°",
    ],
    ["preaim", "Preaim", "°"],
    ["aimAccuracy", pt ? "Precisão de tiro" : "Aim accuracy", "%"],
    ["headAccuracy", pt ? "Precisão na cabeça" : "Head accuracy", "%"],
    ["wallbangKillPercent", "Wallbang kills", "%"],
    [
      "smokeKillPercent",
      pt ? "Eliminações pela smoke" : "Through-smoke kills",
      "%",
    ],
    ["reportedHltvRating", "HLTV 2.0 · CSREP", ""],
    ["kast", "KAST", "%"],
  ];
  return (
    <section className="analytics-workspace">
      <div className="source-notice">
        <span>
          {pt
            ? "Importação real do CSREP, sem atualização automática."
            : "Real CSREP import, not automatically refreshed."}{" "}
          {new Date(data.fetchedAt).toLocaleString(locale)}
        </span>
        <a href={data.sourceUrl} target="_blank" rel="noreferrer">
          {pt ? "Fonte" : "Source"} ↗
        </a>
      </div>
      {section === "seasons" && (
        <>
          <div className="season-grid">
            {data.seasons?.map((s) => (
              <article className="season-card" key={s.id}>
                <span className="eyebrow">
                  PREMIER · {pt ? "TEMPORADA" : "SEASON"} {s.id}
                </span>
                <strong>
                  {s.matches}
                  <small>
                    {pt ? "partidas registradas" : "recorded matches"}
                  </small>
                </strong>
                <div className="season-rate">
                  {s.reportedWinRate}%{" "}
                  <span>
                    {pt
                      ? "vitórias informadas pelo CSREP"
                      : "win rate reported by CSREP"}
                  </span>
                </div>
                <div className="progress">
                  <i style={{ width: `${s.reportedWinRate}%` }} />
                </div>
              </article>
            ))}
          </div>
          <p className="sample-warning">
            {pt
              ? "A fonte informa 37 partidas distribuídas entre essas temporadas. O rating aparece apenas onde foi registrado; valores ausentes não são interpolados."
              : "The source reports 37 matches across these seasons. Rating is shown only where recorded; missing values are not interpolated."}
          </p>
          <article className="panel">
            <div className="panel-heading">
              <h3>{pt ? "Evolução no Premier" : "Premier progression"}</h3>
              <select
                aria-label={pt ? "Métrica" : "Metric"}
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                <option value="rating">CS Rating</option>
                <option value="adr">ADR</option>
                <option value="timeToDamage">TTD (ms)</option>
                <option value="preaim">Preaim (°)</option>
              </select>
            </div>
            <div className="large-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid stroke="#ffffff0b" vertical={false} />
                  <XAxis
                    dataKey="index"
                    tick={{ fill: "#8b939e", fontSize: 11 }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "#8b939e", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1b2025",
                      borderColor: "#ffffff20",
                    }}
                    labelFormatter={(_, p) => p[0]?.payload?.date ?? "—"}
                  />
                  <Line
                    type="linear"
                    dataKey={metric}
                    stroke="#d4fb64"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="panel season-comparison">
            <div className="panel-heading">
              <h3>{pt ? "Partidas por temporada" : "Matches by season"}</h3>
            </div>
            <div className="large-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...(data.seasons ?? [])].reverse()}>
                  <CartesianGrid stroke="#ffffff0b" vertical={false} />
                  <XAxis
                    dataKey="id"
                    tickFormatter={(n) => `S${n}`}
                    tick={{ fill: "#8b939e" }}
                  />
                  <YAxis tick={{ fill: "#8b939e" }} />
                  <Tooltip
                    contentStyle={{
                      background: "#1b2025",
                      borderColor: "#ffffff20",
                    }}
                  />
                  <Bar
                    dataKey="matches"
                    name={pt ? "Partidas" : "Matches"}
                    fill="#d4fb64"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </>
      )}
      {section === "performance" && (
        <>
          <p className="sample-warning">
            {pt
              ? "Amostra da fonte: 74 partidas analisadas, somando Premier e GamersClub. Estes indicadores não são exclusivos de Premier."
              : "Source sample: 74 analyzed matches across Premier and GamersClub. These metrics are not Premier-only."}
          </p>
          <div className="advanced-metrics">
            {aimMetrics.map(([key, label, unit]) => (
              <article className="metric" key={key}>
                <div className="metric-top">{label}</div>
                <div className="metric-value">
                  {number(data.overview?.[key])}
                  <small>{unit}</small>
                </div>
                <div className="metric-foot">
                  {pt
                    ? "Análise publicada pelo CSREP"
                    : "Analysis published by CSREP"}
                </div>
              </article>
            ))}
          </div>
          <div className="map-grid detailed-maps">
            {data.maps?.map((m) => (
              <article className="panel source-card" key={m.name}>
                <h3>{m.name}</h3>
                <dl>
                  {Object.entries(m.metrics).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
      {section === "weapons" && (
        <>
          <div className="match-toolbar">
            <input
              className="analytics-search"
              aria-label={pt ? "Buscar arma" : "Find weapon"}
              placeholder={pt ? "Buscar arma..." : "Find weapon..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              value={sort}
              aria-label={pt ? "Ordenar" : "Sort"}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="kills">{pt ? "Abates" : "Kills"}</option>
              <option value="damage">{pt ? "Dano" : "Damage"}</option>
              <option value="headHit">
                {pt ? "Acertos na cabeça" : "Head hits"}
              </option>
            </select>
          </div>
          <p className="sample-warning">
            {pt
              ? "Cobertura própria da seção de armas do CSREP: 604 abates e 52.997 de dano. A quantidade de partidas desta amostra não foi informada. Head hit % mede acertos, não a proporção de eliminações por headshot."
              : "CSREP weapon-section coverage: 604 kills and 52,997 damage. The match count for this sample was not provided. Head hit % measures hits, not the proportion of headshot kills."}
          </p>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{pt ? "Arma" : "Weapon"}</th>
                  <th>{pt ? "Abates" : "Kills"}</th>
                  <th>{pt ? "Dano" : "Damage"}</th>
                  <th>Head hit %</th>
                  <th>{pt ? "Distância média" : "Average distance"}</th>
                </tr>
              </thead>
              <tbody>
                {data.weapons
                  ?.filter((w) =>
                    w.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .sort(
                    (a, b) =>
                      Number(b[sort as keyof Weapon]) -
                      Number(a[sort as keyof Weapon]),
                  )
                  .map((w) => (
                    <tr key={w.name}>
                      <td>
                        <strong>{w.name}</strong>
                        <small className="weapon-category">{w.category}</small>
                      </td>
                      <td>{number(w.kills)}</td>
                      <td>{number(w.damage)}</td>
                      <td>{number(w.headHit)}%</td>
                      <td>{number(w.distance)} m</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {section === "inventory" && (
        <>
          <input
            className="analytics-search"
            aria-label={pt ? "Buscar item" : "Find item"}
            placeholder={pt ? "Buscar item..." : "Find item..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p className="sample-warning">
            {pt
              ? "Preços em USD exibidos pelo CSREP/SkinSearch na importação. São estimativas históricas, não ofertas de compra."
              : "USD prices shown by CSREP/SkinSearch at import time. Historical estimates, not purchase offers."}
          </p>
          <div className="inventory-grid">
            {data.inventory
              ?.filter((item) =>
                item.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((item, index) => (
                <article
                  className="inventory-card"
                  key={`${item.name}-${index}`}
                >
                  <img loading="lazy" src={item.image} alt={item.name} />
                  <h3>{item.name}</h3>
                  <p>
                    {item.text
                      .split("\n")
                      .filter((s) => s !== item.name)
                      .join(" · ")}
                  </p>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Steam Market ↗
                  </a>
                </article>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
