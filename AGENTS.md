# sub-office

An office where every person has a proxy — an agent that stands in for them — and the proxies hand
work to each other. A person puts themselves into their proxy: name, role, what they own, how they
work, what it may decide alone and what it must ask. When a developer needs a design, their proxy
asks the designer's proxy; that proxy takes it up with the designer, then has the work done in the
designer's own setup. When the developer is on leave, the finished design still reaches their proxy,
which carries their work on within what they delegated. One person running a "designer bot" of
their own is not this: it lacks the designer's skill, judgement, access and responsibility.

Proxies live on the office server, so they are always reachable; the heavy work runs on each
person's computer, in the harness they already use (Claude Code, Codex, OpenClaw, Hermes, …) or the
office's built-in worker. Anyone can start from a browser with nothing installed.

This repository is public. What is committed here is read by strangers. No license has been chosen
yet; until one is, no rights are granted beyond reading the source.

Status: design. Nothing is built yet.

# Words

- **Office** — a team (or a circle of people who know each other) on one server: members, their
  proxies, the owners map, shared skills, documents, storage and keys, and the office's policy.
- **Server** — hosts the proxies and stores and relays everything else: members, requests, threads,
  documents, skills, the charge ledger. It runs no heavy work.
- **Member** — one person, with one seat and one proxy.
- **Proxy** — the agent that stands in for a member: identity (name, role, areas owned, hours,
  voice), what it knows about them, their workflows, and their delegation rules. It talks with other
  proxies and with its own member, and is always reachable.
- **Delegation rules** — what a proxy may do alone, must ask its member about, or must never do; set
  per asker (team, office, listed people) and per status. A proxy never commits its member to a
  date, a cost or a scope the rules do not cover.
- **Status** — at work, busy, on leave, computer off. It decides what a proxy handles alone and what
  waits.
- **Worker** — what does the heavy work for a member: the harness they already use, connected
  through a runner, or the office's built-in worker.
- **Runner** — the office program on a computer, personal or team-owned. It connects out to the
  server and starts or resumes the member's worker in their own setup. One adapter per kind of
  harness.
- **Flow** — something a proxy offers to others, shown on its profile, with the input it takes.
- **Request** — one proxy asking another for work: what, why, evidence, when it is done, deadline,
  who pays. The receiving proxy sorts it and takes it up with its member as its rules say; the result
  says whether the proxy handled it or the member checked it. The asking thread waits and resumes on
  the reply.
- **Owners map** — which member owns which area; built from the areas on each proxy's identity.
  Proxies route requests by it and ask rather than guess.
- **Thread** — one piece of work. Every task opens a new one and can be resumed; a request links the
  asker's thread to the receiver's. There is no standing main conversation.
- **Skill** — a unit of what a worker can do: instructions (Agent Skills `SKILL.md`), hardened
  scripts, and what it needs (sign-ins, keys, model). Personal or team.
- **Hardening** — a step repeated at a model's cost becomes a script, so the work gets cheaper the
  more it is done.
- **Admin** — sets the office's policy. Admin narrows what a proxy or worker may do; it never widens
  it.

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
