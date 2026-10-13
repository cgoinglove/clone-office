// How long the brain waits for one of the app's own tools. The longest is a piece of work in one of
// the person's conversations: up to 30 minutes of Claude Code work, each change waiting on the
// person (hands/sessions.ts), or a copy of the project, 8 minutes of Codex work and then its card's
// ten minutes (hands/codex.ts). Waiting less, the brain would give up and report a failure while the
// work went on, and could still change the person's files after it had said so.
export const TOOL_WAIT_MS = 32 * 60 * 1000;

/** How often an awake deadline looks at the clock; a look much later than that was sleep. */
const AWAKE_TICK_MS = 5_000;

/**
 * A deadline that counts only the time the computer is awake. A laptop closed in the middle of the
 * clone's work (macOS "Clamshell Sleep") does not use up the time the work was given, as a plain
 * timer would, which fires the moment the computer wakes and kills work that would have gone on.
 * Answers how to stop it.
 */
export function awakeTimeout(ms: number, onTimeout: () => void): () => void {
  let left = ms;
  let last = Date.now();
  // Once, however the interval is stopped: a look already queued never fires it again.
  let over = false;
  const stop = () => {
    over = true;
    clearInterval(timer);
  };
  const timer = setInterval(() => {
    if (over) return;
    const now = Date.now();
    const gap = now - last;
    last = now;
    left -= gap > AWAKE_TICK_MS * 4 ? AWAKE_TICK_MS : gap;
    if (left > 0) return;
    stop();
    onTimeout();
  }, AWAKE_TICK_MS);
  return stop;
}

/** An abort signal after `ms` of the computer awake (awakeTimeout), and how to stop counting. */
export function awakeSignal(ms: number): {
  signal: AbortSignal;
  stop: () => void;
} {
  const controller = new AbortController();
  const stop = awakeTimeout(ms, () =>
    controller.abort(new DOMException("The work timed out.", "TimeoutError")),
  );
  return { signal: controller.signal, stop };
}
