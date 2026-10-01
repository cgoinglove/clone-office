# sub-office

An AI office for a team. Every person brings one computer, and that computer is a sub-office: their
bots run there, with their own browser, sign-ins and keys, on whichever model they pick. The office
is the setup around them — people, bots, an admin, shared skills, documents and credentials, a
reception desk and a CEO bot.

This repository is public. What is committed here is read by strangers. No license has been chosen
yet; until one is, no rights are granted beyond reading the source.

Status: design. Nothing is built yet.

# Words

- **Office** — a team and its whole setup: people, bots, admin, shared skills, docs and credentials,
  reception desk, CEO bot.
- **Person** — one user with one computer. Their bots run on it.
- **Bot** — an agent with a name, a role, skills and memory. A person has a main bot and may make
  and share more.
- **Session** — one piece of work. Each request opens a new one; it sits on the bot's desk and can
  be picked up again there.
- **Request** — one person's bot asking another person's bot for work. The receiver's rules and
  approvals apply.
- **Subagent** — a parallel run inside a session: a copy of the bot or another bot, on a model the
  caller picks. Parallel, not necessarily cheap.
- **Hardening** — a step the bot keeps repeating at a model's cost becomes a script, so the work gets
  cheaper the more it is done.
- **Admin** — sets what the office shares. Admin narrows what a bot may do; it never widens it.

# Rules

- **English in the tree.** Code, comments, prompts, strings and commit messages are English.
- **Nothing about one user goes into the tree, and the person you work for is one user.** Their
  words, names, accounts, habits, language, country and market are their data, never code, prompt
  text, a test fixture or a default.
- **Anything private is named `*.local.*`.** `.gitignore` keeps that shape out of commits. Never
  `git add -f` one.
- **No heuristic does the model's job.** No phrase matching, per-language word lists or timers that
  guess intent.
- **Nothing is forced to work.** No undocumented endpoint, no branch that only makes the example at
  hand pass, no retry, fallback or empty result that hides a failure.
- **Each thing a diff changes stands on something you can name** — a case you reproduced, a
  measurement, code or a document you can quote, what you were asked. A guess is not one.
- **A rule that looks wrong is asked about, not obeyed or worked around.**
- **The user's data is not clutter.** Databases, sign-ins and workspaces are never deleted to tidy up.

# References

- `../voice-agent` — Thursday, a local-first voice agent by the same author. Read it for patterns
  (bots, threads, skills, memory, the browser, sign-ins); it is a reference, not a dependency.
  Its maps are in `../voice-agent/.claude/rules/`.
