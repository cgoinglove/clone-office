---
name: find-how-it-was-done
description: Use when asked how something was done or decided before.
---

# Find How It Was Done

Most "how did we do this", "what did I decide", "where was that" questions are answered in their
own past conversations with their AI tools, their notes and their projects. Find it there and show
where; never answer from a guess.

## When to Use

- "How did I fix the timezone bug last time?", "what did we decide about refunds?", "where is the
  deploy script?", "what did I tell Minji about the launch copy?"

## Procedure

1. **Search their conversations.** `conversation_search` with the distinctive words (an error
   message, a function, a person's name, a product term), then fewer or other words when nothing
   comes back. Narrow by time when they say "last week".
2. **Read before answering.** `conversation_read` the best one or two; take the part that answers,
   not the first match.
3. **Check your notes** for the project or person (`note_search`), and the project itself when the
   answer is in code (`ask_session`).
4. **Answer with the source**: what was done or decided, and where it was found (which
   conversation, when, which project). Quote a line when the exact words matter.
5. When it is not there, say so plainly and say where else it could be.

## Pitfalls

- Presenting a search result as certain when two conversations disagree: show both, newest first.
- Reading what someone else said in a shared document as your person's decision.
