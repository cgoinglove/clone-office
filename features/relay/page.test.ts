import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateHost, joinCommand, osOf, servedPackage } from "./install";
import { escape, invitePage, pageLanguage, replyPage } from "./page";

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

test("the invite page names who invites, escaped, and guides the setup with one line", () => {
  const command = joinCommand({
    base: "http://office.example.com",
    key: "key",
    from: "<b>Ben</b>",
  });
  const page = invitePage({
    lang: "ko",
    from: "<b>Ben</b>",
    link: "http://office.example.com/i/key?from=Ben",
    os: "windows",
    command,
  });
  assert.ok(page.includes("&lt;b&gt;Ben&lt;/b&gt;님이 오피스에 초대했어요"));
  assert.ok(!page.includes("<b>Ben</b>"));
  assert.ok(page.includes("명령 프롬프트 열기"));
  assert.ok(page.includes("https://nodejs.org/en/download"));
  assert.ok(
    page.includes(
      "npx -y sub-office join &quot;http://office.example.com/i/key?from=%3Cb%3EBen%3C%2Fb%3E&quot;",
    ),
  );
});

test("the join line quotes the link and encodes what a shell would act on", () => {
  assert.equal(
    joinCommand({
      base: "http://192.168.0.7:3200",
      key: "k1",
      from: "Ana (PM)!",
    }),
    'npx -y sub-office join "http://192.168.0.7:3200/i/k1?from=Ana%20%28PM%29%21"',
  );
  assert.equal(
    joinCommand({ base: "https://office.example.com", key: "k1" }),
    'npx -y sub-office join "https://office.example.com/i/k1"',
  );
  // A relay serving the app's own package: the line takes the app from it.
  assert.equal(
    joinCommand({ base: "http://192.168.0.7:3200", key: "k1", served: true }),
    'npx -y --package="http://192.168.0.7:3200/sub-office.tgz" sub-office join "http://192.168.0.7:3200/i/k1"',
  );
  assert.equal(
    servedPackage({ SUB_OFFICE_PACKAGE_FILE: "/x/a.tgz" }),
    "/x/a.tgz",
  );
  assert.equal(
    servedPackage({ SUB_OFFICE_PACKAGE_FILE: "/etc/passwd" }),
    undefined,
  );
  assert.equal(servedPackage({}), undefined);
});

test("the guide follows the computer the page was opened on, and a phone is sent to a computer", () => {
  assert.equal(osOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "mac");
  assert.equal(osOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
  assert.equal(osOf("Mozilla/5.0 (X11; Linux x86_64)"), "linux");
  assert.equal(osOf("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "phone");
  assert.equal(
    osOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"),
    "phone",
  );
  assert.equal(osOf(undefined), "mac");
  const phone = invitePage({
    lang: "en",
    link: "http://192.168.0.7:3200/i/k1",
    os: "phone",
    command: "npx",
  });
  assert.ok(phone.includes("Open this link on your computer"));
  assert.ok(!phone.includes("npx -y"));
  assert.ok(isPrivateHost("192.168.0.7") && isPrivateHost("[fd12::1]"));
  assert.ok(!isPrivateHost("office.example.com"));
});
