---
name: project-status
description: Use when asked where a project stands or what is left.
---

# Project Status

Where a piece of work stands, from what is true now rather than from what you remember: its page
in your notes says where it stood on a date; their records and the project itself say what happened
since.

## When to Use

- "Where are we with the payments API?", "what's left on the launch?", "what did I do on X this
  week?"
- Before handing work to a session, or answering a colleague about that project.

## Procedure

1. **Start from the page.** `note_view projects/<name>` (`note_search` when unsure of the name). Note
   the date of what it says; everything after that date has to be found.
2. **Find what happened since**, newest first:
   - their AI conversations about it: `conversation_search` with the project's name and its main
     words, then `conversation_read` the ones that matter;
   - the project itself: `ask_session` its Claude Code or Codex conversation for recent commits,
     open branches, failing tests, what is half done;
   - connected services when they are connected (GitHub pull requests and issues, Linear or Jira
     tickets): see `work-in-connected-services`;
   - colleagues' requests about it: `office_inbox`.
3. **Say it in a few lines**: where it stands now (with dates), what was done since the page,
   what is open or blocked and on whom, and the next step. Name where each fact came from.
4. **Update the page**: what changed, with today's date, without deleting the history
   (`note_write`).

## Pitfalls

- Answering from the page alone when it is days old.
- Mixing up two projects with similar names: check the folder.
- Guessing a status nobody wrote down. Say it is unknown and how to find out.
