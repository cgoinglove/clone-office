import { createTranslator } from "next-intl";
import { connector } from "@/features/minime/connectors/catalog";
import { finishConnect } from "@/features/minime/connectors/oauth";
import { listTools } from "@/features/minime/connectors/tools";
import { isLocale } from "@/i18n/locales";
import { loadMessages } from "@/i18n/messages";
import type english from "@/messages/en.json";

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Where a service sends the person back after they approved (or declined) in their browser. It is
// reached by the browser itself, so it carries no page header: the sign-in it finishes is the one
// its state names, started from this app's page, once.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tag = (request.headers.get("accept-language") ?? "en")
    .split(",")[0]
    .split("-")[0];
  const locale = isLocale(tag) ? tag : "en";
  const t = createTranslator({
    locale,
    messages: (await loadMessages(locale)) as typeof english,
    namespace: "connectors",
  });
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  let done: string | undefined;
  let problem: string | undefined;
  if (!state || !code || url.searchParams.get("error"))
    problem = t("callback.declined");
  else
    try {
      const id = await finishConnect(state, code);
      done = connector(id)?.name;
      // What it offers, and which of it only reads, is asked while the person reads this page.
      void listTools(id).catch(() => {});
    } catch {
      problem = t("callback.failed");
    }
  const words = done ? t("callback.done", { name: done }) : (problem ?? "");
  return new Response(
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>sub-office</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#fff;color:#16171a}main{max-width:28rem;padding:24px}p{margin:0 0 8px}small{color:#63666e}</style></head><body><main><p>${escape(words)}</p><small>${escape(t("callback.close"))}</small></main></body></html>`,
    {
      status: done ? 200 : 400,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'",
      },
    },
  );
}
