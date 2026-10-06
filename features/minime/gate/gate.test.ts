import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { answerAsk, askPerson, onAsk, pendingAsks, waitFor } from "./gate";
import { denyRules, pathRule, ruleFor } from "./rules";

test("a question waits for the person's answer, and is heard by the conversation it belongs to", async () => {
  const heard: string[] = [];
  const stop = onAsk((pending) => heard.push(pending.id));
  const { id, done } = askPerson("chat-1", {
    kind: "question",
    question: "Which one?",
    choices: ["A", "B"],
  });
  stop();
  assert.deepEqual(heard, [id]);
  assert.equal(pendingAsks("chat-1").length, 1);
  assert.equal(pendingAsks("chat-2").length, 0);
  assert.ok(waitFor(id));
  answerAsk(id, "B");
  assert.deepEqual(await done, { answered: true, answer: "B" });
  assert.equal(pendingAsks("chat-1").length, 0);
  assert.equal(
    answerAsk(id, "A"),
    undefined,
    "an answered question takes no second answer",
  );
});

test("a question nobody answers ends unanswered", async () => {
  const { done } = askPerson(
    undefined,
    { kind: "question", question: "?" },
    20,
  );
  assert.deepEqual(await done, { answered: false });
});

test("an answer 'from now on' becomes a rule for a folder or a site, and kept-out folders become rules too", () => {
  const home = homedir();
  assert.equal(pathRule(join(home, "Documents")), "~/Documents");
  assert.equal(pathRule("/srv/data"), "//srv/data");
  assert.equal(
    ruleFor("Read", { file_path: join(home, "Documents", "plan.md") }),
    "Read(~/Documents/**)",
  );
  assert.equal(
    ruleFor("Grep", { pattern: "x", path: "/srv/data" }),
    "Read(//srv/data/**)",
  );
  assert.equal(
    ruleFor("WebFetch", { url: "https://example.com/a" }),
    "WebFetch(domain:example.com)",
  );
  assert.equal(ruleFor("Bash", { command: "ls" }), undefined);
  assert.deepEqual(denyRules(["client-*", "~/work/private", "/srv/secret"]), [
    "Read(~/work/private/**)",
    "Edit(~/work/private/**)",
    "Read(//srv/secret/**)",
    "Edit(//srv/secret/**)",
  ]);
});

test("changing files becomes a rule for that folder; a command never does; folders left out stay closed", async () => {
  const { denyRules, ruleFor } = await import("./rules");
  const { homedir } = await import("node:os");
  assert.equal(
    ruleFor("Edit", {
      file_path: `${homedir()}/work/payments/orders.ts`,
      old_string: "a",
      new_string: "b",
    }),
    "Edit(~/work/payments/**)",
  );
  assert.equal(
    ruleFor("Write", { file_path: "/srv/app/new.ts", content: "x" }),
    "Edit(//srv/app/**)",
  );
  assert.equal(ruleFor("Bash", { command: "rm -rf build" }), undefined);
  assert.deepEqual(denyRules(["~/work/client-a"]), [
    "Read(~/work/client-a/**)",
    "Edit(~/work/client-a/**)",
  ]);
});

test("a card shows the change itself: the lines before and after, or the command", async () => {
  const { changeOf } = await import("../ask-card");
  assert.equal(
    changeOf("Edit", {
      file_path: "a.ts",
      old_string: "limit = 25",
      new_string: "limit = 50",
    }),
    "- limit = 25\n+ limit = 50",
  );
  assert.equal(changeOf("Bash", { command: "pnpm test" }), "$ pnpm test");
  assert.match(
    changeOf("Write", {
      content: Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n"),
    }) ?? "",
    /line 11\n…$/,
  );
  assert.equal(changeOf("Read", { file_path: "a.ts" }), undefined);
});
