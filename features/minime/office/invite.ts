// An invite to an office is one link: the relay's address and the office's key, as the relay's
// invite page (/i/<key>) is reached. Pasted where the relay goes, it fills in both. It runs on the
// page as well as on the server, so it uses nothing but the URL parser.

const INVITE = /\/i\/([\w-]{4,128})\/?$/;

/** The relay and key in an invite link, or undefined when the text is not one. */
export function parseInvite(
  text: string,
): { relay: string; key: string } | undefined {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  const match = INVITE.exec(url.pathname);
  if (!match) return undefined;
  const base = url.pathname.slice(0, match.index);
  return { relay: `${url.origin}${base}`, key: match[1] };
}
