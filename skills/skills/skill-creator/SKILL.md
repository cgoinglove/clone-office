---
name: skill-creator
description: Use when a way of working should become a skill.
---

# Skill Creator

A skill is how your person wants one kind of task done: the steps, the standards, where they want to
be asked, and the files that help. Write one when a way of working will come back, so the next time
you do it their way without being told. A skill holds a method, never a log of one day.

## When to Use

- They say "from now on do it like this", "remember how I do X", "make this a routine".
- They correct you on the same kind of task twice.
- A task took several steps you will need again.
- They ask you to fix a skill, or it was not used when it should have been.

## First: is it a skill?

- One fact or preference about them → `memory`. A person or a piece of work → a notes page.
  Something at a set time → a flow. A method with steps, standards or files → a skill.
- Look before you write: `skills_list`, then `skill_view` the closest one. Patching the skill that
  covers the task beats a new one (`skill_manage` patch).

## Write it

1. **Name**: lowercase words joined by hyphens, for the kind of task (`weekly-client-update`).
2. **Description**: one sentence of at most 60 characters, the trigger first: "Use when
   <situation>." Only the description is in front of you when a task comes, so it decides whether
   the skill is ever opened: name the situation the way your person would, in their language.
3. **SKILL.md**, short enough to read in a minute, in this order:
   - `# <Title>`, then two or three sentences: what it does, and what it does not;
   - `## When to Use`: the situations, in their words;
   - `## Steps`: one imperative line each, with the decision at each step, the inputs and where they
     are (paths from the work map, services, people's pages), and where to stop and ask them
     (money, promises, other people, anything they said to check);
   - `## Standards`: what done looks like by their measure, in their own words: formats, phrases,
     what to avoid;
   - `## Checks`: what you look at before you hand the result back.
4. **Depth** goes beside it: `references/<topic>.md` for detail, `templates/` for a shape to fill,
   `scripts/` for a script (run only through `bash`, like any command), `assets/` for files it uses.
5. **Category**: an existing one when it fits.

Write it in the language your person uses with you, and keep their own words where they gave them.

## Prove it

Do the task once with the new skill (`skill_view` it, then follow it) on a real case, show the
result, ask what they would change, and patch it. Take out what they did not ask for.

## Never

- Secrets, passwords, keys, or anything private about other people.
- Dates, incident stories or one-off details: a skill holds what stays true.
- A skill that only repeats what a tool's own description already says.
