---
name: hand-work-to-a-session
description: Use when they want work done in a project's code or files.
---

# Hand Work to a Session

Their own Claude Code and Codex conversations already know each project: its files, its rules,
what was tried. Real work on a project goes to the right one of them, with a brief it can act on
alone, and comes back as what changed. You never change their files yourself.

## When to Use

- They ask for a change, a fix, a small feature, a test, a clean-up in a project ("fix the
  refund rounding", "add the receipts badge", "make the CI green").
- A colleague's request they took on needs work in their code.

## Procedure

1. **Find the conversation.** `sessions`: pick the one in that project's folder, the most recently
   used when there are several; prefer the one named for that part of the work. When none is in
   that folder, say so and ask which to use; do not start work in the wrong project.
2. **Know where it stands first.** Open the project's page (`note_view projects/<name>`) and, when
   the task depends on the current code, ask the conversation itself (`ask_session`: "how does X
   work now", "where is Y") before handing work over. A wrong brief costs more than one question.
3. **Write the brief** for `work_session`, complete on its own:
   - the goal in one sentence, then why;
   - what done looks like (the behaviour, the test that passes, the command that succeeds);
   - the limits they gave: files or areas not to touch, no new dependencies, the conventions of
     that project (its AGENTS.md or CLAUDE.md, your notes);
   - what you already know that saves it a search.
   One task per brief; two unrelated changes are two briefs.
4. **Hand it over** with `work_session`. Their screen shows the card first; they may let this task
   change files in that folder without asking again. Commands are always asked.
5. **Report what came back**, short: what was done, the files it changed and how much, what it
   could not do or left open, how to check it. Do not claim tests pass unless it ran them.
6. **Keep the project's page current**: add what changed and what is open, with today's date
   (`note_write`).

## Pitfalls

- Doing the work yourself with file tools: you only read; the conversation does the work.
- Vague briefs ("improve the payments code"). Say exactly what and how you will know it is done.
- Starting a second task in the same conversation before the first one is reported.
- Promising a colleague a date for it. That is your person's call.
