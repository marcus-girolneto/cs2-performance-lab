import { useEffect, useState } from "react";
import { LogIn, LogOut, UserRound } from "lucide-react";
import type { Language } from "./i18n";

type Session = { authenticated: boolean; steamId?: string; csrfToken?: string };
export function SteamLogin({
  lang,
  onProfile,
}: {
  lang: Language;
  onProfile: (id: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [failed, setFailed] = useState(
    new URLSearchParams(location.search).get("login") === "failed",
  );
  const [busy, setBusy] = useState(false);
  const pt = lang === "pt";
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/auth/session", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((value: Session) => {
        setSession(value);
        if (
          value.authenticated &&
          value.steamId &&
          new URLSearchParams(location.search).get("login") === "success"
        )
          onProfile(value.steamId);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);
  async function logout() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": session?.csrfToken ?? "" },
      });
      if (!response.ok) throw new Error();
      setSession({ authenticated: false });
      history.replaceState(null, "", location.pathname);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="steam-login">
      {session?.authenticated ? (
        <>
          <button
            className="button secondary"
            onClick={() => session.steamId && onProfile(session.steamId)}
          >
            <UserRound size={15} />
            {pt ? "Meu perfil" : "My profile"}
          </button>
          <button
            className="icon-button"
            disabled={busy}
            onClick={logout}
            aria-label={pt ? "Sair" : "Sign out"}
          >
            <LogOut size={16} />
          </button>
        </>
      ) : (
        <a className="button primary" href="/api/v1/auth/steam">
          <LogIn size={15} />
          {pt ? "Entrar com Steam" : "Sign in with Steam"}
        </a>
      )}
      {failed && (
        <span role="alert">
          {pt
            ? "Não foi possível validar a sessão. Tente entrar novamente."
            : "Could not validate the session. Try signing in again."}
        </span>
      )}
    </div>
  );
}
