import assert from "node:assert/strict";
import { test } from "node:test";
import { pieces, slackMrkdwn, telegramHtml } from "./text";

test("a code block cut between two pieces is closed in the first and opened again in the next", () => {
  const code = Array.from({ length: 8 }, (_, n) => `line ${n}`).join("\n");
  const out = pieces(`Before.\n\`\`\`ts\n${code}\n\`\`\`\nAfter.`, 40);
  for (const piece of out) {
    assert.ok(piece.length <= 40, piece);
    const fences = piece.split("\n").filter((line) => line.startsWith("```"));
    assert.equal(fences.length % 2, 0, `balanced: ${piece}`);
  }
  assert.ok(
    out.some((piece) => piece.startsWith("```ts\nline")),
    "opened again as it was",
  );
  assert.equal(
    out
      .join("\n")
      .replace(/```\n```ts\n/g, "")
      .includes("line 7"),
    true,
  );
  assert.equal(out.at(-1)?.endsWith("After."), true);
});

test("markdown is drawn in the HTML Telegram takes, and words stay words", () => {
  assert.equal(
    telegramHtml(
      "# Plan\n- **Ship** it *today*\n- see [docs](https://example.com/a?b=1&c=2)",
    ),
    '<b>Plan</b>\n• <b>Ship</b> it <i>today</i>\n• see <a href="https://example.com/a?b=1&amp;c=2">docs</a>',
  );
  assert.equal(
    telegramHtml("Use `a < b && c` in snake_case_names, not 2 * 3 * 4."),
    "Use <code>a &lt; b &amp;&amp; c</code> in snake_case_names, not 2 * 3 * 4.",
  );
  assert.equal(
    telegramHtml("```python\nif a < b:\n    print('**no marks**')\n```"),
    "<pre><code class=\"language-python\">if a &lt; b:\n    print('**no marks**')</code></pre>",
  );
  assert.equal(
    telegramHtml("> quoted <b>"),
    "<blockquote>quoted &lt;b&gt;</blockquote>",
  );
  assert.equal(
    telegramHtml("~~old~~ and __new__"),
    "<s>old</s> and <b>new</b>",
  );
});

test("markdown is drawn in Slack's mrkdwn, with &, < and > escaped", () => {
  assert.equal(
    slackMrkdwn(
      "## Plan\n- **Ship** it *today* or _later_\n- see [docs](https://example.com/a?b=1&c=2)",
    ),
    "*Plan*\n• *Ship* it _today_ or _later_\n• see <https://example.com/a?b=1&c=2|docs>",
  );
  assert.equal(
    slackMrkdwn("a < b && `c > d` ~~old~~"),
    "a &lt; b &amp;&amp; `c &gt; d` ~old~",
  );
  assert.equal(
    slackMrkdwn("```js\nif (a < b) **x**\n```"),
    "```\nif (a &lt; b) **x**\n```",
  );
});
