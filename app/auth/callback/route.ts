import { createTranslator } from "next-intl";
import { ChatGptError, finishSignIn } from "@/features/minime/brain/chatgpt";
import { isLocale } from "@/i18n/locales";
import { loadMessages } from "@/i18n/messages";
import type english from "@/messages/en.json";

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Where OpenAI sends the person back after Sign in with ChatGPT (this path on 127.0.0.1, only the
// port varying, as OpenAI asks of a local app). Reached by the browser itself, so it carries no
// page header: the sign-in it finishes is the one its state names, started from this app, once.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tag = (request.headers.get("accept-language") ?? "en")
    .split(",")[0]
    .split("-")[0];
  const locale = isLocale(tag) ? tag : "en";
  const t = createTranslator({
    locale,
    messages: (await loadMessages(locale)) as typeof english,
    namespace: "brain.chatgpt",
  });
  let words: string;
  let ok = false;
  try {
    const { email } = await finishSignIn(url.searchParams);
    words = email ? t("doneAs", { email }) : t("done");
    ok = true;
  } catch (error) {
    words =
      error instanceof ChatGptError && error.code === "chatgpt-declined"
        ? t("declined")
        : t("failed");
  }
  return new Response(
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clone Office</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#fff;color:#16171a}main{max-width:28rem;padding:24px}p{margin:0 0 8px}small{color:#63666e}</style></head><body><main><p>${escape(words)}</p><small>${escape(t("close"))}</small></main></body></html>`,
    {
      status: ok ? 200 : 400,
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
