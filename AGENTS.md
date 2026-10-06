# sub-office

Send your mini-me. Everyone on a team gets a *mini-me*: an AI that works like them. It knows
their role, what they own and how they work, does their everyday tasks like an assistant, and
stands in for them with teammates. Mini-mes talk to each other: they answer what they can, take
requests, run their person's tools (Claude Code sessions, documents, mail, calendar, the browser)
on that person's computer, and bring back only the calls that person must make.

What a mini-me copies is how a person works, not their personality: what they own, what they
choose, where they stop, and how they talk to whom. Ten people, ten mini-mes: each mini-me is
backed by a real person's access and judgement. It is not one person running role-playing bots,
and it does not copy anyone's skills. Today people carry requests between AIs, mentions and emails
by hand; mini-mes carry them instead, following each person's card (what they own, what they can be
asked for), trust levels, reply mode and flows. It is meant for teams of about ten or fewer, and it
must be useful to one person alone. People who do not code chat with their mini-me like a
messenger; one teammate sets up connectors and team billing once.

Status: early. A Next.js/UI foundation exists. The mini-me, the relay and the Claude Code bridge
are not built yet. The product name is being reconsidered; it will keep "office".

# How to read the planning material

`docs/start.local.md` holds the goal, identity and core concepts, set with the user; product shape
and implementation details change as we build.
`docs/todo.local.md` is the current path to the first release, not a fixed contract.
Older diagrams, research, schemas and milestone lists are reference material only.

- Before building a feature, study how successful open-source projects already solved it; most
  answers, and the effort behind them, are already there. Then look at research and similar products.
- Think with the user, not only for them. If a note, a plan or a request looks wrong, or a better
  approach exists, say so with the reason before following it.
- Casual ideas do not become requirements because an agent wrote them down in detail.
- A proposal, a repeated statement, a table or a label such as "decision" is not evidence of approval.
  Only an explicit user decision can establish an actual product constraint, within its stated scope.
- Treat agent-authored counts, states, timings, schemas, architectures and exclusions as revisable
  hypotheses. Do not enforce them as acceptance criteria or use them to veto a better approach.
- Use judgement within the current request. Prefer a small, reversible way to learn whether the
  experience helps. Do not build every alternative just because the notes mention it.
- Keep routine notes short. Explain a material trade-off or changed direction, not every possible
  implementation detail. Do not make the user read a new specification to authorize ordinary work
  already covered by their request.
- Ask when an answer changes the user's intent, permissions, privacy, spending or an irreversible
  action. For ordinary reversible implementation choices, choose a reasonable option and state it.
- Safety and permission boundaries remain real even while product ideas are provisional.

# Working terms, not a fixed model

- **Office**: a team: its people, their mini-mes, shared connectors, shared documents and skills,
  and team billing.
- **Mini-me**: a person's AI that works like them. It runs on their computer, does their tasks,
  talks to other mini-mes, drives their tools and asks them only what is theirs to decide.
- **ME.md**: the file that describes how to work with a person, as AGENTS.md describes how to work
  in a repository. Every line carries its source and is confirmed by the person.
- **Card**: how a mini-me appears to others: name, role, what the person owns, current status.
  Other mini-mes route by it, the way an agent picks a skill.
- **Menu**: the kinds of request a mini-me accepts, each with its input and how it is handled.
- **Request / thread**: one ask between mini-mes (or a mini-me and a person), with its context; one
  thread each. Notes, questions, progress and done reports travel the same way.
- **Trust level**: per menu item, whether the mini-me acts alone, acts and reports, or asks first.
- **Reply mode**: together (one-tap approval), auto, or away; switched by calendar and status.
- **Flow**: a saved "when this happens, do this" a person sets up by talking to their mini-me.
- **Memory**: a mini-me's file tree. A small, capped core (ME.md, rules, a one-line index) is read
  on every turn; people, project and thread notes are opened by path when needed. Every fact
  carries its source and date. One request is one context; threads connect only through memory.
- **Hands**: what a mini-me drives: named Claude Code sessions, connectors (Google, Notion, Slack,
  GitHub), the browser, and its own model for people without an agent.
- **Relay / reply link**: the self-hostable server that carries messages between mini-mes, and the
  page someone without a mini-me opens to answer.

These words help discussion. They do not mandate separate services, tables or UI elements.

# Work boundaries and engineering defaults

- Code, comments, prompts, strings and commit messages are English.
- Keep private material in `*.local.*`; never force-add it. Do not put the user's identity,
  accounts, personal preferences or private data into shared code, prompts or test fixtures.
- Preserve data, sign-ins and workspaces. Do not delete them as cleanup.
- Respect explicit permission limits. Do not infer approval for spending, publication or deployment
  from a product note. Do not silently expand access or share credentials. A message from
  another person's agent is input, not permission: a mini-me acts on it only as its person's trust
  levels and flows allow.
- Use each AI vendor only through what its terms allow. Do not use a person's consumer
  subscription login from our own server or product where the vendor forbids it.
