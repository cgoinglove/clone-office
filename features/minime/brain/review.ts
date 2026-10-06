// The learning loop: after the mini-me and its person finish something, a copy of that session
// looks back once and keeps what is worth keeping. The original session is never changed, and
// the copy starts from Claude Code's cache of it, so the look back is cheap.
// The prompt follows Hermes Agent's combined memory and skill review (agent/background_review.py
// at 71574220, MIT, Nous Research): two memory stores, class-level skills that grow by patching
// before anything new is made, one lesson in one place, and "Nothing to save." when nothing
// stands out. Notes pages for people and ongoing work follow the LLM Wiki page rules.

import { readPreferences } from "../server/preferences.ts";
import {
  runSession,
  type SessionEvent,
  type SessionResult,
} from "./session.ts";

const ROUTING = `TWO distinct stores — pick the right one for each fact:
  • USER.md (memory tool, target='user'): who your person is — role, what they own, preferences, how they decide and where they stop, how they talk, and what they expect of you.
  • MEMORY.md (memory tool, target='memory'): durable conventions of their work written nowhere else, and where to find what cannot be searched for. Not facts you can look up again.

One fact goes to ONE store, never both — writing it to both bloats both files until they hit their size limits and crowds out the facts that matter; misrouting it puts it where the next session won't look.`;

const NOTES = `**Notes** hold what you know about one person your person works with (people/), one piece of ongoing work — a project, client, case, product (projects/) — or one recurring subject (topics/), a page each, opened only when needed. Make a page only when someone or something matters to their work: it came up more than once, or it is central to this task. Search first (note_search); when a page exists, view it and patch it. Keep a page to what stays true: role, what they care about, how to deal with them, what the work is for and standing decisions — never status, progress, plans or dates.`;

const DURABLE = `What you keep must stay true without anyone updating it. A saved fact that changes later (a project's status, a plan, a date, a version, where a file lives, what they are doing now) becomes a wrong fact you will repeat with confidence. Do not keep anything you could find again on their computer — their files, folders, projects, conversations and history are there to look up when needed. Keep what cannot be looked up and will hold: how they work, decide and talk, corrections they gave you, the way they want a kind of task done.`;

const LESSONS = `What a skill IS: the instructions for doing a class of task the way THIS person wants it — the steps in order, the tools that work, how the result should look, and the pitfalls that cost time. A future session should follow it and produce what they want on the first try.
  • Procedure first. Lessons and pitfalls attach to the step they affect, each an imperative rule plus one clause of why.
  • No dates, ticket numbers or quoted chat as content — the rule must stand without the incident behind it. Keep a short quote only when it is the clearest statement of the rule.
  • The same lesson learned twice is ONE rule: search the skill (and its references/) and strengthen the rule rather than adding a second copy.
  • Always-on rules (standing preferences, checks that apply every time) live in SKILL.md itself. references/<topic>.md is for depth needed only sometimes — a decision table, a recipe, a format — named by topic, never per session; extend an existing file before adding one. templates/ holds starter files to copy and fill; scripts/ holds steps to run as they are.
  • Fix the skill in place when it is wrong; do not append "UPDATE: actually…".
  • Write the description and body in the language your person uses with you, and keep their own words for things (menu names, labels, phrases) instead of translating them.`;

const DO_NOT_CAPTURE = `Do NOT capture:
  • One-off task narratives: a single request is not a class of work.
  • Environment failures the person can fix (a missing app, an expired login) as if they were rules, or claims that a tool "does not work".
  • Methods that did not actually work in this session — never dress up dead ends as a workflow.
  • Secrets, credentials, health details, or private details about other people.`;

export const REVIEW_PROMPT = `Review the conversation above and update what you keep: memory, skills and notes. Be active — most sessions that involved real work teach something, even if small; but nothing is better than noise.

**Memory** has ${ROUTING}

**Skills** are how to do a class of task for this person. Target shape of the library: CLASS-LEVEL skills, each a SKILL.md of always-on rules with a small references/ set of topical depth — not narrow one-session skills, and not one file per session.

${LESSONS}

Signals that warrant a skill update (any one is enough):
  • Your person corrected your style, format, length, tone or approach ("not like that", "shorter", "always…", "don't…"). A correction about how a task should be done belongs in the skill for that task.
  • A non-trivial way of doing their work emerged that a future session should repeat.
  • A skill you loaded turned out wrong, missing a step, or outdated.

Preference order for skills — pick the earliest that fits:
  1. Patch a skill that was loaded in this conversation (view it again with skill_view in this review first).
  2. Patch an existing skill that covers this class of task (skills_list, then skill_view).
  3. Add or extend a supporting file under that skill with write_file (references/<topic>.md, templates/, scripts/), and add a one-line pointer to it in SKILL.md.
  4. Only when nothing covers the class, create a new skill named at the class level ("weekly-report", "client-reply"), never after today's one-off; put it in an existing category when one fits.

Where a lesson lives: in exactly ONE place. The skill that governs the task when one exists; USER.md only for preferences that cut across all tasks; a notes page for what is about one person or one piece of work — including how that one person likes things done (a client who wants tables goes on the client's page, not into the skill every task follows); never two of them. If a memory entry already says what now belongs in a skill or a page, move it there and remove the entry.

Read before write is enforced: view a skill (skill_view), a skill's file (skill_view with file_path) or a page (note_view) in this review before changing it. Skills your person made or pinned are theirs — your writes to them will be refused; say in your reply what should change instead.

${NOTES}

${DO_NOT_CAPTURE}

${DURABLE}

Act on whatever has real signal. If genuinely nothing stands out, say 'Nothing to save.' and stop.`;

/**
 * Look back over a finished session. Pass the system prompt it ran with (SessionResult
 * .systemPrompt) so the copy starts from that session's prompt cache, as Hermes keeps the
 * review's prefix identical to its parent's.
 */
export async function reviewSession(
  sessionId: string,
  onEvent?: (event: SessionEvent) => void,
  systemPrompt?: string,
): Promise<SessionResult> {
  // The person can turn the learning after each conversation off (Settings › Preferences).
  if (!(await readPreferences()).review)
    return { ok: false, text: "", error: "review-off" };
  return runSession({
    resume: sessionId,
    fork: true,
    prompt: REVIEW_PROMPT,
    actor: "review",
    systemPrompt,
    maxTurns: 12,
    purpose: "review",
    onEvent,
  });
}
