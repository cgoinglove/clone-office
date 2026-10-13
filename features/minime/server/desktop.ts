// Clone Office's desktop app (desktop/) runs this same server as a child of its own process, with
// Electron standing in for Node (ELECTRON_RUN_AS_NODE). Two things follow here. Whatever the app
// starts with its own executable (its tool server, the relay, the folder walk, a browser's server)
// runs as Node only when told so, which a child given an environment of its own must be told again.
// And what only the desktop app can do, the server asks it over the channel Node opens between the
// two: starting with the computer (a login item for the app itself, not the npm package's service)
// and its updates (electron-updater, or a download where the app cannot replace itself).

import { randomUUID } from "node:crypto";

/**
 * What a script of the app's own needs in its environment to run with `process.execPath`: inside
 * the desktop app that is Electron, which runs as Node only when told so; elsewhere, nothing.
 */
export function nodeEnv(): Record<string, string> {
  return typeof process.versions.electron === "string"
    ? { ELECTRON_RUN_AS_NODE: "1" }
    : {};
}

/** True in the desktop app's own server, started with its channel open. */
export function inDesktop(): boolean {
  return (
    process.env.CLONE_OFFICE_DESKTOP === "1" &&
    typeof process.send === "function" &&
    process.connected
  );
}

interface Waiting {
  resolve: (answer: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Pinned: routes can load separate copies of this module, and one listener serves them all. */
const pinned = globalThis as typeof globalThis & {
  __cloneOfficeDesktop?: { waiting: Map<string, Waiting>; listening: boolean };
};

function channel() {
  pinned.__cloneOfficeDesktop ??= { waiting: new Map(), listening: false };
  const state = pinned.__cloneOfficeDesktop;
  if (!state.listening) {
    state.listening = true;
    process.on("message", (message: unknown) => {
      if (!message || typeof message !== "object") return;
      const { cloneOffice, id, answer } = message as {
        cloneOffice?: unknown;
        id?: unknown;
        answer?: unknown;
      };
      if (cloneOffice !== 1 || typeof id !== "string") return;
      const waiting = state.waiting.get(id);
      if (!waiting) return;
      state.waiting.delete(id);
      clearTimeout(waiting.timer);
      waiting.resolve(answer);
    });
  }
  return state;
}

/**
 * Asks the desktop app something only it can do; undefined when this server is not the desktop
 * app's, or it did not answer in time.
 */
export function askDesktop<T>(
  ask: "login-item" | "update" | "restart-to-update",
  body: Record<string, unknown> = {},
  ms = 15_000,
): Promise<T | undefined> {
  if (!inDesktop()) return Promise.resolve(undefined);
  const state = channel();
  const id = randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.waiting.delete(id);
      resolve(undefined);
    }, ms);
    timer.unref();
    state.waiting.set(id, {
      resolve: (answer) => resolve(answer as T),
      timer,
    });
    process.send?.({ cloneOffice: 1, id, ask, ...body }, (error: unknown) => {
      if (!error) return;
      state.waiting.delete(id);
      clearTimeout(timer);
      resolve(undefined);
    });
  });
}

/**
 * The server ends with the desktop app that started it: when its channel closes (the app quit,
 * or stopped without saying so), nothing is left answering for an app that is gone.
 */
export function endWithDesktop(): void {
  if (!inDesktop()) return;
  process.once("disconnect", () => process.exit(0));
}
