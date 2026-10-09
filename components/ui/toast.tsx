"use client";

// A short word that something happened, at the bottom centre: copied, sent, removed with a way
// back (`sayUndoable`). Drawn in the other theme (`.inverse`), one line, gone after a few seconds; something still
// under way says so with a turning icon until `settle` gives it its outcome. Call `say` from
// anywhere; `Toaster` is mounted once in `app/layout.tsx`.

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { Check, Loader2 } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

const toast = ToastPrimitive.createToastManager();

type Kind = "done" | "busy" | "plain";

/** Says one thing happened. An action ("Undo", "Open") runs once and closes it. */
function say(
  title: string,
  options: {
    kind?: Kind;
    action?: { label: string; run: () => void };
    timeout?: number;
  } = {},
) {
  const { kind = "done", action, timeout } = options;
  return toast.add({
    title,
    type: kind,
    timeout: timeout ?? (kind === "busy" ? 0 : action ? 7000 : 4000),
    ...(action
      ? { actionProps: { children: action.label, onClick: action.run } }
      : {}),
  });
}

/**
 * Something small the person can take back (a memory line, a flow): it is hidden at once and done
 * only when the toast goes without Undo, so leaving the page in between keeps it rather than losing
 * it. `undo` shows it again.
 */
function sayUndoable(
  title: string,
  undoLabel: string,
  { commit, undo }: { commit: () => void; undo: () => void },
) {
  let undone = false;
  return toast.add({
    title,
    type: "done",
    timeout: 6000,
    actionProps: {
      children: undoLabel,
      onClick: () => {
        undone = true;
        undo();
      },
    },
    onClose: () => {
      if (!undone) commit();
    },
  });
}

/** Gives a toast that was under way its outcome. */
function settle(id: string, title: string, kind: Kind = "done") {
  toast.update(id, { title, type: kind, timeout: 4000 });
}

function ToastList() {
  const { toasts, close } = ToastPrimitive.useToastManager();
  return toasts.map((item) => (
    <ToastPrimitive.Root
      key={item.id}
      toast={item}
      swipeDirection={["down", "right"]}
      data-slot="toast"
      className={cn(
        "inverse group/toast pointer-events-auto absolute right-0 bottom-0 left-0 z-[calc(1000-var(--toast-index))] mx-auto w-fit max-w-[min(92vw,32rem)] rounded-xl bg-background text-foreground shadow-[0_12px_32px_-10px_rgb(0_0_0/0.45)] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
        "[--gap:0.5rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.06)))]",
        "[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
        "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))))_scale(var(--scale))] [transition:transform_400ms_cubic-bezier(0.22,1,0.36,1),opacity_300ms]",
        "data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-starting-style:[transform:translateY(150%)] data-ending-style:opacity-0 data-limited:opacity-0",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
      )}
    >
      <ToastPrimitive.Content className="flex h-11 items-center gap-2.5 overflow-hidden pr-4 pl-3.5 text-[13.5px] transition-opacity data-behind:opacity-0 data-expanded:opacity-100">
        {item.type === "busy" ? (
          <Loader2
            aria-hidden
            className="size-4 shrink-0 animate-spin text-foreground/70"
          />
        ) : item.type === "done" ? (
          <Check aria-hidden className="size-4 shrink-0 text-foreground/70" />
        ) : null}
        <ToastPrimitive.Title className="min-w-0 truncate" />
        <ToastPrimitive.Action
          onClick={() => close(item.id)}
          className="-mr-1.5 ml-2 shrink-0 rounded-md px-1.5 py-1 font-semibold text-brand outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  ));
}

function Toaster({ children }: { children?: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider toastManager={toast} limit={3}>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          className="pointer-events-none fixed inset-x-4 bottom-6 z-100 mx-auto h-11 outline-none"
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}

export { say, sayUndoable, settle, Toaster, toast };
