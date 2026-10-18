import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ExternalLink, Search } from "lucide-react";
import { getJson, type Profile } from "./data";
import type { Language } from "./i18n";

export function PlayerSearch({
  lang,
  onSelect,
}: {
  lang: Language;
  onSelect: (profile: Profile) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [nameSearch, setNameSearch] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const pt = lang === "pt";
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    request.current?.abort();
    setError(false);
    setNameSearch("");
    const direct =
      /^7656119\d{10}$/.test(value) ||
      /^(https?:\/\/)?steamcommunity\.com\//i.test(value);
    if (!direct) {
      setBusy(false);
      setNameSearch(value);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const profile = await getJson<Profile>(
        `/api/v1/players/lookup?query=${encodeURIComponent(value)}`,
        controller.signal,
      );
      if (!controller.signal.aborted) onSelect(profile);
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
              ? "SteamID64, link do perfil ou nome do jogador"
              : "SteamID64, profile URL or player name"
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
          ? "SteamID64 ou URL abre o perfil aqui. Nome abre a busca de pessoas na Steam."
          : "A SteamID64 or URL opens the profile here. A name opens Steam people search."}
      </p>
      {error && (
        <p role="alert">
          {pt
            ? "Perfil não encontrado ou Steam indisponível. Use um SteamID64 de 17 dígitos ou um link steamcommunity.com/profiles/... ou /id/..."
            : "Profile not found or Steam unavailable. Use a 17-digit SteamID64 or a steamcommunity.com/profiles/... or /id/... URL."}
        </p>
      )}
      {nameSearch && (
        <div className="steam-search-result" role="status">
          <p>
            {pt
              ? "A Steam pode pedir login para pesquisar por nome. Copie o link do jogador encontrado e cole no campo acima para abrir aqui."
              : "Steam may require sign-in for name searches. Copy the chosen player’s profile URL and paste it above to open it here."}
          </p>
          <a
            className="button secondary"
            target="_blank"
            rel="noreferrer"
            href={`https://steamcommunity.com/search/users/#text=${encodeURIComponent(nameSearch)}`}
          >
            {pt
              ? `Buscar “${nameSearch}” na Steam`
              : `Search Steam for “${nameSearch}”`}
            <ExternalLink size={15} />
          </a>
        </div>
      )}
    </section>
  );
}