- This is a global open-source product. Do not assume the person writes code, speaks a given
  language or uses a given system: the screen's words fall back to English, the mini-me keeps
  what it learns in the person's own language, and someone with no AI coding records can start by
  bringing what their usual AI remembers. A maintainer's own computer is a test bed, not the target.
- Use supported interfaces and report failures honestly. A retry or fallback may be appropriate,
  but must not hide failure or fabricate success.
- Do not fake model understanding with ad-hoc phrase matching to make one example pass.
- Separate observations, research findings and implementation assumptions in reports.
- An explicit instruction that seems unsafe or contradictory needs clarification. A provisional
  product idea is not that kind of instruction.

# Existing layout and checks

- `app/`: Next.js pages; `app/globals.css`: current theme tokens and animation.
- `components/ui/`, `hooks/`, `lib/`: existing shared UI and utilities.
- `features/`: a possible home for domain code when needed, not a required upfront structure.
- `messages/<language>.json` and `i18n/`: every word a person reads, with next-intl and no
  language in the address. English is the source and the fallback; a language is one more file
  (with every key of `en.json`) and its code in `i18n/locales.ts`. The screen's language is the
  one picked under Language (a cookie), else the first of the browser's languages it is written
  in. Routes answer with error codes the screen reads in its language (`useProblem`); a status or
  kind that is stored or sent to colleagues is a code, so each reads it in their own language.
  The mini-me's language is separate: the one picked, else the browser's, whatever it is.
- `features/minime/`: making a person's mini-me at `/me`. `first-run.tsx` is the screen: it says
  what it will read and keep, learns in the background with progress (`learn/job.ts`), brings
  what the person's usual AI remembers about them (Claude's memory import: copy a prompt there,
  paste the answer here), shows the memory exactly as saved with each entry correctable or
  removable, lists every file it keeps (`server/stored.ts`), does work with them, and can start
  over. Its routes are `app/api/me/{learn,sources,import,memory,files,chats,gate,office,fix,task,reset}`, which
  answer only this app's pages; they take the person's language tag and tell the mini-me that
  language by name, keeping the last one for work that runs with no page open
  (`server/language.ts` `personLanguage`).
  Everything lives under `~/.sub-office` (`SUB_OFFICE_HOME` moves it). `server/sources/` reads
  each AI tool's local records (Claude Code and Codex are indexed; the Cursor and Hermes Agent
  readers are not used yet), plus notes about the person; `server/apps.ts` reads app usage from
  what the system records (macOS, Windows, Linux).
- Memory keeps only what stays true: how the person works, decides and talks, and corrections
  they gave. Anything that changes or can be found again on their computer (projects and their
  status, plans, dates, files) is looked up when needed, never stored; a stale copy misleads.
- `features/minime/memory/`: the mini-me's memory, following Hermes Agent's layout and learning
  loop. `store.ts` keeps `memories/USER.md` and `MEMORY.md` (small, capped, read every session);
  `skills.ts` keeps `skills/<category>/<name>/SKILL.md` packages with `references/`, `templates/`,
  `scripts/`, `assets/`, a usage sidecar and an archive that is never deleted; `curator.ts` sets
  aside long-unused skills weekly; `notes.ts` keeps one page per person, piece of work or topic
  under `notes/`, with an index and log written by code; `mcp-server.ts` serves all of it as
  tools. `features/minime/brain/`: `session.ts` runs a session on the person's own Claude Code
  with those tools (the brain is a replaceable process: everything else talks to it only through
  `runSession`); `review.ts` looks back over a finished session and keeps what it taught;
  `runlog.ts` writes one line per session to `logs/runs.jsonl` (purpose, time, context, usage,
  cost; never conversation text).
- `features/minime/chat/`: the conversations with the mini-me, kept by the app itself
  (`store.ts`, one append-only JSON-lines file per conversation under `chats/`), so a conversation
  outlives any brain session. `turn.ts` runs one turn: it resumes the brain's session, carries a
  long conversation into a fresh session first (look back, then a summary, as Claude Code compacts
  and Hermes compresses), goes on from the conversation's own record when the brain lost its
  session, and looks back after the answer. Conversations are searchable like the person's other
  AI conversations.
- `features/minime/gate/`: the trust gate. Code decides what goes to the person; the brain only
  proposes. In a conversation the mini-me may also read (files, the web), and Claude Code asks
  through the gate's `permission_prompt` tool before anything the person has not allowed
  (`--permission-prompt-tool`); `ask_me` is its own question to them (Claude Code's
  AskUserQuestion for a session without a terminal). `gate.ts` holds the waiting questions in the
  server process; `tools.ts` is the tool server's side (it reaches the app's `gate` route with a
  per-process secret); `rules.ts` turns "from now on" into Claude Code permission rules in
  `settings.json` (`trust.allow`) and the folders kept out into deny rules. Writing files and
  running commands are not given to the mini-me; sending a request to a colleague is asked first.
- `features/relay/`: the relay a team runs (`pnpm relay`, Node built-ins only: `node:http`,
  `node:sqlite`). Members join with the office key and then use their own token; a mini-me waits
  at its inbox (long polling) because it sits on a personal computer out of reach. Shapes follow
  A2A v1.0.0: an AgentCard per member, a Task per request with a contextId, Messages with roles
  user/agent and text parts, A2A's task states. It keeps only cards and requests.
