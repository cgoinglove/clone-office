"use client";

// The services the mini-me can work in (connectors/): each connected from here, the way each
// vendor wants. A service that registers this app itself is one press and an approval in a new
// tab; GitHub takes a personal token; Google wants an OAuth client registered for the team first,
// which anyone on the team does once here (for the whole office), then each person connects their
// own account. What is connected stays on this computer; the mini-me asks before using it.

import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProblem } from "@/i18n/client";
import { CONNECTORS } from "./connectors/catalog";

interface Row {
  id: string;
  name: string;
  kind: "oauth" | "team-oauth" | "token";
  docs: string;
  make?: string;
  provider?: string;
  connected: boolean;
  since?: string;
}

interface State {
  connectors: Row[];
  inOffice: boolean;
  clients: { google: { from: "team" | "own"; by?: string } | null };
}

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

// Registering the team's Google client, a page at a time in Google Cloud's console: what to turn
// on and what to paste come from the catalog, so they always match what the mini-me asks for.
const GOOGLE = CONNECTORS.flatMap((entry) =>
  entry.auth.kind === "team-oauth" && entry.auth.provider === "google"
    ? [entry.auth]
    : [],
);
const GOOGLE_SCOPES = [...new Set(GOOGLE.flatMap((auth) => auth.scopes))];
const CONSOLE = "https://console.cloud.google.com";
const GOOGLE_LINKS = {
  preview: "https://developers.google.com/workspace/preview",
  apis: `${CONSOLE}/flows/enableapi?apiid=${[...new Set(GOOGLE.flatMap((auth) => auth.apis))].join(",")}`,
  branding: `${CONSOLE}/auth/branding`,
  audience: `${CONSOLE}/auth/audience`,
  scopes: `${CONSOLE}/auth/scopes`,
  client: `${CONSOLE}/auth/clients/create`,
};
/** A client's JSON file from Google is well under this. */
const CLIENT_FILE_CHARS = 5000;

const outLink = (href: string) => (chunks: ReactNode) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="text-foreground underline underline-offset-4"
  >
    {chunks}
  </a>
);

