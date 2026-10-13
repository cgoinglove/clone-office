import assert from "node:assert/strict";
import { test } from "node:test";
import { isNewer, updateStatus } from "./update.ts";

const npm = (version: unknown, ok = true) =>
  (async () =>
    new Response(JSON.stringify({ version }), {
      status: ok ? 200 : 500,
    })) as typeof fetch;

test("a newer plain release is offered with the line that starts it; anything else is not", async () => {
  assert.equal(isNewer("0.2.0", "0.1.9"), true);
  assert.equal(isNewer("0.10.0", "0.9.0"), true);
  assert.equal(isNewer("0.1.0", "0.1.0"), false);
  assert.equal(
    isNewer("0.2.0-next.4", "0.1.0"),
    false,
    "a canary is never offered",
  );
  assert.equal(
    isNewer("0.2.0", "0.2.0-next.4"),
    true,
    "its release, to one on the canary",
  );
  assert.equal(isNewer("0.1.0", "0.2.0-next.4"), false);
  assert.equal(isNewer("0.3.0", "0.2.0-next.4"), true);

  (globalThis as { __cloneOfficeLatest?: unknown }).__cloneOfficeLatest =
    undefined;
  assert.deepEqual(await updateStatus("0.1.0", true, npm("0.2.0")), {
    current: "0.1.0",
    newer: "0.2.0",
    command: "npx -y clone-office@latest",
  });
  // Asked once in six hours: the next page reads what came back.
  assert.equal(
    (await updateStatus("0.1.0", true, npm("9.9.9"))).newer,
    "0.2.0",
  );

  (globalThis as { __cloneOfficeLatest?: unknown }).__cloneOfficeLatest =
    undefined;
  assert.equal(
    (await updateStatus("0.1.0", true, npm("x", false))).newer,
    null,
  );
  // Run from source, nothing is asked.
  let asked = false;
  await updateStatus("0.1.0", false, (async () => {
    asked = true;
    return new Response("{}");
  }) as typeof fetch);
  assert.equal(asked, false);
});

test("inside the desktop app, the app says what is newer, ready or to download; npm is not asked", async () => {
  let asked = false;
  const npmAsked = (async () => {
    asked = true;
    return new Response("{}");
  }) as typeof fetch;
  assert.deepEqual(
    await updateStatus("0.1.0", true, npmAsked, async () => ({
      newer: "0.2.0",
      ready: true,
      download: null,
    })),
    {
      current: "0.1.0",
      newer: "0.2.0",
      command: null,
      ready: true,
      download: null,
    },
  );
  assert.deepEqual(
    await updateStatus("0.1.0", true, npmAsked, async () => ({
      newer: "0.2.0",
      ready: false,
      download: "https://github.com/o/r/releases/tag/v0.2.0",
    })),
    {
      current: "0.1.0",
      newer: "0.2.0",
      command: null,
      ready: false,
      download: "https://github.com/o/r/releases/tag/v0.2.0",
    },
  );
  // Nothing newer, or the app did not answer: nothing is offered.
  for (const said of [
    { newer: "0.1.0", ready: true, download: "x" },
    undefined,
  ])
    assert.deepEqual(
      await updateStatus("0.1.0", true, npmAsked, async () => said),
      {
        current: "0.1.0",
        newer: null,
        command: null,
        ready: false,
        download: null,
      },
    );
  assert.equal(asked, false);
});