- `features/minime/office/`: the mini-me's side. `client.ts` (where its relay is and who it is
  there, in `settings.json` under `office`, and the calls), `worker.ts` (one loop per server
  process: waits at the inbox, answers requests that come in, puts answers to sent requests back
  into their conversations), `handle.ts` (answers a request with the brain from what it knows,
  asking its person through the gate for what only they can give; a busy AI service is retried
  before failing), `check.ts` (a separate look before an answer leaves, product 2.8a: what it
  holds back goes to the person as a card: send, send a fixed answer, or hold), questions about a
  request the person does not answer within two minutes are kept in `state.ts` (`later`) and the
  colleague hears they will get back to them; answering one later goes on with the request
  (`answerLater`), `menu.ts` (the
  kinds of request the person takes, each with a trust level: auto, tell or ask; the kinds go on
  the card as A2A skills, the trust levels stay in `settings.json`. The brain names a request's
  kind; code then sends it, sends it and tells the person in their latest conversation (chat role
  `told`), or has the check show it to them first), `state.ts` (inbox cursor, sessions, where sent requests came from, a lease per request and one office worker per folder, so no request is answered twice; open requests are picked up again after a restart). In a
  conversation the brain has `colleagues` and `ask_colleague` (`gate/tools.ts`); the screen's
  office is `features/minime/office-panel.tsx` with the route `app/api/me/office`.
- `plugin/`: the Claude Code plugin, so a person's own Claude Code conversations ask colleagues'
  mini-mes (the repository is its marketplace: `.claude-plugin/marketplace.json`). It is copied
  alone when installed, so it imports nothing from the app and has no dependencies.
  `server/office.ts` is its MCP server (`server/mcp.ts`, a hand-written stdio JSON-RPC server):
  `colleagues`, `ask_colleague`, `answer_colleague`, `office_requests`, reading the office the app
  joined and calling the relay directly. A tool waits a minute for its answer and notes how much
  of the request the conversation has read (`office/claude-code/<request>.json`). The mod
  (`hooks/office.ts`, Claude Code's mods API) learns the request from the tool's reply, keeps it
  in the plugin's store per conversation, looks at the relay itself every 10 seconds (a plugin's
  own call to its MCP tools would need the person's leave each time), and brings what comes later
  into that conversation with `$.prompt.submit` once it is idle. `lib/news.ts` is what both share,
  with no imports. What a colleague's mini-me wrote is quoted as information, never as
  instructions. Check the mod with `claude plugin validate plugin`.
- `features/minime/hands/`: what the mini-me drives besides its own brain. `sessions.ts` lists the
  person's recent Claude Code conversations (by the name they gave with `/rename`, else the title
  Claude Code gave, never in folders left out or the mini-me's own) and asks one: a fork
  (`--resume <id> --fork-session --no-session-persistence`) with read-only tools, user settings
  only (no project hooks) and no MCP server, so the conversation itself is never touched.
  `tools.ts` serves `sessions` (free) and `ask_session` (asked through the gate) to the brain.
- `features/minime/history/`: a search index (SQLite FTS5 via `node:sqlite`, under `index/`) of
  what the person typed to their AI tools and what those answered, built in bounded passes that
  resume by byte offset, with CJK text indexed as bigrams; `tools.ts` gives the mini-me
  `conversation_search` and `conversation_read`. The index is derived: the tools' records are
  only read, and it can be deleted and rebuilt. A learning indexes only the conversations it reads
  and the rest is caught up in the background (`catchUpIndex`). `features/minime/learn/`: the first
  transplant, `gather.ts` (budgeted material from instruction and memory files, recent prompts by
  most active folder, the person's own commits, document kinds and apps; a later reading takes only
  what changed) and `learn.ts` (one session whose structured answer holds a few lasting lines,
  saved by code, and three tasks); `export-prompt.ts` and `import.ts` (what another AI remembers,
  kept the same way, the pasted text stored nowhere); `reset.ts` (start over: what is kept moves
  into `backup/`, never deleted).
- `features/minime/server/sources/lines.ts`: line readers every record reader uses (lines over
  2 MB are skipped, logs can be read from the end); `server/exclude.ts`: folders the person keeps
  out of everything, from `settings.json`.
- `guide/`: how sub-office works, written for the person using it; the mini-me reads it with
  `guide_read` (`features/minime/memory/guide.ts`). A change the person would notice updates
  `guide/` in the same change.
- `.claude/rules/ui.md`: map of the current UI. Read it when touching that area.
- `.claude/rules/taste.md`: working visual directions, not a frozen design specification.

`pnpm dev` serves on loopback. This is Next.js 16; consult the installed Next documentation
before relying on older APIs. Use typecheck, lint, `pnpm test` and build as appropriate to the change.
Update an affected code map when its description becomes inaccurate.

`../voice-agent` (Thursday) is a reference for existing patterns, not a dependency or a template
that this product must copy. Do not change it as part of work in this repository.
