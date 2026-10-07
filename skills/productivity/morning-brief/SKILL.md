---
name: morning-brief
description: Use when asked for a morning brief of what waits on them.
---

# Morning Brief

A short start to their day: what waits on them, what came back while they were away, and where
they left their own work. Gathered fresh each time from what is on their computer and in the
office; nothing here is remembered from a past brief.

## When to Use

- "What's waiting for me?", "Brief me", "Where did I leave things?"
- A flow that runs on weekday mornings and asks for the day's start.

Not for a look back over a whole week (`weekly-report`) or the end of a day (`day-wrap`).

## Procedure

1. **What waits on them.** `office_inbox`: questions kept for them, colleagues' requests that need
   their answer, and answers to what they asked. Note who asked and since when.
2. **Where they left their work.** `conversation_search` with `after: "24h"` and `sort: "newest"`
   (on a Monday, `after: "3d"`): the conversations they had with their AI tools. Open the two or
   three that ended mid-way with `conversation_read` and find what was left open: a question with
   no answer, a step they said they would do next, an error not yet fixed.
3. **What runs today.** `flows`: what their clone will do on its own today, and anything that
   failed on its last run.
4. **Their calendar or tasks**, only when a connector for one is there (Google Calendar, Linear,
   Notion, Jira): today's meetings and what is due. Skip this step silently when none is.
5. Write the brief (below). Every line says where it came from in a few words, so they can open it.

## Output

In their language, short enough to read in thirty seconds:

1. **Needs you** — at most three items, most urgent first, each with what they decide.
2. **Came back** — answers to what they asked, one line each.
3. **Where you left off** — at most three open threads, each as the next step.
4. **Today** — meetings, flows, due items, only when there are any.

Leave out a section with nothing in it. Never pad: an empty morning is one line saying so.

## Pitfalls

- Inventing an item. If a record is unclear, say what is unclear instead of guessing.
- Copying old briefs. A brief kept in a conversation is stale the next day; read again.
- Listing everything. Pick what needs them; the rest can wait to be asked for.

## When they correct it

When they say how they want it (shorter, another order, a section they never read), change this
skill with `skill_manage` so tomorrow's brief is already right, and say so in one line.
