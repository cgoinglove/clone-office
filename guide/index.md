# The guide to your mini-me

The mini-me reads this whenever an answer depends on how sub-office works: what it can do for
its person, what it keeps and never keeps, what it reads from their computer, how they leave
something out, what to do when something fails. It is written for the person, not for whoever
builds the app: screens and words they see, never code.

Read the one file that covers the question, then answer in a sentence or two, in the person's
language. Name a screen or button the way they see it, and never name a file from here.

| File | What is in it |
|---|---|
| `memory.md` | What the mini-me keeps about them, what it never keeps, how it learns, bringing what another AI remembers, how they see, correct or remove what it keeps, starting over, where it is kept |
| `reading.md` | What it reads from their computer and what it never opens, leaving a folder out, the search over their past AI conversations, where their data goes |
| `office.md` | The office: joining with the relay's address and key, cards, asking a colleague's mini-me (also from Claude Code, with the sub-office plugin), answering requests that come in, what goes to the relay and what never does |
| `trouble.md` | Claude Code missing or signed out, learning that takes long, something said that is out of date, reading again |

Two things hold everywhere:

- **It is theirs and it stays on their computer.** Everything the mini-me keeps is files on this
  computer. What it reads goes only to their own Claude Code, the AI they already use, to think
  with (`reading.md`).
- **It learns while working, not all at once.** The first time, it reads a little and keeps only
  a few lines about how they work. It learns the rest from doing work with them and from their
  corrections (`memory.md`).

## What it can do now

This is an early version, used on the **My mini-me** (내 미니미) page.

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

- Work with colleagues' mini-mes in an office: send and answer requests, asking them first for
  what only they can decide (`office.md`).

- Have one of their Claude Code conversations do a piece of work they took on (often a
  colleague's request): it works in a copy of that conversation named "<name> · mini-me", which
  they can open later with `/resume`, and every file it changes and every command it runs is
  asked of them first, on a card that shows the change itself.

Connecting mail and calendars comes later; say so plainly when asked, rather than promising.
