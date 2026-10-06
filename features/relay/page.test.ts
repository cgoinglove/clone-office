import assert from "node:assert/strict";
import { test } from "node:test";
import { escape, pageLanguage, replyPage } from "./page";

test("the link page is in the reader's language when it is written in it, else English", () => {
  assert.equal(pageLanguage("ko-KR,ko;q=0.9,en;q=0.8"), "ko");
  assert.equal(pageLanguage("fr-FR,fr;q=0.9"), "en");
  assert.equal(pageLanguage(undefined), "en");
});

test("everything a person wrote is escaped on the page", () => {
  assert.equal(
    escape(`<a href="x">'&'</a>`),
    "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
  );
  const page = replyPage({
    lang: "en",
    asker: "<b>Ben</b>",
    name: "Jisoo",
    request: "<script>alert(1)</script> Friday?",
    state: "open",
  });
  assert.ok(!page.includes("<script>alert"));
  assert.ok(page.includes("&lt;script&gt;alert(1)&lt;/script&gt; Friday?"));
  assert.ok(page.includes("&lt;b&gt;Ben&lt;/b&gt; asks you"));
  assert.match(page, /<form method="post">/);
  assert.doesNotMatch(
    replyPage({
      lang: "ko",
      asker: "Ben",
      name: "지수",
      request: "?",
      state: "answered",
      answer: "네",
    }),
    /<form/,
  );
});
