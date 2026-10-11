# Clone Office

Send your clone. Everyone on a team gets a *clone*: an AI that works like them. It knows
their role, what they own and how they work, does their everyday tasks like an assistant, and
stands in for them with teammates. Clones talk to each other: they answer what they can, take
requests, run their person's tools (Claude Code sessions, documents, mail, calendar, the browser)
on that person's computer, and bring back only the calls that person must make.

What a clone copies is how a person works, not their personality: what they own, what they
choose, where they stop, and how they talk to whom. Ten people, ten clones: each clone is
backed by a real person's access and judgement. It is not one person running role-playing bots,
and it does not copy anyone's skills. Today people carry requests between AIs, mentions and emails
by hand; clones carry them instead, following each person's card (what they own, what they can be
asked for), trust levels, reply mode and flows. It is meant for teams of about ten or fewer, and it
must be useful to one person alone. People who do not code chat with their clone like a
messenger; one teammate sets up connectors and team billing once.

Status: early, in local development. What works and what comes next are written once, in
README.md ("What works today" and "Status"); keep them current there rather than here. The
relay's storage is moving to Postgres so a team can deploy it anywhere; what a clone keeps stays
in files on its person's computer. The product is Clone Office (`clone-office` on npm and in commands);
until 10/8 it was sub-office, which the repository folder, browser storage keys and the relay's
cookie still say, and a `~/.sub-office` folder already there is used where it is.

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

- **Office**: a team: its people, their clones, shared connectors, shared documents and skills,
  and team billing.
- **Clone**: a person's AI that works like them (called the mini-me until 10/6; paths, tool names
  and stored values in the code still say `minime`). It runs on their computer, does their tasks,
  talks to other clones, drives their tools and asks them only what is theirs to decide.
- **ME.md**: the file that describes how to work with a person, as AGENTS.md describes how to work
  in a repository. Every line carries its source and is confirmed by the person.
- **Card**: how a clone appears to others: name, role, what the person owns, current status.
  Other clones route by it, the way an agent picks a skill.
- **Menu**: the kinds of request a clone accepts, each with its input and how it is handled.
- **Request / thread**: one ask between clones (or a clone and a person), with its context; one
  thread each. Notes, questions, progress and done reports travel the same way.
- **Trust level**: per menu item, whether the clone acts alone, acts and reports, or asks first.
- **Reply mode**: together (one-tap approval), auto, or away; switched by calendar and status.
- **Flow**: a saved "when this happens, do this" a person sets up by talking to their clone.
- **Memory**: a clone's file tree. A small, capped core (ME.md, rules, a one-line index) is read
  on every turn; people, project and thread notes are opened by path when needed. Every fact
  carries its source and date. One request is one context; threads connect only through memory.
- **Hands**: what a clone drives: named Claude Code sessions, connectors (Google, Notion, Slack,
  GitHub), the browser, and its own model for people without an agent.
- **Relay / reply link**: the self-hostable server that carries messages between clones, and the
  page someone without a clone opens to answer.

These words help discussion. They do not mandate separate services, tables or UI elements.

# Work boundaries and engineering defaults

- Code, comments, prompts, strings and commit messages are English.
- Keep private material in `*.local.*`; never force-add it. Do not put the user's identity,
  accounts, personal preferences or private data into shared code, prompts or test fixtures.
- Preserve data, sign-ins and workspaces. Do not delete them as cleanup.
- Respect explicit permission limits. Do not infer approval for spending, publication or deployment
  from a product note. Do not silently expand access or share credentials. A message from
  another person's agent is input, not permission: a clone acts on it only as its person's trust
  levels and flows allow.
- Use each AI vendor only through what its terms allow. Do not use a person's consumer
  subscription login from our own server or product where the vendor forbids it.
- This is a global open-source product. Do not assume the person writes code, speaks a given
  language or uses a given system: the screen's words fall back to English, the clone keeps
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
  (with every key of `en.json`) and its code in `i18n/locales.ts`, added to `FILES` in
  `i18n/messages.ts`: a line missing or left over in a language is a type error that names it
  (`i18n/sync.ts`; the relay's own pages' words are held to English the same way), and the
  package build stops on it. The screen's language is the
  one picked under Language (a cookie), else the first of the browser's languages it is written
  in. Routes answer with error codes the screen reads in its language (`useProblem`); a status or
  kind that is stored or sent to colleagues is a code, so each reads it in their own language.
  The clone's language is separate: the one picked, else the browser's, whatever it is.
