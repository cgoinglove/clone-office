---
name: weekly-report
description: Use when asked for a weekly report in their own format.
---

# Weekly Report

A report of their week, in the form they already use. The work is finding what happened and
writing it the way they would; the first report teaches the format, and every later one follows it.

## When to Use

- "Write my weekly report", "What did I do this week?", "Draft the update for my manager"
- A flow on Friday afternoons.

## Procedure

1. **Find their format first.** Look in `references/format.md` of this skill. When it is not there,
   `conversation_search` for a report they wrote before ("weekly", "주간", "週報", "update", in
   their language) and copy its sections, length and tone. When none is found, use the default below
   and ask them once at the end whether to keep it.
2. **Gather the week.** `conversation_search` with `after: "7d"` and `sort: "newest"`, a few pages
   if needed (`before` to go further back); `conversation_read` the ones that carried real work.
   `office_inbox` with `days: 7` for what they asked and were asked. A connected task tracker
   (Linear, Jira, Notion) for what closed, when one is there.
3. **Sort it.** Done, in progress (with how far), blocked (on whom or what), next week. Merge many
   small steps into the outcome they served.
4. **Write it** in their format and language. Numbers and names exactly as the records say.
5. **Point to the sources** at the end, in a few words each, so they can check a line.

## Output

Default, when they have no format of their own:

- **Done this week**
- **In progress**
- **Blocked / needs a decision**
- **Next week**

Each item one line, outcome first.

## Pitfalls

- Inventing progress, dates or numbers. If the records do not say, leave it out or mark it unsure.
- Including private or personal matters that surfaced in conversations.
- Overwriting their format with the default once they have one.

## When they correct it

Save their format as `references/format.md` in this skill (`skill_manage`, `write_file`) the first
time, and change it whenever they correct a report, so the next one needs no edits.
