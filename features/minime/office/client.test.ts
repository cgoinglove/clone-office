import assert from "node:assert/strict";
import { test } from "node:test";
import { onRelay } from "./client.ts";

test("a page the relay names is taken only as a page on the relay itself", () => {
  const relay = "http://192.168.0.7:3200";
  assert.equal(onRelay("/i/abc?from=Ana", relay), `${relay}/i/abc?from=Ana`);
  assert.equal(onRelay("/setup/x#y", `${relay}/`), `${relay}/setup/x#y`);
  for (const path of [
    "javascript:alert(1)",
    "//evil.example/x",
    "/\\evil.example/x",
    "https://evil.example/login",
    "data:text/html,hi",
    "i/abc",
    "",
  ])
    assert.throws(
      () => onRelay(path, relay),
      { code: "relay-unreachable" },
      path,
    );
});
