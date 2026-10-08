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
  assert.equal(isNewer("0.2.0-next.4", "0.1.0"), false, "a canary is not");

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
