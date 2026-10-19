import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Search } from "lucide-react";
import { getJson, type Profile, type SearchHit } from "./data";
import type { Language } from "./i18n";

const steamId = (value: string) => value.match(/^7656119\d{10}$/)?.[0];
const leetifyId = (value: string) => value.match(/^(?:https?:\/\/)?(?:www\.)?leetify\.com\/app\/profile\/(7656119\d{10})\/?(?:[?#].*)?$/i)?.[1];
const faceitName = (value: string) => value.match(/^(?:https?:\/\/)?(?:www\.)?faceit\.com\/(?:[a-z]{2}\/)?players\/([a-z\d._-]{1,64})\/?(?:[?#].*)?$/i)?.[1];
const steamProfile = (value: string) => /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(?:profiles\/7656119\d{10}|id\/[a-z\d_-]{1,64})\/?(?:[?#].*)?$/i.test(value);
const matchCode = (value: string) => /^CSGO-(?:[A-Za-z0-9]{5}-){4}[A-Za-z0-9]{5}$/i.test(value);

export function PlayerSearch({
  lang,
  onSelect,
}: {
  lang: Language;
  onSelect: (profile: Profile) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const pt = lang === "pt";

  useEffect(() => {
    const value = query.trim();
    const direct = steamId(value) || leetifyId(value) || steamProfile(value);
    const term = faceitName(value) || value;
    if (matchCode(value)) {
      setResults([]);
      setSuggesting(false);
      setSearched(false);
      setError(false);
      return;
    }
    if (term.length < 2 || direct) {
      setResults([]);
      setSuggesting(false);
      setSearched(false);
      setError(false);
      return;
    }
    setResults([]);
    setSuggesting(true);
    setSearched(false);
    setError(false);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getJson<SearchHit[]>(`/api/v1/players/search?query=${encodeURIComponent(term)}`, controller.signal)
        .then((hits) => {
          if (!controller.signal.aborted) {
            setResults(hits);
            setSuggesting(false);
            setSearched(true);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults([]);
            setSuggesting(false);
            setSearched(false);
            setError(true);
          }
        });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  async function openProfile(url: string, signal: AbortSignal) {
    const profile = await getJson<Profile>(
      `/api/v1/players/lookup?query=${encodeURIComponent(url)}`,
      signal,
    );
    if (!signal.aborted) onSelect(profile);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    if (matchCode(value)) {
      setResults([]);
      setError(false);
      setSearched(false);
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(false);
    setSuggesting(false);
    setResults([]);
    setBusy(true);
    try {
      if (steamId(value) || leetifyId(value) || steamProfile(value)) {
        await openProfile(value, controller.signal);
      } else {
        const faceit = faceitName(value);
        if (faceit) {
          try {
            await openProfile(value, controller.signal);
            return;
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        const term = faceit || value;
        const hits = await getJson<SearchHit[]>(
          `/api/v1/players/search?query=${encodeURIComponent(term)}`,
          controller.signal,
        );
        if (!controller.signal.aborted) setResults(hits);
        if (!hits.length && !controller.signal.aborted) setError(true);
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function select(hit: SearchHit) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    try {
      await openProfile(hit.profileUrl, controller.signal);
      setResults([]);
      setQuery("");
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="player-search">
      <form onSubmit={submit}>
        <Search size={19} />
        <input
          aria-label={pt ? "Buscar jogador" : "Find player"}
          placeholder={
            pt
              ? "SteamID, nome, link Steam/Leetify/FACEIT ou código de partida"
              : "SteamID, name, Steam/Leetify/FACEIT link or match code"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
          required
        />
        <button className="button primary" disabled={busy} type="submit">
          {busy
            ? pt
              ? "Buscando..."
              : "Searching..."
            : pt
              ? "Buscar jogador"
              : "Find player"}
          <ArrowRight size={15} />
        </button>
      </form>
      <p>
        {pt
          ? "Digite pelo menos 2 caracteres. Quando conectado, a busca também procura nos seus amigos públicos da Steam."
          : "Type at least 2 characters. When signed in, search also checks your public Steam friends."}
      </p>
      <p className="supported-search-formats">
        {pt
          ? "Formatos: SteamID64 · Steam/CSRep · Leetify · FACEIT · código CSGO-"
          : "Formats: SteamID64 · Steam/CSRep · Leetify · FACEIT · CSGO- match code"}
      </p>
      {matchCode(query.trim()) && (
        <p role="status">
          {pt
            ? "Código de partida reconhecido. A Steam não disponibiliza os dados da partida por este código; é necessário importar o demo ou usar uma fonte de partidas conectada."
            : "Match code recognized. Steam does not expose match data through this code; import the demo or use a connected match source."}
        </p>
      )}
      {suggesting && (
        <p role="status">{pt ? "Buscando jogadores na Steam..." : "Searching Steam players..."}</p>
      )}
      {searched && !results.length && !error && (
        <p role="status">{pt ? "Nenhum perfil encontrado com esse nome." : "No profiles found for this name."}</p>
      )}
      {error && (
        <p role="alert">
          {pt
            ? "Não encontramos resultados ou a Steam está indisponível. Tente outro nome ou use o SteamID64/link completo."
            : "No results found or Steam is unavailable. Try another name or use a SteamID64/full profile link."}
        </p>
      )}
      {!!results.length && (
        <div className="player-search-results" role="listbox" aria-label={pt ? "Resultados da Steam" : "Steam results"}>
          {results.map((hit) => (
            <button
              className="player-search-result"
              key={hit.profileUrl}
              type="button"
              role="option"
              disabled={busy}
              onClick={() => select(hit)}
            >
              {hit.avatar ? <img src={hit.avatar} alt="" /> : <span className="search-avatar" />}
              <span><strong>{hit.name}</strong><small>{hit.source === "friends"
                ? pt ? "Amigo público da sua Steam" : "Public Steam friend"
                : hit.profileUrl.replace("https://steamcommunity.com/", "")}</small></span>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