export function ConnectorsPanel() {
  const t = useTranslations("connectors");
  const problemText = useProblem();
  const [state, setState] = useState<State | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [settingUp, setSettingUp] = useState(false);
  const [client, setClient] = useState({ id: "", secret: "" });
  const [forTeam, setForTeam] = useState(true);
  const [scopesCopied, setScopesCopied] = useState(false);
  // This app's address as the browser has it, for a Web application client's redirect.
  const [origin, setOrigin] = useState("");
  const clientFile = useRef<HTMLInputElement>(null);
  const stopWaiting = useRef<ReturnType<typeof setInterval>>(undefined);

  const load = useCallback(async () => {
    const data = (await fetch("/api/me/connectors", { headers: HEADERS })
      .then((r) => r.json())
      .catch(() => null)) as State | null;
    if (data?.connectors) setState(data);
    return data;
  }, []);

  useEffect(() => {
    void load();
    setOrigin(window.location.origin);
    return () => clearInterval(stopWaiting.current);
  }, [load]);

  const post = async (body: unknown) => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/me/connectors", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setProblem(String(data.error ?? response.status));
      await load();
      return response.ok ? data : undefined;
    } finally {
      setBusy(false);
    }
  };

  const connect = async (id: string) => {
    // Opened at the press, so the browser lets the tab open; the address comes a moment later.
    const tab = window.open("about:blank", "_blank");
    const data = (await post({ action: "connect", id })) as
      | { authorize?: string }
      | undefined;
    if (!data?.authorize) {
      tab?.close();
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = data.authorize;
    } else window.location.href = data.authorize;
    setWaiting(id);
    clearInterval(stopWaiting.current);
    const until = Date.now() + 3 * 60 * 1000;
    stopWaiting.current = setInterval(async () => {
      const next = await load();
      const done = next?.connectors.find((row) => row.id === id)?.connected;
      if (done || Date.now() > until) {
        clearInterval(stopWaiting.current);
        setWaiting(null);
      }
    }, 2000);
  };

  const saveGoogle = async (
    given: { json: string } | { clientId: string; clientSecret: string },
  ) => {
    const ok = await post({
      action: "client",
      provider: "google",
      ...given,
      team: Boolean(state?.inOffice && forTeam),
    });
    if (!ok) return;
    setSettingUp(false);
    setClient({ id: "", secret: "" });
  };

  const rows = state?.connectors ?? [];
  const google = rows.filter((row) => row.provider === "google");
  const others = rows.filter((row) => row.provider !== "google");
  const googleClient = state?.clients.google;
  const count = rows.filter((row) => row.connected).length;

  const row = (entry: Row, blocked = false) => (
    <li
      key={entry.id}
      className="flex flex-col gap-2 border-b border-border py-2 last:border-b-0"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="font-medium">{entry.name}</span>
          <span className="block text-muted-foreground">
            {t(`does.${entry.id}` as Parameters<typeof t>[0])}
          </span>
        </span>
        {entry.connected ? (
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("connected")}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void post({ action: "disconnect", id: entry.id })}
            >
              {t("disconnect")}
            </Button>
          </span>
        ) : entry.kind === "token" ? null : (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={busy || blocked || waiting !== null}
            loading={waiting === entry.id}
            onClick={() => void connect(entry.id)}
          >
            {t("connect")}
          </Button>
        )}
      </div>
      {waiting === entry.id && (
        <p className="text-muted-foreground">{t("connecting")}</p>
      )}
      {entry.kind === "token" && !entry.connected && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void post({
              action: "token",
              id: entry.id,
              token: tokens[entry.id] ?? "",
            }).then((ok) => {
              if (ok) setTokens((all) => ({ ...all, [entry.id]: "" }));
            });
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1"
            value={tokens[entry.id] ?? ""}
            placeholder={t("tokenPlaceholder")}
            onChange={(event) =>
              setTokens((all) => ({ ...all, [entry.id]: event.target.value }))
            }
          />
          <Button
            type="submit"
            size="sm"
            disabled={busy || (tokens[entry.id] ?? "").trim().length < 20}
          >
            {t("save")}
          </Button>
          {entry.make && (
            <a
              href={entry.make}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              {t("makeToken")}
            </a>
          )}
        </form>
      )}
    </li>
  );

  return (
    <details className="rounded-xl border border-border p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        {t("title")}
        {count > 0 && (
          <span className="ml-2 text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <p className="text-muted-foreground">{t("intro")}</p>
        <ul className="flex flex-col">{others.map((entry) => row(entry))}</ul>
        {google.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">{t("google.title")}</h3>
            {googleClient ? (
              <p className="text-muted-foreground">
                {googleClient.from === "team"
                  ? googleClient.by
                    ? t("google.byTeam", { name: googleClient.by })
                    : t("google.byTeamNoName")
                  : t("google.own")}{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() =>
                    void post({
                      action: "forget-client",
                      provider: "google",
                      from: googleClient.from,
                    })
                  }
                >
                  {t("google.forget")}
                </button>
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground">
                  {t("google.needsClient")} {t("google.preview")}
                </p>
                {settingUp ? (
                  <ol className="flex list-decimal flex-col gap-3 pl-5 text-muted-foreground">
                    <li>
                      {t.rich("google.steps.preview", {
                        link: outLink(GOOGLE_LINKS.preview),
                      })}
                    </li>
                    <li>
                      {t.rich("google.steps.apis", {
                        link: outLink(GOOGLE_LINKS.apis),
                      })}
                    </li>
                    <li>
                      {t.rich("google.steps.branding", {
                        link: outLink(GOOGLE_LINKS.branding),
                        audience: outLink(GOOGLE_LINKS.audience),
                      })}
                    </li>
                    <li>
                      <div className="flex flex-col gap-2">
                        <span>
                          {t.rich("google.steps.scopes", {
                            link: outLink(GOOGLE_LINKS.scopes),
                          })}
                        </span>
                        <pre className="overflow-x-auto rounded-lg border border-border p-2 font-mono text-xs text-foreground select-all">
                          {GOOGLE_SCOPES.join(",\n")}
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="self-start"
                          onClick={() =>
                            void navigator.clipboard
                              ?.writeText(GOOGLE_SCOPES.join(",\n"))
                              .then(() => setScopesCopied(true))
                              .catch(() => {})
                          }
                        >
                          {scopesCopied
                            ? t("google.copied")
                            : t("google.copyScopes")}
                        </Button>
                      </div>
                    </li>
                    <li>
                      <div className="flex flex-col gap-1">
                        <span>
                          {t.rich("google.steps.client", {
                            link: outLink(GOOGLE_LINKS.client),
                          })}
                        </span>
                        {origin && (
                          <span className="text-xs">
                            {t("google.webClient")}{" "}
                            <code className="break-all text-foreground select-all">
                              {origin}/api/me/connectors/callback
                            </code>
                          </span>
                        )}
                      </div>
                    </li>
                    <li>
                      <div className="flex flex-col gap-2">
                        <span>{t("google.steps.file")}</span>
                        {state?.inOffice && (
                          <label className="flex items-center gap-2 text-foreground">
                            <input
                              type="checkbox"
                              checked={forTeam}
                              onChange={(event) =>
                                setForTeam(event.target.checked)
                              }
                            />
                            {t("google.forTeam")}
                          </label>
                        )}
                        <input
                          ref={clientFile}
                          type="file"
                          accept=".json,application/json"
                          hidden
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (!file) return;
                            const json =
                              file.size <= CLIENT_FILE_CHARS
                                ? await file.text().catch(() => "")
                                : "";
                            if (!json.trim()) {
                              setProblem("connector-client-wrong");
                              return;
                            }
                            void saveGoogle({ json });
                          }}
                        />
                        <Button
                          size="sm"
                          className="self-start"
                          disabled={busy}
                          onClick={() => clientFile.current?.click()}
                        >
                          {t("google.chooseFile")}
                        </Button>
                        <details>
                          <summary className="cursor-pointer">
                            {t("google.typeIt")}
                          </summary>
                          <form
                            className="mt-2 flex flex-col gap-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveGoogle({
                                clientId: client.id,
                                clientSecret: client.secret,
                              });
                            }}
                          >
                            <Input
                              autoComplete="off"
                              spellCheck={false}
                              value={client.id}
                              placeholder={t("google.clientId")}
                              onChange={(event) =>
                                setClient((c) => ({
                                  ...c,
                                  id: event.target.value,
                                }))
                              }
                            />
                            <Input
                              type="password"
                              autoComplete="off"
                              spellCheck={false}
                              value={client.secret}
                              placeholder={t("google.clientSecret")}
                              onChange={(event) =>
                                setClient((c) => ({
                                  ...c,
                                  secret: event.target.value,
                                }))
                              }
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="self-start"
                              disabled={busy || client.id.trim().length < 10}
                            >
                              {t("save")}
                            </Button>
                          </form>
                        </details>
                      </div>
                    </li>
                  </ol>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={() => setSettingUp(true)}
                  >
                    {t("google.setUp")}
                  </Button>
                )}
              </div>
            )}
            <ul className="flex flex-col">
              {google.map((entry) => row(entry, !googleClient))}
            </ul>
          </section>
        )}
        {problem && <p className="text-destructive">{problemText(problem)}</p>}
      </div>
    </details>
  );
}
