import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInvite } from "./invite";

test("an invite link gives the relay's address and the office's key", () => {
  assert.deepEqual(
    parseInvite(" https://office.example.com/i/Ab3_x-9Kq?from=Ben "),
    {
      relay: "https://office.example.com",
      key: "Ab3_x-9Kq",
    },
  );
  assert.deepEqual(parseInvite("http://10.0.0.5:3200/i/key123"), {
    relay: "http://10.0.0.5:3200",
    key: "key123",
  });
  assert.equal(parseInvite("http://127.0.0.1:3200"), undefined);
  assert.equal(parseInvite("not a link"), undefined);
  assert.equal(parseInvite("javascript:alert(1)//i/abcd"), undefined);
});
