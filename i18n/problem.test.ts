import assert from "node:assert/strict";
import { test } from "node:test";
import { errorCode } from "../features/minime/server/ndjson.ts";
import {
  type ErrorWords,
  limitProblem,
  problemWords,
  splitProblem,
  untilWords,
} from "./problem.ts";

test("a limit's code carries when it lifts, and reads back", () => {
  assert.equal(limitProblem(1791890400), "brain-limit@1791890400");
  assert.equal(limitProblem(0), "brain-limit");
  assert.equal(limitProblem(), "brain-limit");
  const { code, until } = splitProblem("brain-limit@1791890400");
  assert.equal(code, "brain-limit");
  assert.equal(until?.getTime(), 1791890400 * 1000);
  assert.deepEqual(splitProblem("ai-busy"), { code: "ai-busy" });
  // Words that only look like a code are not one.
  assert.deepEqual(splitProblem("Error@12"), { code: "Error@12" });
});

test("the services' own words for a limit become its code", () => {
  assert.equal(errorCode("brain-limit@1791890400"), "brain-limit@1791890400");
  assert.equal(
    errorCode("You've hit your session limit · resets 8:20pm (Asia/Seoul)"),
    "brain-limit",
  );
  assert.equal(errorCode("You've hit your weekly limit"), "brain-limit");
  assert.equal(
    errorCode("Claude AI usage limit reached|1791890400"),
    "brain-limit@1791890400",
  );
  // A busy service is still busy, not a limit.
  assert.equal(errorCode("429 rate_limit_error"), "ai-busy");
});

test("when a limit lifts reads as the time today, else with its day", () => {
  const now = new Date(2026, 9, 13, 17, 0);
  assert.equal(untilWords(new Date(2026, 9, 13, 20, 20), "en", now), "8:20 PM");
  assert.match(
    untilWords(new Date(2026, 9, 15, 9, 0), "en", now),
    /^Thu,? 9:00 AM$/,
  );
  assert.match(untilWords(new Date(2026, 9, 30, 9, 0), "en", now), /Oct 30/);
});

test("a limit is said with its time when the words have one", () => {
  const said: string[] = [];
  const words = Object.assign(
    (key: string, values?: Record<string, string>) => {
      said.push(key);
      return values?.time ? `${key} ${values.time}` : key;
    },
    { has: (key: string) => key.startsWith("brain-limit") },
  ) as ErrorWords;
  assert.match(
    problemWords(words, "brain-limit@1791890400", "en") ?? "",
    /^brain-limit-until \S/,
  );
  assert.equal(problemWords(words, "brain-limit", "en"), "brain-limit");
  assert.equal(problemWords(words, "something else", "en"), undefined);
});
