import assert from "node:assert/strict";
import { test } from "node:test";
import { cut, pageable, preview } from "./scratch.ts";
import { partOf, unmark, untrusted } from "./untrusted.ts";

test("a part of an outside text is marked again, never left open", () => {
  const page = untrusted(
    "web https://x.test",
    `200 https://x.test\n\n${"a".repeat(5000)}`,
  );
  assert.equal(unmark(page)?.open, '<untrusted source="web https://x.test">');
  const start = partOf(page, (body) => preview(body, 100));
  assert.match(start, /^<untrusted source="web https:\/\/x\.test">\n200/);
  assert.ok(start.endsWith("\n</untrusted>"));
  assert.equal(
    partOf("plain", (body) => body.toUpperCase()),
    "PLAIN",
  );
});

test("a cut outside text marks each part, and the note between them is the app's own", () => {
  const page = untrusted(
    "web https://x.test",
    `${"a".repeat(3000)}${"z".repeat(3000)}`,
  );
  const short = cut(page, 1000);
  const marks = short.match(/<untrusted source=/g) ?? [];
  assert.equal(marks.length, 2);
  assert.equal((short.match(/<\/untrusted>/g) ?? []).length, 2);
  assert.match(short, /<\/untrusted>\n\n\[… [\d,]+ characters cut/);
});

test("JSON is laid out inside its mark and after a web page's heading line", () => {
  const data = JSON.stringify({
    items: Array.from({ length: 60 }, (_, i) => ({ id: i, name: `item ${i}` })),
  });
  const service = pageable(untrusted("notion search", data));
  assert.match(
    service,
    /^<untrusted source="notion search">\n\{\n {2}"items": \[/,
  );
  assert.ok(service.endsWith("\n</untrusted>"));
  const web = pageable(
    untrusted(
      "web https://x.test/a.json",
      `200 https://x.test/a.json\n\n${data}`,
    ),
  );
  assert.match(web, /\n200 https:\/\/x\.test\/a\.json\n\n\{\n {2}"items"/);
});
