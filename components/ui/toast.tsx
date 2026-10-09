"use client";

// Two kinds of word that something happened, mounted once (`Toaster`, in `app/layout.tsx`):
// - `say`: the outcome of what the person just did (copied, sent, put away with Undo), one line at
//   the bottom centre, drawn in the other theme (`.inverse`), gone after a few seconds; something
//   still under way turns until `settle` gives it its outcome.
// - `notify`: news for the person that they did not cause (a colleague's clone asks them, a
//   colleague answered), a card at the bottom right with who it is from, a line or two of what,
//   and where to go; it stays a little longer and can be closed or swiped away.

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { Check, Loader2, X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

const toast = ToastPrimitive.createToastManager();
const notices = ToastPrimitive.createToastManager();

interface Notice {
  /** Who it is from, as a mark (a clone's face). */
  lead?: React.ReactNode;
  /** Where it goes, and the word for going there. */
  open?: { label: string; run: () => void };
  /** The close button's name, in the screen's language. */
  closeLabel: string;
}

/** News for the person: who (`title`), what (`body`, two lines at most), and where to go. */
function notify(
  title: string,
  body: string,
  notice: Notice & { timeout?: number },
) {
  const { timeout = 9000, ...data } = notice;
  return notices.add({
    title,
    description: body,
    timeout,
    priority: "high",
    data,
  });
}

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

function NoticeList() {
  const { toasts, close } = ToastPrimitive.useToastManager();
  return toasts.map((item) => {
    const notice = item.data as Notice | undefined;
    return (
      <ToastPrimitive.Root
        key={item.id}
        toast={item}
        swipeDirection={["right", "down"]}
        data-slot="notice"
        className={cn(
          "group/notice pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full rounded-[14px] bg-popover text-popover-foreground shadow-[0_0_0_1px_var(--alpha-08),0_16px_40px_-12px_var(--alpha-20)] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "[--gap:0.625rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.05)))]",
          "[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
          "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))))_scale(var(--scale))] [transition:transform_400ms_cubic-bezier(0.22,1,0.36,1),opacity_300ms]",
          "data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
          "data-starting-style:[transform:translateX(110%)] data-ending-style:opacity-0 data-limited:opacity-0",
          "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        )}
      >
        <ToastPrimitive.Content className="flex items-start gap-3 py-3.5 pr-3 pl-4 transition-opacity data-behind:opacity-0 data-expanded:opacity-100">
          {notice?.lead && (
            <span className="mt-0.5 shrink-0">{notice.lead}</span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <ToastPrimitive.Title className="truncate text-[12.5px] text-muted-foreground" />
            <ToastPrimitive.Description className="line-clamp-2 text-[14px] leading-snug font-medium" />
            {notice?.open && (
              <button
                type="button"
                onClick={() => {
                  notice.open?.run();
                  close(item.id);
                }}
                className="mt-2 inline-flex h-7 w-fit items-center rounded-lg bg-secondary px-2.5 text-[13px] font-medium outline-none hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {notice.open.label}
              </button>
            )}
          </div>
          <ToastPrimitive.Close
            aria-label={notice?.closeLabel}
            className="-mt-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Content>
      </ToastPrimitive.Root>
    );
  });
}

function Toaster({ children }: { children?: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider toastManager={toast} limit={3}>
      <ToastPrimitive.Provider toastManager={notices} limit={3}>
        {children}
        <ToastPrimitive.Portal>
          <ToastPrimitive.Viewport
            data-slot="notice-viewport"
            className="pointer-events-none fixed right-4 bottom-6 z-100 w-[min(22.5rem,calc(100vw-2rem))] outline-none"
          >
            <NoticeList />
          </ToastPrimitive.Viewport>
        </ToastPrimitive.Portal>
      </ToastPrimitive.Provider>
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

export { notify, say, sayUndoable, settle, Toaster, toast };
