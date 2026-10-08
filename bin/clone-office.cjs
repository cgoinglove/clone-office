#!/usr/bin/env node
// `npx clone-office` begins here. CommonJS, in syntax any Node parses (after Thursday's
// bin/thursday.cjs): an ES module is parsed and linked with everything it imports before any of it
// runs, so on an older Node clone-office.mjs would die on something it lacks (top-level await, a
// `node:` module) without saying why, and Ubuntu 22.04 and Debian 11 install Node 12. Too old, it
// says what to do instead.

var parts = process.versions.node.split(".").map(Number);
if (parts[0] < 22 || (parts[0] === 22 && parts[1] < 13)) {
  console.error(
    "Clone Office needs Node.js 22.13 or later; this is " +
      process.versions.node +
      ".\nGet the current LTS from https://nodejs.org, open a new terminal, and run the same line again.",
  );
  process.exit(1);
}

import("./clone-office.mjs");
