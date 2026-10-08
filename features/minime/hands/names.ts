// The names of the clone's hands that its rules, cards and modes speak of, with no imports, so the
// page draws a card for them as the server decides on them (hands/shell.ts, hands/browser.ts).

/** The clone's own shell: "from now on" for it covers commands in the sandbox only. */
export const BASH = "mcp__minime__bash";

export const BROWSER = "browser";

/** The tools that only look: a page reached and read, never changed by them. */
export const BROWSER_LOOKS = new Set([
  "browser_navigate",
  "browser_navigate_back",
  "browser_snapshot",
  "browser_take_screenshot",
  "browser_find",
  "browser_console_messages",
  "browser_network_requests",
  "browser_network_request",
  "browser_wait_for",
  "browser_tabs",
  "browser_resize",
  "browser_close",
]);

/** Asked every time, whatever was let before: what can send a file out or run code in a page. */
export const BROWSER_ALWAYS_ASKED = new Set([
  "browser_file_upload",
  "browser_evaluate",
]);

/** Never offered: code run in the browser's own process, outside any page, can do anything. */
export const BROWSER_NEVER = new Set(["browser_run_code_unsafe"]);

/** The rule that lets the clone look at pages in its browser without asking. */
export const BROWSER_READ_RULE = "browser:read";

/** A browser tool's name as a session gives it, or undefined for another tool. */
export function browserTool(tool: string): string | undefined {
  const found = /^mcp__browser__(.+)$/.exec(tool);
  return found?.[1];
}

/** The tools `browser:read` stands for, as a session's rules name them. */
export function browserReadRules(): string[] {
  return [...BROWSER_LOOKS].map((name) => `mcp__${BROWSER}__${name}`);
}

/**
 * What "on its own" lets the browser do without asking, as a session's rules name them: looking,
 * and acting on a page, but never uploading a file or running code there.
 */
export function browserActRules(): string[] {
  return [
    ...BROWSER_LOOKS,
    "browser_click",
    "browser_type",
    "browser_fill_form",
    "browser_select_option",
    "browser_press_key",
    "browser_hover",
    "browser_drag",
    "browser_drop",
    "browser_handle_dialog",
    "browser_emulate_media",
    "browser_install",
  ].map((name) => `mcp__${BROWSER}__${name}`);
}
