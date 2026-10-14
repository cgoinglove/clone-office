import assert from "node:assert/strict";
import { test } from "node:test";
import {
  askingNodeNow,
  forgetNodeLts,
  INSTALL_SCRIPT_PATH,
  isPrivateHost,
  joinCommand,
  latestLts,
  nodeInstallers,
  osOf,
  servedPackage,
} from "./install";
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
  // A messenger's preview of the link says who asks, never what.
  assert.match(
    page,
    /<meta property="og:title" content="&lt;b&gt;Ben&lt;\/b&gt; asks you"/,
  );
  const preview = /<meta property="og:description" content="([^"]*)"/.exec(
    page,
  )?.[1];
  assert.ok(preview?.includes("Clone Office"));
  assert.doesNotMatch(preview ?? "", /Friday/);
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
  assert.ok(page.includes("&lt;b&gt;Ben&lt;/b&gt; 님이 오피스에 초대했어요"));
  assert.ok(!page.includes("<b>Ben</b>"));
  assert.ok(page.includes("명령 프롬프트 열기"));
  assert.ok(page.includes("https://nodejs.org/en/download"));
  assert.ok(
    page.includes(
      "npx -y clone-office join &quot;http://office.example.com/i/key?from=%3Cb%3EBen%3C%2Fb%3E&quot;",
    ),
  );
  // The same steps for the person's own AI on their computer, folded, with the same line in them.
  assert.ok(page.includes("내 컴퓨터에서 일하는 AI를 쓰나요?"));
  assert.ok(page.includes("Set up Clone Office on this computer for me."));
  assert.equal(
    page.split("npx -y clone-office join &quot;http://office.example.com/i/key")
      .length,
    5,
    "the line to run on each kind of computer, and again in the words for the AI",
  );
  // The computer it was opened on is the tab picked; the others are a tap away, with no script.
  assert.match(page, /id="computer-windows" class="pick-windows" checked/);
  assert.doesNotMatch(page, /id="computer-mac" class="pick-mac" checked/);
  assert.ok(page.includes("<kbd>Ctrl</kbd>+<kbd>V</kbd>"));
  // What goes wrong, answered, with the same app's own check to run.
  assert.ok(page.includes("안 될 때"));
  assert.ok(page.includes("<code>npx -y clone-office doctor</code>"));
  // The Copy button is the only script, from this server.
  assert.ok(
    page.includes(`<script type="module" src="${INSTALL_SCRIPT_PATH}">`),
  );
  assert.ok(page.includes('data-copy="line-windows"'));
});

test("the guide links Node.js's own installers once they are known, else its download page", () => {
  const page = (installers?: { mac: string; windows: string }) =>
    invitePage({
      lang: "en",
      link: "https://office.example.com/i/k1",
      os: "mac",
      command: joinCommand({ base: "https://office.example.com", key: "k1" }),
      ...(installers ? { installers } : {}),
    });
  assert.ok(page().includes('href="https://nodejs.org/en/download"'));
  const known = page({
    mac: "https://nodejs.org/dist/v24.21.0/node-v24.21.0.pkg",
    windows: "https://nodejs.org/dist/v24.21.0/node-v24.21.0-x64.msi",
  });
  assert.ok(
    known.includes('href="https://nodejs.org/dist/v24.21.0/node-v24.21.0.pkg"'),
  );
  assert.ok(
    known.includes(
      'href="https://nodejs.org/dist/v24.21.0/node-v24.21.0-x64.msi"',
    ),
  );
});

test("the current LTS comes from Node.js's release list, asked in the background", async () => {
  const list = (releases: unknown, ok = true) =>
    (async () =>
      new Response(JSON.stringify(releases), {
        status: ok ? 200 : 500,
      })) as unknown as typeof fetch;
  const releases = [
    { version: "v26.11.1", lts: false, files: ["osx-x64-pkg", "win-x64-msi"] },
    {
      version: "v24.21.0",
      lts: "Krypton",
      files: ["osx-x64-pkg", "win-x64-msi"],
    },
  ];
  assert.equal(await latestLts(list(releases)), "v24.21.0");
  assert.equal(await latestLts(list(releases, false)), undefined);
  // anything but a version never goes into an address
  assert.equal(
    await latestLts(
      list([
        { version: "v1/../x", lts: "x", files: ["osx-x64-pkg", "win-x64-msi"] },
      ]),
    ),
    undefined,
  );
  forgetNodeLts();
  const first = nodeInstallers(0, list(releases));
  assert.equal(
    first.mac,
    "https://nodejs.org/en/download",
    "not known yet: the page",
  );
  await askingNodeNow();
  assert.deepEqual(nodeInstallers(1, list([])), {
    mac: "https://nodejs.org/dist/v24.21.0/node-v24.21.0.pkg",
    windows: "https://nodejs.org/dist/v24.21.0/node-v24.21.0-x64.msi",
  });
  forgetNodeLts();
});

test("the join line quotes the link and encodes what a shell would act on", () => {
  assert.equal(
    joinCommand({
      base: "http://192.168.0.7:3200",
      key: "k1",
      from: "Ana (PM)!",
    }),
    'npx -y clone-office join "http://192.168.0.7:3200/i/k1?from=Ana%20%28PM%29%21"',
  );
  assert.equal(
    joinCommand({ base: "https://office.example.com", key: "k1" }),
    'npx -y clone-office join "https://office.example.com/i/k1"',
  );
  // A relay serving the app's own package: the line takes the app from it.
  assert.equal(
    joinCommand({ base: "http://192.168.0.7:3200", key: "k1", served: true }),
    'npx -y --package="http://192.168.0.7:3200/clone-office.tgz" clone-office join "http://192.168.0.7:3200/i/k1"',
  );
  assert.equal(
    servedPackage({ CLONE_OFFICE_PACKAGE_FILE: "/x/a.tgz" }),
    "/x/a.tgz",
  );
  assert.equal(
    servedPackage({ CLONE_OFFICE_PACKAGE_FILE: "/etc/passwd" }),
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
