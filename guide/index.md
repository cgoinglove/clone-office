# The guide to your clone

The clone reads this whenever an answer depends on how sub-office works: what it can do for
its person, what it keeps and never keeps, what it reads from their computer, how they leave
something out, what to do when something fails. It is written for the person, not for whoever
builds the app: screens and words they see, never code.

Read the one file that covers the question, then answer in a sentence or two, in the person's
language. Name a screen or button the way they see it, and never name a file from here.

| File | What is in it |
|---|---|
| `memory.md` | What the clone keeps about them, what it never keeps, how it learns, bringing what another AI remembers, how they see, correct or remove what it keeps, starting over, where it is kept |
| `reading.md` | What it reads from their computer and what it never opens, leaving a folder out, the search over their past AI conversations, where their data goes |
| `office.md` | The office: opening one on their computer or joining by an invite link, cards, asking a colleague's clone (also from Claude Code, with the sub-office plugin), answering requests that come in, what goes to the relay and what never does, files between clones |
| `phone.md` | Talking with the clone from Discord, Telegram or Slack on their phone: setting up their own bot, letting their phone in by its code, questions as buttons, what comes to the phone by itself while they are away from the page, when it does not answer |
| `brain.md` | What the clone thinks with: their own Claude Code, or a model with their key (Claude, OpenAI, Gemini, OpenRouter) or on their computer (Ollama, LM Studio); keys, cost, changing it |
| `connectors.md` | Connectors: the services the clone works in (Notion, Linear, Jira and Confluence, GitHub, Google), connecting each, registering Google's client once for the team, what it asks before using them, disconnecting, when it does not work |
| `flows.md` | Flows: what the clone does on its own at set times, how they make one by asking, when it runs and what a run may do, where its answers go |
| `trouble.md` | Claude Code missing or signed out, learning that takes long, something said that is out of date, reading again |

Two things hold everywhere:

- **It is theirs and it stays on their computer.** Everything the clone keeps is files on this
  computer. What it reads goes only to the AI it thinks with, the one they picked under **Brain**
  (두뇌): their own Claude Code, or a model with their key (`reading.md`, `brain.md`).
- **It learns while working, not all at once.** The first time, it reads a little and keeps only
  a few lines about how they work. It learns the rest from doing work with them and from their
  corrections (`memory.md`).

## The first time

Opened the first time, the app shows **Get started** (시작하기): five short steps, each of which
can be passed over. What a clone is; what it thinks with (`brain.md`); letting it learn how they
work, after leaving out any folder it should never read (`reading.md`, `memory.md`); bringing it to
their team or keeping it to themselves for now (`office.md`); then their clone's page. **Set up
later** (나중에 하기) goes straight to that page. The screen's language is at the top of each page.

## What it can do now

This is an early version, used on the **My clone** (내 클론) page.

- Learn how they work from their AI tools' records and from what their usual AI (ChatGPT, Claude,
  Gemini…) remembers about them, and show what it keeps exactly as saved, each line correctable or
  removable.
- Suggest three things to do together, chosen from what they are doing lately, and do one with
  them in the conversation.
- Keep every conversation with them: **New conversation** (새 대화) starts one, **Past
  conversations** (이전 대화) opens an earlier one where it left off. A long conversation is
  carried on from a summary, so it never fills up.
- Find and read their past conversations with their AI tools on this computer: "what did I do
  today", "where did we leave the login bug", "how did I handle that last time".
- Remember how they want a kind of task done once they say so, and do it that way next time.
- Read their files and the web when they let it, asking first with a card; ask them with a card
  when only they can decide (`memory.md`, "What it does alone, and what it asks first").
- Ask one of their own Claude Code conversations about its project ("ask my payments-api
  conversation how /orders pages"), by the name they gave it with `/rename`, after a card the
  first time. A copy answers, reading files only, so the conversation itself is never changed.

- Work with colleagues' clones in an office: send and answer requests, asking them first for
  what only they can decide; tell them what is waiting for them ("what is waiting for me?"); show
  how like them its answers are (**Like you**); carry their **How to work with me** lines (ME.md)
  on their card; ask someone who has no clone by a link they send themselves; and bring a
  colleague in with one invite link (`office.md`).
- Have one of their Claude Code conversations do a piece of work they took on (often a
  colleague's request): it works in a copy of that conversation named "<name> · clone", which
  they can open later with `/resume`, and every file it changes and every command it runs is
  asked of them first, on a card that shows the change itself.
- Do something on its own at set times, again and again or once later ("every weekday at 9, sum
  up what is waiting for me"), or handle a kind of colleague's request their way when it comes
  in, when they ask for it, after a card (`flows.md`).
- Keep a folder out of everything it reads and searches when they say so, after a card
  (`reading.md`).

- Work in the services they connected under **Connectors** (도구 연결): Notion, Linear, Jira and
  Confluence, GitHub, and Google's Gmail, Calendar, Drive, Docs and Sheets, through each one's own
  MCP server, asking first for each kind of action (`connectors.md`).
