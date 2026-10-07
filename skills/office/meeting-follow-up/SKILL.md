---
name: meeting-follow-up
description: Use after a meeting: decisions, owners, each one's part.
---

# Meeting Follow-up

Turns a meeting's notes or transcript into what was decided, who does what by when, and a short
message to each person about their part. It works from what was written down, never from what
should have been said.

## When to Use

- "Sum up this meeting", "What did we decide?", "Send everyone their action items"
- Notes pasted into the conversation, a file they point to, or a connected notes service.

## Procedure

1. **Get the record.** The pasted text, a file they name (read it with their leave), or a notes
   page from a connected service. Say when it is partial (a transcript that stops, notes without
   names).
2. **Separate what was said** into: decisions made; proposals not decided; commitments (who, what,
   by when); open questions; risks. Brainstorming is not a decision.
3. **Owners and dates** only as the record says them. A task with no owner is listed as
   "owner not named", not given to someone.
4. **Your person's part** first: what they took on and what they are waiting for.
5. **Each colleague's part**, when they ask for follow-ups: one short message per person with only
   their items, in your person's voice. For colleagues in the office use `ask_colleague` (it is a
   note, not a question: say no answer is needed unless something is wrong); for others,
   `ask_by_link` or a draft they send themselves. Each goes after your person sees it.

## Output

1. **Decided** — one line each.
2. **Actions** — owner · what · by when.
3. **Open** — questions to settle, with who would settle them.
4. **Your part** — what your person does next.

## Pitfalls

- Recording a decision that was only discussed.
- Assigning work to someone who did not take it on.
- Sending the whole notes to everyone. Each person gets their part.

## When they correct it

Keep the shape they want for meeting summaries in this skill (`skill_manage`), and a colleague's
role in recurring meetings in that colleague's note.
