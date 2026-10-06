// What the mini-me writes is markdown; each messenger takes it in pieces of its own size and draws
// marks of its own: Discord its markdown as it is, Telegram a few HTML tags, Slack its mrkdwn (as
// Thursday's reach draws one text in each service's marks, features/reach/chat-text.ts). A code block cut in two is
// closed and opened again, so neither piece shows the other's code as words.

const FENCE = /^\s*```/;

/** Cuts a line too long for one piece where the reading breaks: at a space, else anywhere but inside a character. */
function cutAt(line: string, room: number): number {
  const space = line.lastIndexOf(" ", room);
  let at = space > room / 2 ? space : room;
  const code = line.charCodeAt(at - 1);
  if (code >= 0xd800 && code <= 0xdbff) at -= 1;
  return Math.max(1, at);
}

/** Text in pieces of at most `max` characters, cut between lines where it can be. */
export function pieces(text: string, max: number): string[] {
  const out: string[] = [];
  let lines: string[] = [];
  let used = 0;
  /** The line that opened the code block the text is in now. */
  let fence: string | undefined;
  const close = () => {
    const body = lines.join("\n").trim();
    if (body && body !== fence) out.push(fence ? `${body}\n\`\`\`` : body);
    lines = fence ? [fence] : [];
    used = fence ? fence.length : 0;
  };
  for (const line of text.replace(/\r\n/g, "\n").trim().split("\n")) {
    // Room is kept for closing a code block the piece ends inside.
    const room = max - (fence ? 4 : 0);
    let rest = line;
    for (;;) {
      const join = lines.length ? 1 : 0;
      if (used + join + rest.length <= room) {
        lines.push(rest);
        used += join + rest.length;
        break;
      }
      if (lines.length > (fence ? 1 : 0)) {
        close();
        continue;
      }
      const cut = cutAt(rest, room - used - join);
      lines.push(rest.slice(0, cut));
      used += join + cut;
      close();
      rest = rest.slice(cut).trimStart();
      if (!rest) break;
    }
    if (FENCE.test(line)) fence = fence ? undefined : line.trim();
  }
  close();
  return out.length ? out : [""];
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Marks inside one line: code, links, bold, italic, struck through. Anything else is words. */
function marks(text: string): string {
  // Code and links are set aside first, so nothing in them is read as a mark.
  const kept: string[] = [];
  const keep = (drawn: string) => {
    kept.push(drawn);
    return `${kept.length - 1}`;
  };
  let drawn = text
    .replace(/`([^`]+)`/g, (_, code: string) =>
      keep(`<code>${escapeHtml(code)}</code>`),
    )
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, words: string, url: string) =>
        keep(
          `<a href="${escapeHtml(url).replace(/"/g, "&quot;")}">${escapeHtml(words)}</a>`,
        ),
    );
  drawn = escapeHtml(drawn)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^\w])__(?=\S)(.+?)(?<=\S)__(?!\w)/g, "$1<b>$2</b>")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "<s>$1</s>")
    .replace(/(^|[^\w*])\*(?=[^\s*])([^*]*?[^\s*])\*(?![\w*])/g, "$1<i>$2</i>")
    .replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/g, "$1<i>$2</i>");
  return drawn.replace(
    /(\d+)/g,
    (_, index: string) => kept[Number(index)] ?? "",
  );
}

/**
 * Markdown in the HTML Telegram draws: headings as bold lines, list marks as bullets, code blocks
 * as code, and the marks inside a line. What Telegram cannot parse is sent again as plain words
 * (telegram.ts), so a mark read wrongly costs only its look.
 */
export function telegramHtml(markdown: string): string {
  const out: string[] = [];
  let code: { lang: string; lines: string[] } | undefined;
  const closeCode = () => {
    if (!code) return;
    const lang = /^[\w+-]{1,30}$/.test(code.lang) ? code.lang : "";
    out.push(
      `<pre>${lang ? `<code class="language-${lang}">` : "<code>"}${escapeHtml(code.lines.join("\n"))}</code></pre>`,
    );
    code = undefined;
  };
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) {
      if (code) closeCode();
      else code = { lang: line.trim().slice(3).trim(), lines: [] };
      continue;
    }
    if (code) {
      code.lines.push(line);
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    const item = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (heading) out.push(`<b>${marks(heading[1])}</b>`);
    else if (item) out.push(`${item[1]}• ${marks(item[2])}`);
    else if (quote) out.push(`<blockquote>${marks(quote[1])}</blockquote>`);
    else out.push(marks(line));
  }
  closeCode();
  return out.join("\n");
}

const escapeSlack = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Marks inside one line, in Slack's mrkdwn: *bold*, _italic_, ~struck~, <url|link>, `code`. */
function slackMarks(text: string): string {
  const kept: string[] = [];
  const keep = (drawn: string) => {
    kept.push(drawn);
    return `${kept.length - 1}`;
  };
  let drawn = text
    .replace(/`([^`]+)`/g, (_, code: string) =>
      keep(`\`${escapeSlack(code)}\``),
    )
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, words: string, url: string) =>
        keep(
          `<${url.replace(/[|>]/g, encodeURIComponent)}|${escapeSlack(words).replace(/[|>]/g, "")}>`,
        ),
    );
  drawn = escapeSlack(drawn)
    .replace(/(^|[^\w*])\*(?=[^\s*])([^*]*?[^\s*])\*(?![\w*])/g, "$1$2")
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "*$1*")
    .replace(/(^|[^\w])__(?=\S)(.+?)(?<=\S)__(?!\w)/g, "$1*$2*")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "~$1~")
    .replace(//g, "_");
  return drawn.replace(
    /(\d+)/g,
    (_, index: string) => kept[Number(index)] ?? "",
  );
}

/**
 * Markdown in Slack's mrkdwn: headings as bold lines, list marks as bullets, code blocks kept as
 * they are, and the marks inside a line; &, < and > escaped as Slack asks.
 */
export function slackMrkdwn(markdown: string): string {
  const out: string[] = [];
  let code = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) {
      code = !code;
      out.push("```");
      continue;
    }
    if (code) {
      out.push(escapeSlack(line));
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    const item = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (heading) out.push(`*${slackMarks(heading[1])}*`);
    else if (item) out.push(`${item[1]}• ${slackMarks(item[2])}`);
    else if (quote) out.push(`>${slackMarks(quote[1])}`);
    else out.push(slackMarks(line));
  }
  return out.join("\n");
}
