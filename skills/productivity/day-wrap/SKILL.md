---
name: day-wrap
description: Use when they end the day: what got done, what is open.
---

# Day Wrap

The end of their day in a few lines: what they got done, what they decided, what is still open,
and what someone else is waiting for. It helps them stop without losing the thread, and tomorrow's
`morning-brief` starts where it ends.

## When to Use

- "Wrap up my day", "What did I do today?", "Write my daily log"
- A flow that runs in the evening.

## Procedure

1. **What they did.** `conversation_search` with `after: "today"` and `sort: "newest"`, then
   `conversation_read` on the ones that mattered. Read the actual messages; a title is not enough.
2. **What they decided.** From those conversations: choices they made and why, in their words.
   Only what they clearly settled, never a proposal they did not take.
3. **What is open.** A next step they named, a question with no answer, something broken.
4. **Who is waiting.** `office_inbox`: requests to them still open, and their own requests no one
   has answered yet.
5. When they work in git projects and allow reading the folder, their commits today are another
   record of what got done; ask before reading a folder for the first time.

## Output

In their language, as a short log they could paste into a team channel:

- **Done** — one line each, outcomes rather than activity ("checkout errors fixed", not "worked on
  checkout").
- **Decided** — only when something was.
- **Open** — the next step for each, so tomorrow starts there.
- **Waiting on others / others waiting on you** — names and what.

## Pitfalls

- Turning effort into a result. "Looked into X" is not "fixed X".
- Including another person's private matter from a conversation. Leave it out.
- Sending it anywhere. A wrap is for them; posting it to colleagues is a separate request, asked
  first like any other.

## When they correct it

When they reword it or change what belongs in it, change this skill with `skill_manage` so the next
wrap reads the way they write.