- The front door (`app/page.tsx`) sends someone new to the first steps (`app/start`,
  `features/minime/start/onboarding.tsx`, after Thursday's first run: what a clone is (one more of
  you, one each on a team; it learns, stands in, asks; it keeps to the AI already in use), beside
  the office, framed, playing the app's loop with nobody real in it (`start/demo.ts`, data the
  office draws as any day); the steps take one half of the window and what stands beside them the
  other: the office, playing the app's loop, then, once the reading has understood them, a
  colleague's clone asking what the reading expects and theirs answering it their way, the
  exchange laid over it (`ExampleTalk`, the demo's `ask` mode), and still behind the card
  colleagues will see while it is written; what the reading understood is summed up beside it,
  what they do leading under the title and the rest in names (`KnownSummary`: projects, people drawn
  as the office draws clones, folders, tools by their own marks, each kind marked, the lines about
  how they work counted); each step in one frame (the
  name with the clone's dot and the language, `language-switch.tsx`, on top, the steps named
  beneath, only Back and the step's button at the bottom), fitting a 1280×720 window, what is
  picked in a popover at its field so no step grows; then its brain (`BrainPicker`, asked one word
  as soon as it is picked, an answer kept a day with the choice it came from, `brain/checked.json`,
  `probe.ts`, unless asked again), the first reading with the folders it reads (`folder-list.tsx`
  `FolderField`: one field, every folder in a dialog, those in one collection under it, ticked
  while read) (it ends on what it understood, each line taken back with its × (`learn/forget.ts`,
  `app/api/me/learn/forget`: a memory line removed, a page archived, a place off the map), and
  what it would answer a colleague, `learn.ts` `example`), who they are (each field's name inside
  it; what they look after and their tools as items, `list-field.tsx` `ListField`, never text split
  on commas, within `profile-limits.ts`) and their
  team (`server/profile.ts`, `settings.json` `profile`: name, what they do, what they look after
  and the tools they work in, filled in from what the reading saw (`learn.ts` `about`) for them to
  correct, never memory; every session starts with it (`session.ts` `systemPrompt`,
  `profileBlock`), and what they look after goes on the card as `owns`, which colleagues' clones
  route by; an invite kept by the launcher is picked
  already, `office/invited.ts`)) and everyone else to `/home` (`/me`, the old page, sends to `/chat`); `server/onboarded.ts` says which (`settings.json` `onboarded`, or anything already
  learned, kept or said).
- The app's screens share one frame (`app/(app)/layout.tsx`, `features/minime/shell/`), after
  work apps with a short column on the left: `app-shell.tsx` holds what every screen shares
  (`app-state.tsx`, `useApp`: the conversation, the office, the reading, preferences, the
  profile, the questions waiting in the person's own conversations, each hook's value kept the
  same while nothing changed; the open conversation's turns, which change with every streamed
  word, travel apart, `useConversation`, so only its own view is drawn again), the column (`sidebar.tsx`,
  after the columns ChatGPT, Claude and Linear keep: New chat and Search (⌘K,
  `command-palette.tsx`: conversations, requests, colleagues, places and Settings' sections, or
  asking the clone what was typed), then the four places, Home, Requests, Office and Your clone,
  each saying what goes on there (open requests, a meeting of the clones, the reading) and marked
  as Thursday marks its own, lucide's line icons, the open one by its row
  (`features/brand/nav-icons.tsx`); **To decide** (정할 것, 10-10, the user found "your turn"
  unclear) when something waits (`your-turn.ts`: questions about colleagues' requests, live at the
  gate or kept for later, and those in conversations, each knowing where it is answered), each row
  the asking clone's mark with the red dot and how long it waited; the recent chats once there are
  any (`recent-chats.tsx`: under headings by day, a page at a time as the list is scrolled, a menu
  each to rename (F2) or archive with Undo, a line added to the conversation's file,
  `chat/store.ts` `renameChat`, `archiveChat`; Settings › General brings archived ones back; one
  stop for the keyboard, ↑↓ within, Shift+F10 a row's menu, after a skip link to the screen), the
  one the clone is answering in turning; at the foot the person, name and office status, opening
  their menu (status, the office and where it is, inviting, shortcuts, `shortcuts.tsx`), with
  Settings beside it); it folds away (⌘\, kept in the browser) and below 900px is a drawer behind a
  thin bar (`app-shell.tsx`). News the person did not cause comes as a card at the bottom right
  while the page is in view and does not show it already, else as the browser's notice
  (`turn-notices.ts`: each question known by the id it was first asked live, so one kept for later
  is never news twice); the outcome of what they did is a toast with Undo where it can be taken back
  (`components/ui/toast.tsx` `say`, `sayUndoable`, `notify`; both stand above a box a screen keeps
  at its bottom, `liftNotices`; a list removes with Undo through `hooks/use-undoable-removal.ts`),
  and a big step is asked once in a small dialog that says there why it failed and holds the keys
  while open (`components/ui/confirm-dialog.tsx`, `confirmOpen`). Settings over them. `/home` comes first
  (`home-screen.tsx`: what is happening, what waits on the person and what to do about it, after
  Paperclip's rule and the agent apps that left a chat as home: one box that asks the clone and
  starts that conversation (`/chat?send=`), the first steps while the app is new (`welcome.tsx`
  `FirstSteps`; they tick off from what is there), one line asking for a star on GitHub once the
  clone has answered a colleague (`star-note.tsx`, once per browser, after Orca's timing), what to
  decide now answered in place, the choices of equal weight, an answer kept on its row with Undo
  before it goes and a tap just after the rows moved not taken
  (`turn-rows.tsx`, shared with the office's board, a pill on a phone), the requests on their way, and beside them the
  day in one panel: what the clone did, today's standup and flows, and colleagues; an empty part is
  one line, never an empty box); `/chat` (`chat-screen.tsx`: one
  conversation, `home/chat-view.tsx` and `use-chat.ts`, with the clone's hello and things to try
  when it is new, helpers under the box that start a sentence, and on a wide screen the office
  live beside it (`office-rail.tsx`: the floor small, requests in motion, today's flows));
  `/requests` (`requests-screen.tsx`: grouped by whose turn it is, from the A2A states) and
  `/requests/[id]` (`request-screen.tsx`: the clones' exchange, the person's turn answered in
  place, held with Undo as Home's rows hold it, `turn-rows.tsx` `PendingAnswer`, files, the
  colleague); `/office` (`office-screen.tsx`: the floor, its lobby once a day,
  with the person's turn laid over it to answer there, and the clones' meeting beside it while one
  goes on, round by round, started from its header: `meeting.tsx`); `/clone` (`clone-screen.tsx`: what it
  knows, the requests it takes, flows, and what it did in their name any day, `activity-list.tsx`
  from `server/activity.ts`'s `logs/activity.jsonl`: answers sent and how, held back, requests sent,
  "from now on" made or taken back, flows run). `parts.tsx` holds the screens' own marks (`PhaseChip`,
  `DoneStamp`, the split-flap `Flap`). `use-office.ts` is the office as the screens read it;
  `home/colleague.tsx` asks a colleague with files. `use-learn.ts` follows a reading wherever it
  started. Settings is one dialog of six sections (`features/minime/settings/`, after
  Thursday's, marked as the column marks its places; an ember dot where something wants the
  person, red where something is broken),
  each laid out with `parts.tsx`: AI model (the brain, learning after each conversation, the lighter
  model), Permissions (`permissions-section.tsx`: how much it does alone, rules taken back,
  the folders it reads), Connectors, Notifications & phone (the messenger, kept questions' hours,
  quiet hours), Office (`office-section.tsx`: open here, join, invite, the team server's own page
  for an office on a server (one's account there and, for its admin, how people sign in), people,
  the team's keys (`brain-panel.tsx` `TeamKeys`), leave, the lobby) and General (language, theme, version, Files
  from `server/stored.ts`). The clone's screen
  reuses `clone-section.tsx` (about them, the memory as saved with each line correctable or
  removable, its skills and, in an office, the office's skills (`skills-section.tsx`, route
  `app/api/me/skills`: share one of theirs after seeing its files, add or update a colleague's),
  reading again, bringing what their usual AI remembers, starting over),
  `requests-section.tsx` (the menu, trust levels, the like-me score, ME.md lines) and the flows;
  `preferences-section.tsx` draws the preferences' parts wherever they belong (`parts`; how much
  it does alone is `AutonomyChoice`, the same on the first steps' last step, on
  `components/ui/choice-list.tsx`, the explained choice the first steps' team uses too). Keys:
  ⌘K search, ⌘, Settings, ⌘1–9 a section there, ⇧⌘O a new chat, ⌘\ the column, / the box, ?
  the list of keys; the tab's title carries what
  waits. `features/brand/`: the app's mark (`logo.tsx`, the person's own clone at rest, also
  `app/icon.svg`, outlined as the clone's place in the column), the places' marks (`nav-icons.tsx`,
  lucide's, as Thursday picks them), the services' and AI vendors' marks (`marks.ts`, generated from
  lobe-icons (MIT) and simple-icons (CC0), drawn by `brand-mark.tsx`) and the languages' flags
  (`flags.ts`, from country-flag-icons (MIT), drawn as a picture by `language-switch.tsx` `Flag`).
  `/files/<path>` (`app/(app)/files/[...path]`, `shell/file-screen.tsx`) opens what the clone
  made in its workspace through `app/api/me/workspace` (inside the workspace only, links leading
  out refused, always an attachment and sandboxed): Markdown drawn, a page in a frame without the
  app's origin, a picture, a sheet as a table, text, or Save.
- Preferences (`server/preferences.ts`, `settings.json` `preferences`, `app/api/me/preferences`):
  how much the clone does on its own in the person's own work (`gate/autonomy.ts`: `ask` or
  `auto`, one of two since 10-08, a `reads` kept from before reading as `ask`; `auto` reads, acts in
  connected services and its browser (never uploading or running code in a page), runs sandboxed
  commands and asks colleagues; a session starts with the mode's rules
  (`ownModeRules`) and the gate lets the mode's asks through (`alreadyAllowed` with `own`), never
  for a colleague's request; files leaving the computer, flows and Claude Code work are always
  asked), where new kinds of request start, when kept questions come (`batchHours`), learning after
  each conversation (`review.ts` skips when off), the lobby, background work on the brain's lighter
  model (`BACKGROUND_PURPOSES`, `providers.ts` `lighterModel`, Haiku on Claude Code), quiet
  hours for the phone (`quietFor`), and taking part in the office's meetings of the clones
  (`meetings`). Every default keeps the app as careful as before.
- `features/minime/`: the person's clone. Its routes are `app/api/me/{learn,sources,import,memory,files,chats,gate,office,fix,task,reset,ping,flows,messenger,presence,connectors,trust,brain,profile,preferences,onboarded,update,skills}`, which
  answer only this app's pages; they take the person's language tag and tell the clone that
  language by name, keeping the last one for work that runs with no page open
  (`server/language.ts` `personLanguage`).
  Everything lives under `~/.clone-office` (`CLONE_OFFICE_HOME` moves it); its secrets (vendors' keys, the
  ChatGPT sign-in, connected services' tokens and clients, the messenger's tokens) are sealed with
  AES-256-GCM under the folder's own `secret.key` (`server/secret.ts` on `lib/seal.ts`, after
  Thursday's), a file kept plain before that read as it is and sealed when the server starts or at
  its next write. `server/sources/` reads
  each AI tool's local records (Claude Code and Codex session files; Cursor's and Hermes Agent's
  own SQLite files, where a changed chat is read again whole and a deleted one leaves the index),
  plus notes about the person; `server/apps.ts` reads app usage from
  what the system records (macOS, Windows, Linux).
- What the clone reads every time (memory) keeps only what stays true: how the person works,
  decides and talks, the corrections they gave, and what surrounds their work. What they are
  working on and the people they work with are kept as note pages, dated, opened when one comes up
  and kept current as it works with them (the first reading writes them, `learn.ts`
  `keepKnowledge`, a project's page starting with its folder), and where their work lives as one
  map page, every folder with what it holds (`notes.ts` `WORK_MAP`, `learn.ts` `keepMap`, named in
  every session's prompt so the clone looks there before searching); the rest that changes (plans,
  dates, files) is looked up when needed, never stored, as a stale copy misleads.
- `features/minime/memory/`: the clone's memory, following Hermes Agent's layout and learning
  loop. `store.ts` keeps `memories/USER.md` and `MEMORY.md` (small, capped, read every session),
  with each line's source beside them in `.sources.json`, never in a prompt (what kept it, from
  the session's purpose, and its conversation: `session.ts` `sessionOrigin`, after OpenClaw's
  memory provenance);
  `skills.ts` keeps `skills/<category>/<name>/SKILL.md` packages with `references/`, `templates/`,
  `scripts/`, `assets/`, a usage sidecar and an archive that is never deleted; `curator.ts` sets
  aside long-unused skills weekly; `notes.ts` keeps one page per person, piece of work or topic
  under `notes/`, with an index and log written by code; `mcp-server.ts` serves all of it as
  tools. `skills/` (top level) holds the skills the app ships, laid out as the store is and shipped
  in the package: methods, never a report template nor a restatement of a tool (what is the app's
  own is a tool, so finding one in the open registry is `memory/hub.ts`'s tools alone): making a
  skill, learning a task by watching the person, driving its browser, making an artifact (each named on the clone's page in the
  person's language while it is as it came, `settings.skills.shipped`, `bundledOrigins`); `SkillStore.syncBundled`
  brings them in when the server starts and before a session or the clone's page first lists
  skills, after Hermes Agent's skills_sync
  (`.bundled.json` keeps each one's origin hash: a later version replaces one only while it is as
  it came, one set aside is not brought back, a skill of the person's by the same name is never
  touched, and one the app no longer ships is set aside while it is as it came and becomes the
  person's once adapted); they are `created_by: "bundled"`, which the review may adapt but not
  set aside and the curator leaves, and start over does not count as the person's until changed.
  A skill also travels within the office (`office/shared-skills.ts`): `SkillStore.pack` gathers
  SKILL.md and the four folders as they would go (no link to anything elsewhere, no program, the
  memory threat scan over all of each text, 256 KB and 50 files at most), and `addShared` brings
  in a colleague's after the same checks and its hash (the relay's `skillHash`, which `treeHash`
  is), written aside and put in place whole, never runnable, `created_by: "office"` (the review
  leaves it, the curator too), its origin in `.office.json`: a later version replaces it only while
  it is as it came, and a skill of the person's by that name is never touched, after Hermes Agent's
  skills hub (quarantine, scan, install, `_has_local_edits`). A version set aside while its newer
  one is put in place goes back on the next look if the process died between the two, and what is
  left over goes once shown to be the office's copy as it came, or old (`recoverLocked`); an origin
  goes with its skill, and one not `created_by: "office"` is the person's whatever `.office.json`
  says. The relay's `skillFrontMatter` and name rule are the store's too, and a name is checked
  before it goes into a relay address (`office/client.ts`).
  `features/minime/brain/`: what the clone thinks with is the person's pick
  (`choice.ts`, `settings.json` `brain`; keys apart in `brain/keys.json`, 0600, checked by listing
  the vendor's models for free; `providers.ts` the vendors and suggested models, after Thursday's
  picker; `VENDORS` lists them vendor first with their ways in): their own Claude Code, their
  ChatGPT plan through OpenAI's Sign in with ChatGPT (`chatgpt.ts`: the first sign-in registers the
  app for this computer with a host id kept once, the issued client is reused, the callback is
  `app/auth/callback` on 127.0.0.1 with only the port varying, the ID token is checked against
  OpenAI's keys, tokens renewed under a lock; requests go to the public Responses API with
  `store: false`, streamed), or a model reached with a key (Claude, OpenAI, Gemini, OpenRouter, or
  Ollama/LM Studio on this computer). `runSession` sends the second to `loop.ts`,
  the app's own loop on the Vercel AI SDK, as Hermes Agent, OpenClaw and Thursday run theirs: the
  same tool server and connectors over MCP and Claude Code's Read, Glob, Grep and WebFetch
  (`loop-tools.ts`; a connected service's tools are only named, and reached through `tool_search`
  and `tool_call`, after Thursday, so their schemas do not fill a small model's window; what a web
  page or a service returns comes inside `<untrusted>` marks with hidden characters taken out,
  `untrusted`, and the system prompt's "What comes from outside" says what that means), with the same names and permission rules, asking through the gate route as
  the permission prompt does; its conversations in `brain/sessions/<id>.json` so a session goes on
  or is copied for the review, and a session it never kept answers `session-missing` so a
  conversation goes on from its own record; a shaped answer is asked for last, without tools.
  Caching, after Hermes Agent's: nothing that changes by the minute is in a system prompt (the
  date and time go before each message, `nowLine`), a session keeps the system prompt it began
  with, and `cacheHint` asks Anthropic (by key or through OpenRouter) to keep the cache an hour in
  the person's own conversation and five minutes elsewhere, and gives OpenAI and the ChatGPT plan a
  `prompt_cache_key` made from the session's unchanging start; `runlog.ts` keeps what was read
  from the cache, which Settings › AI model shows as a share.
  The page's part is `features/minime/brain-panel.tsx` (vendor marks, ways, models with one
  suggested and picked to start with; Claude Code's own Haiku, Sonnet or Opus, kept as the
  choice's `model`; `useBrainChoice` behind `BrainPicker`, the one field Settings and the first
  steps share, opening on vendors and what the one in hand offers, after Thursday's model picker,
  with the team's models first when the office keeps keys; the keys themselves are added in
  Settings › Office, `TeamKeys`) with the route `app/api/me/brain`.
  `session.ts` runs a session on the person's own Claude Code
  with those tools (the brain is a replaceable process: everything else talks to it only through
  `runSession`); `review.ts` looks back over a finished session and keeps what it taught;
  `runlog.ts` writes one line per session to `logs/runs.jsonl` (purpose, time, context, usage,
  cost; never conversation text), and `usageSummary` reads the last 30 days of it by what it was
  for, which Settings › AI model shows (`settings/usage-section.tsx`, `app/api/me/usage`).
- `features/minime/chat/`: the conversations with the clone, kept by the app itself
  (`store.ts`, one append-only JSON-lines file per conversation under `chats/`), so a conversation
  outlives any brain session. `turn.ts` runs one turn: it resumes the brain's session, carries a
  long conversation into a fresh session first (look back, then a summary under Hermes' headings,
  `SUMMARY_PROMPT`, with the person's own messages added by code, `theirWords`; no summary, and it
  goes on from the record), goes on from the conversation's own record when the brain lost its
  session, and looks back after the answer. What the person writes while it works waits in
  `steer.ts` (`app/api/me/task/note`, taken back while unread): the app's own loop reads it before
  its next step (`runSession` `steer`, through `prepareStep`, kept in the session where it came),
  and what is left when the answer is done (Claude Code runs whole) becomes the next turn at once,
  in the same stream (`stepped`, `next`). When to carry follows the brain's window
  (`brain/context.ts`: `contextWindow`, `carryPoint`, three quarters of it and at most 100K;
  `sessionLost` knows the services' words for a full window). Inside one turn on the app's own loop,
  earlier tool results are cut once half the window is used (`brain/prune.ts`, Hermes' first phase,
  through the AI SDK's `prepareStep`, and the session is kept cut), and Read gives at most 60,000
  characters at once. Conversations are searchable like the person's other
  AI conversations.
- `features/minime/gate/`: the trust gate. Code decides what goes to the person; the brain only
  proposes. In a conversation the clone may also read (files, the web), and Claude Code asks
  through the gate's `permission_prompt` tool before anything the person has not allowed
  (`--permission-prompt-tool`); `ask_me` is its own question to them (Claude Code's
  AskUserQuestion for a session without a terminal). `gate.ts` holds the waiting questions in the
  server process; `tools.ts` is the tool server's side (it reaches the app's `gate` route with a
  per-process secret); `rules.ts` turns "from now on" into Claude Code permission rules in
  `settings.json` (`trust.allow`) and the folders kept out into deny rules; `enrich.ts` works out
  what a permission card shows besides the tool's input as it is asked (whether "from now on" can be
  kept, never for a command or files; for a flow, the flow as it is and its kind's name), and
  `ask-text.ts` `askDetails` draws those lines alike on the page and the phone. Writing files and
  running commands are not given to the clone; sending a request to a colleague is asked first.
- `features/relay/`: the relay a team runs (`pnpm relay`). Files go with a request's messages:
  a member puts one (`POST /files`, its bytes, kept as bytea), then names it on the message it
  sends (`files` on `POST /tasks` and `/tasks/:id`, the message's `files` refs); only the one who
  put it and the two members of its request take it (`GET /files/:id`, always as an attachment);
  kept two weeks, one never named a day, 25 MB a file and 1 GB an office unless the relay sets
  `RELAY_FILE_MB`/`RELAY_OFFICE_FILE_MB`. It keeps everything in Postgres
  (`db.ts`): a Postgres URL (`--database` or `DATABASE_URL`) for a relay deployed on a server, or
  PGlite, the same Postgres inside the process, in a folder (`relay-data` by default) for a relay
  on one computer; one SQL for both, its versions in `relay.ts` (`MIGRATIONS`). One relay can hold
  several offices, each with its own key; a member's token is kept only as a hash. News reaches a
  waiting inbox through LISTEN/NOTIFY, so several relay processes can share one database, and the
  inbox looks again every two seconds where notifications do not arrive. `handler.ts` is the HTTP
  side as one handler another host can mount (it also limits wrong office keys from one address);
  `server.ts` runs it. `Dockerfile.relay` and `docker-compose.yml` run it with Postgres on any
  machine with Docker. Members join with the office key and then use their own token; a clone
  waits at its inbox (long polling) because it sits on a personal computer out of reach. Shapes follow
  A2A v1.0.0: an AgentCard per member, a Task per request with a contextId, Messages with roles
  user/agent and text parts, A2A's task states (a message the member's person wrote themselves, or a
  guest by a link, carries `by: "person"` in its metadata, `messages.by_person`, and A2A clients see
  it there); `a2a.ts` is A2A v1.0 itself, its JSON-RPC binding,
  in front of the same requests: every member is an agent at `/a2a/<member>` (its Agent Card at
  `.well-known/agent-card.json` under it, to the office's members only), and any A2A client with a
  member's token asks that clone (`SendMessage`, waiting for the answer or not; `GetTask`,
  `ListTasks`, `CancelTask`; a message without a task id goes on with the request still open in its
  contextId, as Hermes Agent's a2a tools go on; checked with the official `a2a-sdk` and with Hermes
  Agent's own tools). Meetings are the clones talking together (`POST /meetings`, a standup or a
  question to everyone): the members present take part, each says one thing a round or passes, a
  round ends when all have spoken or after four minutes (`advanceMeetings`, on a timer in
  `server.ts`), and everyone in the office reads it; a scheduled standup is held once a day. Members
  share skills with their office (`skills.ts`, `/skills`): one per name per office, its files whole
  as base64 (256 KB, 50 files, 200 skills an office), its description from SKILL.md and its hash
  made by the relay; only the one who shared it updates it, and they or an owner of the office take
  it out; members only. It keeps
  only cards and requests, their files, meetings (60 days), shared skills, and a few settings an office shares
  (`/settings/:name`: the OAuth client a vendor wants registered once for the team,
  `connector:<vendor>`, and the standup's days, time and zone, `meeting:standup`, which any member
  sets and all read), and team keys (`team-ai.ts`: one API key per vendor the office shares, team
  billing; sealed with `lib/seal.ts` under RELAY_ENCRYPTION_KEY or the PGlite folder's
  `secret.key`, never in the database alone; `GET /team-ai`, `POST /team-ai/:vendor` checks it with
  the vendor first; members' clones call `/ai/:vendor/...` with their own token where the SDK puts
  the key, and the relay passes the call on with the team key and streams the answer back, counting
  calls per member and day, `ai_calls`, and refusing a member's call past the day's limit,
  `team-key-limit`, 1,000 a vendor unless `RELAY_TEAM_AI_DAILY` says otherwise (0 for none), as a 403
  no clone retries; the clone's side is the brain choice's `team`, the team's models offered first
  on the AI model field; subscriptions are never shared). The relay runs as Node strips
  TypeScript, so its code (and all code: `erasableSyntaxOnly`) uses only erasable syntax. Someone without a
  clone is asked by a link (`POST /links`): the request goes to a guest, and `page.ts` serves
  the page they answer on (`/r/:token`; plain HTML, escaped, no scripts; the token is its only key,
  for two weeks or until answered); the answer reaches the asker like any other. An invite is one
  link, `/i/<office key>?from=<name>` (`GET /invite` gives it to a member): the relay's page guides
  setting up a clone with it (`install.ts`: Node.js, a terminal, then one line,
  `npx -y clone-office join "<link>"`, or with the app taken from the relay itself when it serves its
  own package, `CLONE_OFFICE_PACKAGE_FILE` at `/clone-office.tgz`, for a team's own build or before
  the app is on npm; the steps for the computer its User-Agent names and the
  others folded; on a phone, open it on a computer; on a private network, join from the same one;
  folded below, the same steps as words for the person's own AI on their computer, `agentPrompt`,
  as the repository's `llms.txt` gives any AI),
  and the join form fills in the relay and key from it (`office/invite.ts`).
  People sign in on the server, after Paperclip (Better Auth) and OpenClaw (a one-time setup
  link): `accounts.ts` runs Better Auth over the relay's own database (pg's pool, or PGlite through
  a small Kysely dialect of its own, `pglite-dialect.ts`, without Kysely's transactions, which
  would interleave with the relay's queries; its tables `auth_*`, made at start, so its own
  background look at them is off; its secret `BETTER_AUTH_SECRET` or one made once and kept in
  `server_settings`, sealed under the relay's key, `relaySealKey`, as team keys are; Google's
  tokens encrypted, `encryptOAuthTokens`), lets people in with email and password and, once the
  server's admin set it up, Google (`server_settings` `sign-in`: each way on or off, one always
  on, and the admin keeps one of their own; the OAuth client's secret sealed and never shown;
  Better Auth made again when they change, `refresh` reading another process's change; the admin
  is an owner of the server's first office, `isAdmin`; Google's way back is Better Auth's own
  route, `GOOGLE_CALLBACK`, the only one of its routes the relay serves; a Google identity never
  joins an account by its email, `disableImplicitLinking`, but is connected from one's page,
  `googleLink`; it makes an account only from an invite, `disableImplicitSignUp`, and only with
  an email Google checked; the way back is bound by an encrypted cookie, `storeStateStrategy`,
  and Google's tokens are dropped; a change is one locked step on the settings as stored,
  `update`, signing out those left without a way; passwords come back on whenever Google cannot
  work, or `RELAY_PASSWORD_SIGNIN=1`; the admin makes a one-time reset link for a forgotten
  password, `resetLink`, as no mail is sent, and removes an account, `removeAccount`), puts a person in the office whose invite they signed up with
  (the first owns it; `office_people`), and makes a computer's setup code (hashed in
  `setup_codes`, ten minutes, used once). `POST /pair/claim` turns it into that computer's own
  member token under the person's account (`members.user_id`; one person, one clone:
  `Relay.joinAs` moves it). `people-pages.ts` is the invite's sign-up page, sign-in (Google first
  where it is on, as a link, since the pages' forms post only to the server), one's own page with
  the line to run, the people in the office and how one signs in, and the admin's sign-in settings
  (`adminPage`), plain HTML with no scripts and the app's mark; going to Google starts only from
  the server's own pages (Fetch Metadata), and Google's refusals read in the person's words
  (`googleProblem`); a form from another site is refused (Fetch Metadata first, else the Origin; the pages keep
  their referrer within the server, so a browser's own form never comes as "null"), and wrong
  sign-ins count against the caller's address. An office's owners also remove people (their
  clone's place goes at once, what they asked stays) or clones that joined with the bare key,
  make others owners, make a new invite link (the office key changes; those in stay) and name the
  office (`Accounts` `removePerson`, `removeClone`, `makeOwner`, `newInvite`, `renameOffice`),
  each looked at once on its own page first (`confirmPage`); the invite's page folds the account
  away below the guide. `npx clone-office connect <link>` (`bin/clone-office.mjs`) claims it, keeps the token in `settings.json` (`office`, closing an
  office this computer hosted), and starts the app. `RELAY_PUBLIC_URL` is the address people reach
  a server at behind a proxy.
- `features/minime/office/`: the clone's side. `client.ts` (where its relay is and who it is
  there, in `settings.json` under `office`, and the calls), `host.ts` (an office opened on this
  computer: the app starts `features/relay/server.ts` itself, PGlite in `relay/` under the
  clone's folder, listening on the network, and joins it at 127.0.0.1; `settings.json` `host`
  keeps its port and key so links stay the same, and the person's membership while it is closed;
  links for others carry this computer's network address, a private IPv4 or else its IPv6
  (`publicRelay`); the relay stops with the app through its stdin, `RELAY_WITH_PARENT`, and is
  started again when the page next asks about the office), `worker.ts` (one loop per server
  process: waits at the inbox, answers requests that come in, puts answers to sent requests back
  into their conversations), `handle.ts` (answers a request with the brain from what it knows,
  asking its person through the gate for what only they can give; a busy AI service is retried
  before failing), `check.ts` (a separate look before an answer leaves, product 2.8a: what it
  holds back goes to the person as a card: send, send a fixed answer, or hold), questions about a
  request the person does not answer within two minutes are kept in `state.ts` (`later`) and the
  colleague hears they will get back to them; answering one later goes on with the request
  (`answerLater`). Stepping in, after Thursday's step-in: the person tells their clone something
  about a request (`stepIn`; `state.ts` `handled[task].notes`, read before its next answer leaves,
  wakes it when it waits, answers a question it waits on, taken back while unread, `takeBack`),
  answers it themselves (`answerMyself`, sent with `by: "person"`; kept open, the request is theirs,
  `handled[task].person`, and the colleague's next words wait for them as a `later` of kind `self`,
  sent as their own), or hands it back (`handBack`, the clone goes on from `requestRecord`); a held
  answer now takes the request over instead of closing it. Whatever the one asking writes while an
  answer is made is read before it leaves (`lateWords`); a lost or overgrown session goes on from the
  request's own record (`sessionLost`, `carryAt` in `brain/context.ts`); the request's words are
  framed as a request to weigh, with who wrote them (`whoWrote`). `menu.ts` (the
  kinds of request the person takes, each with a trust level: auto, tell or ask; the kinds go on
  the card as A2A skills, the trust levels stay in `settings.json`. The brain names a request's
  kind; code then sends it, sends it and tells the person in their latest conversation (chat role
  `told`), or has the check show it to them first), `state.ts` (inbox cursor, sessions, where sent requests came from, a lease per request and one office worker per folder, so no request is answered twice; open requests are picked up again after a restart), `inbox-tool.ts` (`office_inbox`, free: questions kept for the person, requests they sent and colleagues sent them, read from the relay with the clone's own key, so it works in flows too), `shared-skills.ts` (the office's skills and how each stands here: new, added, update, changed here, taken by a skill of the person's, theirs; sharing one of theirs, never one the app ships or a colleague's; adding one checked first; scripts kept as files, never run by the clone) with `skills-tool.ts` (`office_skills`, free, a shared SKILL.md coming back inside `<untrusted>` marks; `office_skill_manage`, share/add/unshare, asked every time on a card listing the files that go or come, worked out by the tool itself, which the session lets through its own check for that reason, `session.ts` `SELF_ASKING_TOOLS`, and never "from now on", `rules.ts` `ALWAYS_ASKED`; both left out while answering a colleague), `me.ts` (ME.md, written from the card whenever it changes: who, how to work with them (lines the person added one by one; `card.ts` `draftWays` drafts them), what to ask them for; the card's `howToWork` carries the lines to the relay), `likeme.ts` (the like-me score: of the answers shown to the person first, the share sent as they were, last 30 days, overall and per menu kind), `files.ts` (files between clones: what goes is checked first, a full path, not in a folder kept out, 25 MB at most, then put at the relay and named on the message; what comes is taken once into `office/files/<request>/` with an index, owner-only, and the request's session may read that folder alone; `ask_colleague` takes `files`, shown on its card (`ask-text.ts` `changeOf`) and asked every time, even when asking colleagues was allowed from now on (the tool server asks again, `seen`); an answer's `files` go only after the person saw them, through the check with `approve`; the page saves one through `app/api/me/office/file`, always as an attachment). In a
  conversation the brain has `colleagues` and `ask_colleague` (`gate/tools.ts`); the screens'
  office is `/office`, `/requests` and the column's To decide (`features/minime/shell/`), with
  Settings › Office and the clone's Requests it takes, and the route `app/api/me/office`.
  `invited.ts` keeps an invite the launcher was given (`settings.json` `invite`) until joining or
  opening an office uses it. `meeting.ts` is this clone in a meeting: in each round it says one thing
  for its person or passes, found first in their own records (`conversation_search` since the day
  before; a session with `audience: "colleagues"`, so the tool server leaves the person's office and
  flows out, as when answering a colleague), then looked at once more as an answer is (`check.ts`):
  what that holds back is not said. Once it is over, it tells its person only what matters to them,
  in a conversation of the meeting's own with what was said (`state.json` `meetings`). It takes part
  only when the person turned it on (`preferences.meetings`, off at first; starting a meeting turns
  it on), else it passes at once; the worker opens the standup at the office's time
  (`standupDue`). The office's work starts with the server (`office/boot.ts`
  from `instrumentation.ts`: the office open here, and the loop that answers colleagues), and
  again whenever a page asks about the office.
- `features/office/room/`: the office floor, from the confirmed design (`docs/office-room.local.d/`,
  v13) as simplified on 10-09 (the user: nothing that moves for show, the board unreadable, a big
  clock and who is in instead). Plain ES modules that build SVG as strings: `core.mjs` (the clone
  mark, the hand-drawn line, the plan projection, one frame loop), `pieces.mjs` (desks, commons,
  lift, the clock on the left wall, `clockFace`: the time in seven segments, who is in out of
  everyone and their faces), `floor.mjs` (the plan: desk areas split evenly, the commons in the lane
  by the lift, a floor no larger than its desks need; walking on a grid), `office.mjs`
  (`createOffice`: sheets, scenes, camera, panel, and the lobby with its lift ride, once a day: the
  building standing as it is, nobody walking in, the doors a plain panel opening on the whole floor
  with the person's clone stepping out, 10-10). Only
  what means something moves: a request carried or thrown to a desk and answered with DONE, a clone
  coming in or going home through the lift, one at work, one asking its person; no tea runs, no
  vacuum, no hearts or smiles, and the office opens as it is, everyone in already seated. Each
  clone is named over its head with what it is on (`plateOf`; at an empty desk, whose it is), all
  of them once the floor is near enough to read. A meeting of the clones (`RoomData.meeting`)
  gathers its members round the reading nook's low table, where they take turns, what each said
  over its head, and go back once the last word is read; `example` (the first steps) opens with
  everyone seated and named, the desks framed close, without the clock; `setInset` keeps room at
  the sides for what the page lays over it (a panel at the right that ends partway down lets the
  floor pass beneath it, `clearOf`), `onPanel` and `closePanel` let the page's own panel and the
  office's take turns), `looks.mjs` (each clone's colour and shape, for lists outside the floor).
  Full screen (`of-full`) it fills its frame; `of-pane` fills the office screen and `of-mini` is
  the chat's small live view, the whole floor at half rate, with no controls. Its performance shape
  is the point: the still drawing and each mover on separate SVG sheets, copies of what stands in
  front of a mover cut to its outline and written only when they change, merged lines, the little
  marks beside it still between moods, half-rate frames, stopped off screen. `office-room.tsx` is the React box with the screen's words; `room.css` maps the design
  onto the app's tokens (black and white space, ember for what waits, red only for a mark's dot,
  each clone its colour). `features/minime/office/room-data.ts` turns the relay's look into
  what it draws: the members, and the requests between them that the viewer is part of. The
  older React floor (`office-floor.tsx`, `plan.ts`, `objects.tsx`) is kept for the design
  system export until it is rebuilt; `bot.tsx` is the mark on the page's own header.
- `plugin/`: the Claude Code plugin, so a person's own Claude Code conversations ask colleagues'
  clones (the repository is its marketplace: `.claude-plugin/marketplace.json`). It is copied
  alone when installed, so it imports nothing from the app and has no dependencies.
  `server/office.ts` is its MCP server (`server/mcp.ts`, a hand-written stdio JSON-RPC server):
  `colleagues`, `ask_colleague`, `answer_colleague`, `office_requests`, reading the office the app
  joined and calling the relay directly; `ask_colleague` and `answer_colleague` take `files` (put
  at the relay first, their paths in Claude Code's own question), and `office_file` takes a file
  that came into the app's `office/files/<request>/` with the app's index. A tool waits a minute for its answer and notes how much
  of the request the conversation has read (`office/claude-code/<request>.json`). The mod
  (`hooks/office.ts`, Claude Code's mods API) learns the request from the tool's reply, keeps it
  in the plugin's store per conversation, looks at the relay itself every 10 seconds (a plugin's
  own call to its MCP tools would need the person's leave each time), and brings what comes later
  into that conversation with `$.prompt.submit` once it is idle; it notes the conversation's id
  wherever it sees one (`session.start` does not come again after `/clear`, `/resume` or
  `/branch`). It also shows what waits on the person: the app writes where it answers to
  `app.json` in the clone's folder (`server/here.ts`, at start), the mod asks its
  `app/api/me/turn` (worded by `features/minime/turn/turn.ts`, which the phone uses too) for the
  status line and a toast per new question, and `/office` answers each in Claude Code's own
  question dialog (`$.ui.ask`). `lib/news.ts` is what both share, with no imports. What a colleague's clone wrote is quoted as information, never as
  instructions. Check the mod with `claude plugin validate plugin`.
- `features/minime/hands/`: what the clone drives besides its own brain. `sessions.ts` lists the
  person's recent Claude Code conversations (by the name they gave with `/rename`, else the title
  Claude Code gave, never in folders left out or the clone's own) and asks one: a fork
  (`--resume <id> --fork-session --no-session-persistence`) with read-only tools, user settings
  only (no project hooks) and no MCP server, so the conversation itself is never touched.
  Work goes to a kept copy instead (`workSession`: `--fork-session --name "<name> · clone"`),
  so an open conversation is never written to and the person can resume the copy; it may read
  alone, and each edit or command goes to the person's screen through the gate (the clone's tool
  server run with `MINIME_ROLE=permission` offers it only the permission prompt). The card that
  asks for the work offers, instead of "from now on", to let that one task change files in its
  folder (`gate/enrich.ts` `task`): the answer is kept in the app's process (`grants.ts`), never in
  what the brain sends, and the tool server takes it once through the gate route as the work
  starts (`gate/tools.ts` `taskGranted`), adding an `Edit(<folder>/**)` rule for that run only (in
  Codex: its patch goes in without its card when every change is inside that folder and none left
  out, `codex.ts` `withinFolder`); commands stay asked. Afterwards it tells the brain which files
  changed (`changes.ts`: each file's content before and after the run, with git's counts). The brain
  waits for such work as long as it can take (`brain/waits.ts` `TOOL_WAIT_MS`), so it never reports
  a failure while the work goes on. `codex.ts` does
  the same for Codex conversations (rollouts read by `server/sources/codex.ts`, archived ones left
  out; named from `session_index.jsonl`, else by what was first asked): `codex exec --ephemeral
  --ignore-rules fork <id> -`, nothing written to the conversation and the copy kept nowhere, the
  person's execpolicy rules (whose "allow" runs outside the sandbox) not loaded, and CODEX_API_KEY
  not passed on. Codex cannot ask anyone mid-run, so a permission profile given with `-c`
  (`sandboxConfig`: `default_permissions`, read anywhere but the folders left out as paths and the
  clone's secrets, no network, approvals "never" and never by an automatic reviewer) bounds it:
  asking writes nothing; work writes only in a copy of the project (`copy.ts`: the repository's
  files as they are now, tracked and untracked but not ignored, not in folders left out,
  copy-on-write, in a git repository of its own under `hands/work/`, so the person's repository is
  never written to), and what it changed is one patch (`git diff-tree --binary` from the copy's
  first tree) shown on one card, `mcp__minime__apply_changes` (asked every time, `ALWAYS_ASKED`;
  `ask-text.ts` `changeOf` shows the files and lines), put by the tool server itself
  (`gate/tools.ts` `askPermission`); allowed, `git apply --check` then `git apply` puts it into the
  person's folder all or none, otherwise it is kept in `hands/changes/`. A folder outside git can
  be asked but given no work. `tools.ts` serves `sessions` (free, both tools with a tool column),
  `ask_session` and `work_session` (asked through the gate) to the brain.
  The clone's own hands, in the person's own work only (`runSession` `connectors`, never a
  colleague's request; `MINIME_OWN_WORK` tells the tool server): `shell.ts` serves `bash` and
  `write_file` in its workspace (`server/paths.ts` `workspaceDir`), commands run inside Anthropic's
  sandbox runtime as Claude Code's are (Seatbelt on macOS, bubblewrap on Linux; started once per
  tool server): reading everywhere but keys, secrets, mail, browsers' profiles, the clone's sealed
  files and the folders left out (by path, or by name where the sandbox takes patterns), writing
  in the workspace and the temporary folder only, the network through its proxy, never this
  computer's own addresses, secrets kept out of the environment and caches in the workspace; the
  tool asks the person itself (`askPermission`), unless `auto` or "from now on" lets a sandboxed
  command alone; with no sandbox every command is asked and never kept. `browser.ts` starts
  Microsoft's Playwright MCP as the `browser` server (Chrome where installed, else Edge or
  Chromium; the clone's own profile; a window while the person watches, none in a flow); looking is
  one rule (`browser:read`), acting asked by hand, uploading and running code in a page asked every
  time, running code in its own process never offered. `names.ts` names them with no imports, for
  the cards on the page. `memory/hub.ts` serves `skills_find` (free: the open registry, skills.sh,
  searched and a SKILL.md read, as outside text) and `skill_install` (asked every time on a card
  listing the files; `SkillStore.addFromHub`, the office's checks, `created_by: "hub"`, its origin in
  `.hub.json`, replaced only while as it came; files outside the four folders moved under
  references/ or assets/ and SKILL.md's mentions following them, `relayout`). A session's skill
  index lists 40 skills at most, the shipped ones and those used lately, and counts the rest.
- `features/minime/history/`: a search index (SQLite FTS5 via `node:sqlite`, under `index/`) of
  what the person typed to their AI tools and what those answered, built in bounded passes that
  resume by byte offset, with CJK text indexed as bigrams; `tools.ts` gives the clone
  `conversation_search` and `conversation_read`. The index is derived: the tools' records are
  only read, and it can be deleted and rebuilt. A learning indexes only the conversations it reads
  and the rest is caught up in the background (`catchUpIndex`; every ten minutes while the app
  runs, `keepIndexFresh`). `features/minime/learn/`: the first
  transplant, `gather.ts` (material within a budget sized to the model's window, from instruction
  and memory files, where their work lives (`server/places.ts`), recent prompts by most active
  folder and their conversations' titles, the person's own commits, document kinds and apps, and
  the names on their account and commits as hints; a later reading takes only what changed) and
  `learn.ts` (one session whose structured answer holds what they do and what to call them, up to
  twelve lines on how they work and fourteen on their work's surroundings, the map, up to twelve
  projects and ten people as pages, saved by code, which holds those limits too (`LEARN_CAPS`; the
  map keeps sixty places, the newest first), and three tasks); `export-prompt.ts` and `import.ts` (what another AI remembers,
  kept the same way, the pasted text stored nowhere); `reset.ts` (start over: what is kept moves
  into `backup/`, never deleted; when it all came from a reading, with nothing of the person's
  (no conversation, skill or note, no memory written after the reading), it is cleared instead).
- `features/minime/flows/`: flows, the person's "when this happens, do this" for set times (after
  Hermes Agent's cronjob tool). `schedule.ts` (weekly days and time, every N minutes from 30, or
  once, or when a colleague's request comes in: of a menu kind, or `about` a topic in the person's
  words, which the brain says a request is about (`ways` in `office/handle.ts`'s answer), with
  `first` ("ask" or "tell") that code then holds to over the kind's trust level; the clone writes
  this shape, the code never reads words; a missed run is made up once:
  on set days up to 12 hours late, every N minutes within half the period (2 hours at most), once
  within 2 minutes; each flow's time is decided and claimed under its own lock, so it never runs
  twice), `store.ts` (one file each under `flows/`), `run.ts` (a run
  is a fresh session with nobody to ask: `runSession` `standing`, only what the person already
  allowed; its answer goes into the flow's own conversation as a "flow" line and the answer;
  nothing is learned; `tick` every minute while the app runs, under a lock), `tools.ts` (`flows`
  free, `flow_manage` asked first on a card; a name over 80 characters or a request over 4,000 is
  refused, never cut, so what was approved is what is kept), `when-text.ts` (a schedule in the
  person's language, as it would be kept, for the page and the phone). The page's part is `features/minime/flows-panel.tsx`
  with the route `app/api/me/flows`.
- `features/minime/connectors/`: the services the clone works in, each through its vendor's own
  remote MCP server (Hermes Agent's catalog, Claude Code's remote servers). `catalog.ts` lists them
  and how each is signed in to: `oauth` (the server registers this app itself, dynamic client
  registration: Notion, Linear, Atlassian), `team-oauth` (Google wants a client registered first,
  with the APIs and scopes the page asks the team to turn on), `token` (GitHub's personal token).
  `oauth.ts` signs in with the MCP SDK's own steps (discovery, registration, PKCE, RFC 8707
  resource except for Google, which is asked for offline access), takes the code back at
  `app/api/me/connectors/callback` (reached by the browser, by the Host it used) and refreshes an
  access token under a lock before it runs out; `store.ts` keeps each service's client, sign-in
  place and tokens in `connectors/<id>.json` (0600) and a sign-in under way for ten minutes;
  `team.ts` takes the Google client from the office (the relay's `office_settings`,
  `connector:google`, set by any member, shown with who set it) or else the person's own
  (`settings.json` `connectors.clients`). A session reaches the connected services only for the
  person's own work (`runSession` `connectors`: conversations and flows; a colleague's request,
  `colleagueReads`, gets only the services the person turned on for it, `colleagues.ts`, settings.json
  `connectors.forColleagues`, each off at first; their listed reading tools are allowed and every
  other one refused, fail closed: the loop offers those alone, `readsOnly`, and Claude Code's
  prompt refuses the rest outright, MINIME_READS_ONLY): each is an `http` server in its `--mcp-config` whose `headersHelper` runs `headers.ts`
  (`dist/connector-headers.mjs` in the package) for a fresh token, so no token is in the
  arguments, and each tool is asked through the gate (`rules.ts` `ruleFor` makes "from now on" a
  rule for that one tool). `tools.ts` keeps what each server offers (`tools/list`, again once a
  day) and which tools only read (MCP's `readOnlyHint`): on a reading tool's card "from now on"
  becomes `connector:<id>:read`, reading in that whole service, which `runSession` turns into its
  reading tools (`sessionRules`), while each change is still asked. The page's part is
  `features/minime/connectors-panel.tsx` with the route `app/api/me/connectors`.
- `features/minime/messenger/`: the clone in the person's messenger, Discord, Telegram or Slack,
  one at a time (after Thursday's `features/reach/` and Hermes Agent's gateway). `discord.ts` is a bot
  with no dependencies: the gateway over Node's own WebSocket (direct messages only, no privileged
  intent), resume, heartbeats, the close codes that end it, and the HTTP calls (messages in pieces
  with buttons, typing, a press taken at once and its message settled after, the invite link from
  the application id). `telegram.ts` is the same over Telegram's Bot API: a long poll for updates
  (private chats only; Start's "/start" is only a hello), messages in Telegram's HTML with inline
  buttons and sent again as plain words when Telegram cannot parse the marks, a press answered at
  once and its message edited after, the t.me link to the chat. `slack.ts` is Slack in Socket Mode:
  the app-level token opens a WebSocket for events (every envelope taken at once; a new socket when
  Slack closes one), the bot token speaks through the Web API (mrkdwn, buttons as blocks, a thread
  reply as a reply), and `manifest.ts` is the app the page copies, with exactly those scopes; the
  two tokens are told apart by their xoxb-/xapp- starts. Each bot hears the files sent to it
  (fetched only when wanted, and only from the person let in: `bridge.ts` keeps them in
  `messenger/files/<day>/` with `office/files.ts` `keepFile`, tells the clone where, and lets the
  phone's turns read that folder alone) and sends files (`sendFile`: a colleague's answer's files,
  carried on the conversation's line, `chat/store.ts` `files`). `text.ts` cuts text into pieces (a code
  block cut in two is closed and opened again) and draws markdown as Telegram's HTML and Slack's
  mrkdwn.
  `bridge.ts` joins either to the clone: whoever writes first is asked about on
  the page with a 4-digit code sent to their phone, one at a time, and what they wrote meanwhile
  is answered once they are let in; then their messages go into one conversation through
  `chat/turn.ts` `runTurn` ("/new" starts another), the gate's questions come as buttons or wait
  for their words (`ask-text.ts` words them as the page's cards do; `gate/answer.ts` answers them
  for both), and the answer is sent as soon as it is done. While no page is in view
  (`server/presence.ts`: each page in view and in focus says so every 20 seconds through
  `app/api/me/presence`, `use-presence.ts`; silent for 50, it is gone), what waits on the person
  goes to the phone, as Thursday's reach brings open work: questions waiting at the gate (a
  colleague's request says who asked what, through `messenger/office.ts`), questions kept for
  later at the day's batch moments once each (`phoned` in `office/state.json`; one sent live is
  answered there still, through the kept question's `ask`), and finished work nobody has seen (a
  flow's answer, a colleague's answer in a conversation on the page; `chat/store.ts`
  `onChatMessage`). News in the phone's own conversation goes to it whoever is watching; progress
  never goes. A reply to one of its questions answers that one. `settings.json` `messenger` keeps
  the service, the token, the person and the conversation (`settings.json` is written for its
  person alone, `writeSettings`); a new token for the same service keeps the person let in, another
  service starts afresh; one process per folder holds the bot
  (`messenger/holder.json`). It starts when the server does (`instrumentation.ts`) and when the
  page asks; its words come from `messages/` through `i18n/messages.ts`. The page's part is
  `features/minime/messenger-panel.tsx` with the route `app/api/me/messenger`.
- `features/minime/server/sources/lines.ts`: line readers every record reader uses (lines over
  2 MB are skipped, logs can be read from the end); `server/exclude.ts`: folders the person keeps
  out of everything, from `settings.json`; `server/folders.ts`: the folders they worked in lately,
  from every tool's lists; `server/places.ts`: where their work lives, those and the folders they
  changed in the last 30 days (the usual work folders, four deep, a thousand names and three
  hundred files a folder, a budget of names and time shared among the work folders, hidden and
  build folders, links, keys and folders left out skipped, a repository by git alone, its reflog
  saying how much happened there), none inside another (`rankPlaces`: a repository is one place,
  a folder worked in with AI another, a folder holding either a collection the page groups them
  under, other changes going to the folder right under the deepest collection; a work folder of
  loose files is one place), ranked, which the screen offers as the folders it reads
  before the first reading and any time after ("Folders it reads"), and which the reading
  describes (a folder's newest file names and kinds, a repository's address, layout, README head
  and manifest). Everything that touches their folders runs in a process of its own
  (`places-walk.ts`, `dist/places-walk.mjs` in the package), killed at its deadline: on macOS
  opening Desktop, Documents or Downloads waits for a consent dialog, and a wait inside the server
  would hold its few file threads. Leaving a folder out removes what the index holds from it at
  once (`history/indexer.ts` `forgetExcluded`).
- `guide/`: how Clone Office works, written for the person using it; the clone reads it with
  `guide_read` (`features/minime/memory/guide.ts`). A change the person would notice updates
  `guide/` in the same change.
- `.claude/rules/ui.md`: map of the current UI. Read it when touching that area.
- `.claude/rules/taste.md`: working visual directions, not a frozen design specification.

- `bin/clone-office.cjs` (the entry: any Node parses it, and one older than 22.13 is told what to do
  instead of failing on the module), `bin/clone-office.mjs` and `scripts/pack.mjs`: the npm package. `node scripts/pack.mjs [--working]`
  builds it in a temporary folder from the repository's own files only (committed, or with
  `--working` every file git tracks or would track; ignored files never), so nothing private
  and no path of this computer reaches it: the app as a standalone server (`next.config.ts`,
  `CLONE_OFFICE_PACKAGE=1`, its own `.next-package/`), the tool server and the relay bundled into
  `dist/*.mjs` (Node does not run TypeScript inside node_modules), the guide, and the launcher;
  next, react and the relay's pg and PGlite come from npm. It leaves `dist/clone-office-<version>.tgz` and publishes nothing
  (`PACK_VERSION` gives a canary its own version). `scripts/smoke.mjs` starts that package as a person
  would, in a folder of its own, and opens its first page. `.github/workflows/`: `ci.yml` (types, lint,
  tests, build; the package built once and started on Linux, macOS and Windows; an old Node told
  what to do), `release.yml` (release-please's Release PR; merging it tags, checks again and
  publishes to npm with provenance through trusted publishing; by hand, `next` for a test build or
  `latest` for the first release), `pr-title.yml` (conventional titles); actions are pinned to the
  commit of their release tag and dependabot moves them.
  The launcher (`npx clone-office`) starts the app on 127.0.0.1 from port 4417 and opens `/`;
  `npx clone-office relay` starts a relay; `npx clone-office join <invite link>` keeps the invite in
  `settings.json` (`invite`, after checking the office answers) and starts the app, whose first
  steps or Settings › Office join with it (`connect` and `join` each take either link). When the
  app already runs for the folder (on the port `app.json` names), it is opened rather than started
  twice. `npx clone-office service install|uninstall|status` (`bin/service.mjs`, after OpenClaw's
  gateway service) has it start at sign-in with no window: a LaunchAgent on macOS and a systemd user
  service on Linux, both restarted only after a crash (the launcher exits quietly when it already
  runs), and a hidden script in the Startup folder on Windows; Settings › General's **Start with
  this computer** runs the same command through `app/api/me/service`. In the package,
  `npx clone-office doctor` (`bin/doctor.mjs`) checks Node, the folder, the running app, the AI
  model's sign-in (`claude auth status`, no model call), the office's relay with the member's token,
  the login item and npm's latest, each with what to do. In the package,
  `CLONE_OFFICE_APP_DIR` tells the app where its guide and tool server are (`server/paths.ts`
  `appDir`, `toolServerPath`).

`pnpm dev` serves on loopback. This is Next.js 16; consult the installed Next documentation
before relying on older APIs. Use typecheck, lint, `pnpm test` and build as appropriate to the change.
Update an affected code map when its description becomes inaccurate.

`../voice-agent` (Thursday) is a reference for existing patterns, not a dependency or a template
that this product must copy. Do not change it as part of work in this repository.
