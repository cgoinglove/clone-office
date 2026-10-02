# sub-office

An office where everyone's own AI agent comes to work. Each person grows one agent by teaching it;
what it learns becomes skills. In the office people see what each other's agents can do, take a
colleague's skill onto their own agent, or ask a colleague's agent to do the work — under the
colleague's approval, with who pays chosen per request. Nobody has to be a developer.

This repository is public. What is committed here is read by strangers. No license has been chosen
yet; until one is, no rights are granted beyond reading the source.

Status: design. Nothing is built yet.

# Words

- **Office** — a team on one server: its members, their agents, shared skills, documents and keys,
  and the office's policy.
- **Server** — stores and relays: members, skills, documents, requests, the charge ledger, who is
  online. It runs no agent work.
- **Member** — one person. Has exactly one bot.
- **Bot** — a member's agent: name, look, model settings, memory and installed skills. It runs on
  its member's computer; while that computer is off, the bot is asleep.
- **Skill** — the unit of what a bot can do: instructions (Agent Skills `SKILL.md`), hardened
  scripts, and what it needs (sign-ins, keys, model). Visible to its owner, the team or the office.
- **Take** — installing a colleague's skill, pinned to a version, onto your own bot. It runs on your
  computer, with your sign-ins, at your cost.
- **Request** — asking a colleague's bot to do work that needs their context, access or judgement.
  The receiver's rules and approval apply; the request names who pays: receiver, sender or team.
- **Session** — one piece of work on a bot's desk. Every task opens a new one and can be resumed;
  there is no standing main conversation. Continuity is the bot's memory.
- **Subagent** — a parallel run inside a session, on a model the caller picks. Off by default.
- **Hardening** — a step the bot keeps repeating at a model's cost becomes a script, so the work gets
  cheaper the more it is done.
- **Admin** — sets the office's policy. Admin narrows what a bot may do; it never widens it.

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

# Layout

```
app/                 Pages and API routes. globals.css holds every colour token and keyframe.
components/ui/       Domain-agnostic UI: shadcn in its Base UI style, plus the app's own parts.
hooks/               Domain-agnostic React hooks.
lib/                 Domain-agnostic code: utils, theme, tokens.
features/<name>/     One domain each, when it arrives: <name>.schema.ts (zod), <name>.query.ts,
                     <name>.action.ts, components/.
.agents/skills/      Skills for the agent working on this repo (linked from .claude/skills/).
```

# Running

`pnpm dev` serves on loopback. Next.js here is 16 — read `node_modules/next/dist/docs/` before
writing Next code; APIs differ from older versions.

# Checks

`pnpm typecheck`, `pnpm lint`, and `pnpm build` for a client/server boundary change.

# Maps

Each area has a map in `.claude/rules/`: what it is for, the files to open first, and what breaks
there. A change that makes a line of a map wrong rewrites that line in the same commit and moves
its `checked:` date.

| When you change … | Read |
|---|---|
| Shared UI, colours or keys: `components/`, `hooks/`, `app/globals.css` | `.claude/rules/ui.md` |
| How a screen looks: the maintainer's picks | `.claude/rules/taste.md` |

# References

- `../voice-agent` — Thursday, a local-first voice agent by the same author. Read it for patterns
  (bots, threads, skills, memory, the browser, sign-ins); it is a reference, not a dependency.
  Its maps are in `../voice-agent/.claude/rules/`.
