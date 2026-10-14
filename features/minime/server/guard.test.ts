import assert from "node:assert/strict";
import { test } from "node:test";
import { loopback, MINIME_HEADER, refuse } from "./guard.ts";

const asked = (host: string, origin?: string) =>
  new Request(`http://${host}/api/me/memory`, {
    headers: {
      host,
      [MINIME_HEADER]: "1",
      ...(origin ? { origin } : {}),
    },
  });

test("the app's own routes answer only its pages, on this computer's own names", () => {
  assert.equal(
    refuse(asked("127.0.0.1:4417", "http://127.0.0.1:4417")),
    undefined,
  );
  assert.equal(
    refuse(asked("localhost:4417", "http://localhost:4417")),
    undefined,
  );
  assert.equal(refuse(asked("[::1]:4417")), undefined);
  // a page whose name was pointed at this computer: same origin, header and all, still refused
  assert.equal(
    refuse(asked("evil.example:4417", "http://evil.example:4417"))?.status,
    403,
  );
  assert.equal(
    refuse(asked("127.0.0.1:4417", "http://evil.example"))?.status,
    403,
  );
  assert.equal(
    refuse(new Request("http://127.0.0.1:4417/api/me/memory"))?.status,
    403,
  );
  assert.ok(loopback("app.localhost:3000"));
  assert.ok(!loopback("127.0.0.1.evil.example"));
  assert.ok(!loopback("192.168.0.10:4417"));
});
