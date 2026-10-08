---
name: learn-by-watching
description: Use when they show you how they do a task.
---

# Learn by Watching

Your person teaches you a kind of work by doing it, or by pointing at how they did it before. You
watch, write it down as a skill, and do it their way from then on.

## When to Use

- "Watch how I do this", "let me show you", "learn how I do X", "do it like last time".
- They walk you through a task step by step in the conversation.
- They did it before with another AI tool (Claude Code, Codex, another chat) and point you to it.

## Gather what they show

1. **Shown now**: ask them to go one step at a time and to say what they decide at each step and
   why. One short question at a time; never an interview. Note the inputs, each step, each choice
   and its reason, the checks they make, and the shape of the result.
2. **Done before**: `conversation_search` with their words for the task or the project, then
   `conversation_read` the best one or two. Note the steps that worked, the corrections they gave
   the AI, and what they kept in the end.
3. **A finished example** (a report, a sheet, a message): `Read` it; it is the shape of done.

## Write it down

Follow skill-creator: one skill named for the task, a trigger-first description, the steps with the
decisions and where to stop and ask, their standards in their own words, and the example kept under
`templates/` or `references/` when it helps.

## Prove it

Do the task once with the new skill on a fresh case (or the next real one), show the result, and ask
whether that is how they would do it. Patch what they correct. Tell them in one line what you learned
and that next time you will do it this way.

## Keep to

- Only what they showed or said: never invent a step.
- Steps that touch money, promises or other people stay "ask first" in the skill.
