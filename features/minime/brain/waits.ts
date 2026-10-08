// How long the brain waits for one of the app's own tools. The longest is a piece of work in one of
// the person's conversations: up to 30 minutes of Claude Code work, each change waiting on the
// person (hands/sessions.ts), or a copy of the project, 8 minutes of Codex work and then its card's
// ten minutes (hands/codex.ts). Waiting less, the brain would give up and report a failure while the
// work went on, and could still change the person's files after it had said so.
export const TOOL_WAIT_MS = 32 * 60 * 1000;
