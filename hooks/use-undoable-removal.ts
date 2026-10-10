"use client";

import { useEffect, useRef, useState } from "react";
import { sayUndoable } from "@/components/ui/toast";

/**
 * Removing from a list with Undo, as the app does it for small things that can come back (a memory
 * line, a flow): the item is hidden at once, with the list's count and order following, and is
 * removed when its toast goes without Undo, or when the list itself goes; it shows again when the
 * removal fails or is undone.
 */
export function useUndoableRemoval(undoLabel: string) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(new Map<string, { commit: () => void }>());
  useEffect(() => {
    const all = pending.current;
    return () => {
      for (const removal of all.values()) removal.commit();
    };
  }, []);
  const show = (key: string) =>
    setHidden((all) => {
      const next = new Set(all);
      next.delete(key);
      return next;
    });
  /**
   * Hides `key` and says `message` with Undo. `commit` removes it for good and says whether it
   * did; `undo` puts back anything done meanwhile (a flow paused while it waits).
   */
  const remove = (
    key: string,
    message: string,
    steps: { commit: () => Promise<boolean>; undo?: () => void },
  ) => {
    setHidden((all) => new Set(all).add(key));
    pending.current.set(
      key,
      sayUndoable(message, undoLabel, {
        commit: () => {
          pending.current.delete(key);
          void steps.commit().then((done) => {
            if (!done) show(key);
          });
        },
        undo: () => {
          pending.current.delete(key);
          steps.undo?.();
          show(key);
        },
      }),
    );
  };
  return { hidden, remove };
}
