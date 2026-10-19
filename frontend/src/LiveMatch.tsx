import { useEffect, useState } from "react";
import { Activity, Check, Download, Wifi, WifiOff } from "lucide-react";
import type { Language } from "./i18n";

type MatchPlayer = { steamId: string; name: string; team: string; score: number | null; kills: number | null; deaths: number | null; assists: number | null };
type LiveState = {
  enabled: boolean;
  connected: boolean;
  updatedAt: string | null;
  map: string;
  phase: string;
  round: number | null;
  playerName: string;
  team: string;
  teamScore: number | null;
  opponentScore: number | null;
  health: number | null;
  armor: number | null;
  money: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  roundKills: number | null;
  roundDamage: number | null;
  players: MatchPlayer[];
};

const empty: LiveState = {
  enabled: false, connected: false, updatedAt: null, map: "", phase: "", round: null,
  playerName: "", team: "", teamScore: null, opponentScore: null, health: null,
  armor: null, money: null, kills: null, deaths: null, assists: null,
  roundKills: null, roundDamage: null, players: [],
};

export function LiveMatch({ lang }: { lang: Language }) {
  const pt = lang === "pt";
  const [state, setState] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => fetch("/api/v1/live", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<LiveState> : null)
      .then((value) => { if (active && value) setState(value); })
      .catch(() => { if (active) setError(pt ? "Não foi possível conectar ao serviço local." : "Could not connect to the local service."); });
    void refresh();
    const timer = state.enabled ? window.setInterval(refresh, 1000) : undefined;
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, [state.enabled, pt]);

  async function setMonitoring(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/live/${enabled ? "enable" : "disable"}`, { method: "POST" });
      if (!response.ok) throw new Error();
      setState(await response.json() as LiveState);
    } catch {
      setError(pt ? "Não foi possível atualizar o monitoramento. Confirme que a aplicação está rodando." : "Could not update monitoring. Make sure the app is running.");
    } finally {
      setBusy(false);
    }
  }

  const number = (item: number | null) => item == null ? "—" : item.toLocaleString(pt ? "pt-BR" : "en-US");

  return <section className="live-match-layout">
    <article className="panel live-match-card">
      <div className="panel-heading">
        <div><h3>{pt ? "Monitor de partida" : "Live match monitor"}</h3><p>{pt ? "Integração local opcional com o CS2" : "Optional local integration with CS2"}</p></div>
        <span className={`live-connection ${state.connected ? "online" : "offline"}`}>
          {state.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
          {state.connected ? (pt ? "Recebendo dados" : "Receiving data") : state.enabled ? (pt ? "Ativado · aguardando jogo" : "Enabled · waiting for game") : (pt ? "Desativado" : "Disabled")}
        </span>
      </div>

      {!state.enabled ? <div className="live-setup">
        <div className="live-setup-intro"><Activity size={25} /><div><h2>{pt ? "Ative quando quiser" : "Enable it when you are ready"}</h2><p>{pt ? "O monitoramento vem desligado. Instale a configuração GSI e habilite a recepção para compartilhar temporariamente o roster e os dados de placar enviados pelo CS2." : "Monitoring starts disabled. Install the GSI config and enable reception to temporarily share the roster and scoreboard data sent by CS2."}</p></div></div>
        <ol className="live-setup-steps">
          <li><span>1</span><div><strong>{pt ? "Baixe a configuração" : "Download the config"}</strong><small>{pt ? "Ela só envia dados para esta aplicação local." : "It sends data only to this local application."}</small><a className="button secondary" href="/gamestate_integration_cslab.cfg" download><Download size={14} />{pt ? "Baixar arquivo GSI" : "Download GSI file"}</a></div></li>
          <li><span>2</span><div><strong>{pt ? "Instale no CS2" : "Install it in CS2"}</strong><small>{pt ? "Mova o arquivo para game/csgo/cfg/ na pasta de instalação do jogo." : "Move the file into game/csgo/cfg/ in the game's install folder."}</small></div></li>
          <li><span>3</span><div><strong>{pt ? "Reinicie o jogo e habilite" : "Restart the game and enable"}</strong><small>{pt ? "Entre numa partida e habilite aqui. A conexão será confirmada quando chegar o primeiro pacote." : "Join a match and enable monitoring here. The connection is confirmed when the first packet arrives."}</small><button className="button primary" disabled={busy} onClick={() => setMonitoring(true)}><Check size={15} />{busy ? (pt ? "Ativando…" : "Enabling…") : (pt ? "Ativar monitoramento" : "Enable monitoring")}</button></div></li>
        </ol>
        <p className="live-consent-note">{pt ? "Enquanto ativado, o roster e as estatísticas recebidas ficam em memória local; são descartados ao desativar ou após 15 segundos sem atualização. Nenhuma posição de jogador é coletada." : "While enabled, received roster and statistics stay in local memory; they are cleared when disabled or after 15 seconds without updates. Player positions are not collected."}</p>
      </div> : <>
        {!state.connected ? <div className="live-waiting"><WifiOff size={25} /><p>{pt ? "Monitoramento ativado. Abra o CS2 e entre numa partida; esta tela detectará a conexão automaticamente." : "Monitoring is enabled. Open CS2 and join a match; this page will detect the connection automatically."}</p><a href="/gamestate_integration_cslab.cfg" download>{pt ? "Baixar novamente a configuração" : "Download the config again"}</a></div> : <>
          <div className="live-scoreboard">
            <div><small>{pt ? "Mapa" : "Map"}</small><strong>{state.map || "—"}</strong></div>
            <div><small>{pt ? "Fase" : "Phase"}</small><strong>{state.phase || "—"}</strong></div>
            <div><small>Round</small><strong>{number(state.round)}</strong></div>
            <div><small>{state.team || (pt ? "Seu time" : "Your team")}</small><strong>{number(state.teamScore)}</strong></div>
            <div><small>{pt ? "Adversário · placar" : "Opponent · score"}</small><strong>{number(state.opponentScore)}</strong></div>
          </div>
          <div className="live-player-stats">
            {[[pt ? "Jogador" : "Player", state.playerName || "—"], ["HP", number(state.health)], [pt ? "Colete" : "Armor", number(state.armor)], [pt ? "Dinheiro" : "Money", number(state.money)], ["K / D / A", `${number(state.kills)} / ${number(state.deaths)} / ${number(state.assists)}`], [pt ? "Abates no round" : "Round kills", number(state.roundKills)], [pt ? "Dano no round" : "Round damage", number(state.roundDamage)]].map(([label, stat]) => <div key={label}><small>{label}</small><strong>{stat}</strong></div>)}
          </div>
          <section className="live-roster">
            <div className="panel-heading"><div><h3>{pt ? "Jogadores nesta partida" : "Players in this match"}</h3><p>{pt ? "Nomes, times e estatísticas enviados pelo CS2" : "Names, teams and stats reported by CS2"}</p></div><strong>{state.players.length}</strong></div>
            {state.players.length ? <div className="live-roster-table"><div className="live-roster-head"><span>{pt ? "Jogador" : "Player"}</span><span>{pt ? "Time" : "Team"}</span><span>Score</span><span>K / D / A</span></div>
              {state.players.map((player, index) => <div className="live-roster-row" key={player.steamId || `${player.name}-${index}`}><strong>{player.name || player.steamId || (pt ? "Jogador sem ID" : "Player ID unavailable")}</strong><span>{player.team || "—"}</span><span>{number(player.score)}</span><span>{number(player.kills)} / {number(player.deaths)} / {number(player.assists)}</span></div>)}
            </div> : <p className="inspected-note">{pt ? "O CS2 não enviou a lista de jogadores neste pacote. Não vamos inventar identidades ou estatísticas." : "CS2 did not include a player list in this packet. We will not invent identities or stats."}</p>}
          </section>
          <p className="live-updated">{pt ? "Último pacote" : "Last packet"}: {state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString(pt ? "pt-BR" : "en-US") : "—"}</p>
        </>}
        <div className="live-disable-row"><p>{pt ? "Desativar interrompe a recepção e apaga os dados em memória. Para remover a integração do CS2, exclua gamestate_integration_cslab.cfg da pasta cfg." : "Disabling stops reception and clears in-memory data. To remove the CS2 integration, delete gamestate_integration_cslab.cfg from the cfg folder."}</p><button className="button secondary" disabled={busy} onClick={() => setMonitoring(false)}>{pt ? "Desativar e limpar" : "Disable and clear"}</button></div>
      </>}
      {error && <p className="live-error" role="alert">{error}</p>}
    </article>
  </section>;
}
