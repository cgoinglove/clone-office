"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * The keys the window owns: the combo that places a call, the plain keys a screen
 * claims, and Esc. Nothing here reaches a dialog — Base UI dismisses one on the
 * document and stops the event there, so it never arrives at the window.
 */

const HOLD = ["ctrl", "alt", "meta"] as const;

const IS_MODIFIER = /^(Control|Alt|Shift|Meta|OS)/;

const EDITABLE = /^(input|textarea|select)$/i;

export const HOTKEY_CAPTURE = { "data-hotkey-capture": "" } as const;

/** A key pressed here is being typed or recorded, not meant for a shortcut. */
export const capturesKeys = (target: EventTarget | null) => {
  const node = target as HTMLElement | null;
  if (!node) return false;
  return Boolean(
    EDITABLE.test(node.tagName) ||
      node.isContentEditable ||
      node.closest?.("[data-hotkey-capture]"),
  );
};

/**
 * Mid-composition the keys belong to the character being made, not to the window
 * or a field's own Enter and Esc. keyCode 229 is for Safari, whose key that
 * confirms a composed character arrives with `isComposing` already false.
 */
export const composing = (event: KeyboardEvent | ReactKeyboardEvent) => {
  const native = "nativeEvent" in event ? event.nativeEvent : event;
  return native.isComposing || native.keyCode === 229;
};

/**
 * Whether `char` was typed, on whatever layout makes it. Some make `@` with Option (a German
 * Mac, Option+L) or AltGr (a German PC, which arrives as Ctrl+Alt), so only Cmd and a Ctrl
 * without Alt say the key was meant for something else.
 */
export const typed = (event: KeyboardEvent, char: string) =>
  event.key === char && !event.metaKey && (event.altKey || !event.ctrlKey);

/**
 * Whether a plain key (no modifier) is the window's to take: not typed into a field,
 * not inside a dialog a screen opened over everything, not already answered.
 */
export const windowKey = (event: KeyboardEvent) =>
  !event.defaultPrevented &&
  !composing(event) &&
  !capturesKeys(event.target) &&
  !(event.target as HTMLElement | null)?.closest?.('[role="dialog"]');

/**
 * Esc goes to the last layer that opened and no further. One listener owns the key
 * for the whole window, so layers never race over which effect registered first —
 * the ringing call, the write line and the room each get their turn in the order
 * they appeared. A field that wants Esc for itself handles it and calls
 * `preventDefault`.
 */
const layers: { current: () => void }[] = [];

const onEscapeKey = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  // Esc during composition drops the character being made, not the layer around it
  if (composing(event)) return;
  const top = layers.at(-1);
  if (!top) return;
  event.preventDefault();
  top.current();
};

export function useEscape(open: boolean, onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;

  useEffect(() => {
    if (!open) return;
    layers.push(latest);
    if (layers.length === 1) window.addEventListener("keydown", onEscapeKey);
    return () => {
      layers.splice(layers.indexOf(latest), 1);
      if (!layers.length) window.removeEventListener("keydown", onEscapeKey);
    };
  }, [open]);
}

export function comboOf(event: {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const { code, ctrlKey, altKey, shiftKey, metaKey } = event;
  if (!code || IS_MODIFIER.test(code)) return null;
  if (!ctrlKey && !altKey && !metaKey) return null;

  const held: string[] = [];
  if (ctrlKey) held.push("ctrl");
  if (altKey) held.push("alt");
  if (shiftKey) held.push("shift");
  if (metaKey) held.push("meta");
  return [...held, code].join("+");
}

export const isCombo = (combo: string) => {
  const parts = combo.split("+");
  const code = parts.at(-1);
  return Boolean(
    code &&
      !IS_MODIFIER.test(code) &&
      parts.slice(0, -1).some((part) => HOLD.includes(part as never)),
  );
};

const SIGN: Record<string, [plain: string, mac: string]> = {
  ctrl: ["Ctrl", "⌃"],
  alt: ["Alt", "⌥"],
  shift: ["Shift", "⇧"],
  meta: ["Meta", "⌘"],
};

/** Keys whose code names a sign rather than a letter. */
const KEY_SIGNS: Record<string, string> = {
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Enter: "↵",
};

const keyLabel = (code: string) =>
  KEY_SIGNS[code] ??
  (code
    .replace(/^(Key|Digit|Numpad)/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2") ||
    code);

export function hotkeyLabel(combo: string, mac = false): string {
  const parts = combo.split("+");
  const code = parts.at(-1) ?? "";
  const held = parts
    .slice(0, -1)
    .map((part) => SIGN[part]?.[mac ? 1 : 0] ?? part);
  const key = keyLabel(code);
  return mac ? [...held, key].join("") : [...held, key].join(" + ");
}

export function useHotkeyLabel(combo: string | null): string | null {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/mac/i.test(navigator.userAgent)), []);
  return combo ? hotkeyLabel(combo, mac) : null;
}

/** A command key as this system writes it: `⌘Z` / `⇧⌘Z` on a Mac, `Ctrl + Z` / `Ctrl + Shift + Z` elsewhere. */
export function useCommandLabel(code: string, shift = false): string {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/mac/i.test(navigator.userAgent)), []);
  const held = mac ? ["shift", "meta"] : ["ctrl", "shift"];
  return hotkeyLabel(
    [...held.filter((part) => shift || part !== "shift"), code].join("+"),
    mac,
  );
}

const onMac = () =>
  typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);

/**
 * The app's command keys as this system writes them (`⌘K`, `⇧⌘N` on a Mac; `Ctrl + K`,
 * `Ctrl + Shift + N` elsewhere), for tips, menus and the list of keys.
 */
export function useCommandKeys() {
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(onMac()), []);
  const label = useCallback(
    (code: string, shift = false) =>
      hotkeyLabel(
        [
          ...(mac ? ["shift", "meta"] : ["ctrl", "shift"]).filter(
            (part) => shift || part !== "shift",
          ),
          code,
        ].join("+"),
        mac,
      ),
    [mac],
  );
  return { mac, label };
}

/**
 * Whether a key press is this system's command key with the key at `code` (⌘ on a Mac, Ctrl
 * elsewhere, by the physical key so any layout reaches it), with Shift only when asked. On a Mac a
 * Ctrl combination stays the field's own (Ctrl+K deletes to the line's end).
 */
export function isCommand(event: KeyboardEvent, code: string, shift = false) {
  const command = onMac()
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return (
    command && !event.altKey && event.shiftKey === shift && event.code === code
  );
}

export function useHotkey({
  enabled,
  combo,
  onPress,
}: {
  enabled: boolean;
  combo: string | null;
  onPress: () => void;
}) {
  const latest = useRef(onPress);
  latest.current = onPress;

  useEffect(() => {
    if (!enabled || !combo) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || capturesKeys(event.target)) return;
      if (comboOf(event) !== combo) return;

      event.preventDefault();
      latest.current();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, combo]);
}
