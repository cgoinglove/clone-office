"use client";

// Two kinds of word that something happened, mounted once (`Toaster`, in `app/layout.tsx`):
// - `say`: the outcome of what the person just did (copied, sent, put away with Undo), one line at
//   the bottom centre, drawn in the other theme (`.inverse`), gone after a few seconds.
// - `notify`: news for the person that they did not cause (a colleague's clone asks them, a
//   colleague answered), a card at the bottom right with who it is from, a line or two of what,
//   and where to go; it stays a little longer and can be closed or swiped away. Several show one
//   above the other, never one hiding another.
// Both stand above a box a screen keeps at its bottom (the chat's, the office's), which says how
// tall it is with `liftNotices`.

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
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

/** Says one thing happened. An action ("Undo", "Open") runs once and closes it. */
function say(
  title: string,
  options: { action?: { label: string; run: () => void } } = {},
) {
  const { action } = options;
  return toast.add({
    title,
    type: "done",
    timeout: action ? 7000 : 4000,
    ...(action
      ? { actionProps: { children: action.label, onClick: action.run } }
      : {}),
  });
}

/** Removals waiting out their Undo, done at once if the page goes (a reload, a closed tab). */
const pending = new Set<() => void>();
if (typeof window !== "undefined")
  window.addEventListener("pagehide", () => {
    for (const done of [...pending]) done();
  });

/** The clocks of toasts with an Undo, held while the person points at or focuses them. */
const holds = new Map<string, { hold: () => void; release: () => void }>();

/**
 * Something small the person can take back (a memory line, a flow): it is hidden at once and done
 * after `ms` by a clock of its own (a toast waits while the window is away, a removal does not;
 * it waits only while the person points at it or focuses it, reaching for Undo), or as soon as the
 * screen holding it goes (`commit` from the handle) or the page does. Undo, pressed in time, shows
 * it again and nothing is done.
 */
function sayUndoable(
  title: string,
  undoLabel: string,
  { commit, undo }: { commit: () => void; undo: () => void },
  ms = 6000,
) {
  let settled = false;
  let id = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = (run: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    pending.delete(done);
    holds.delete(id);
    if (id) toast.close(id);
    run();
  };
  const done = () => settle(commit);
  timer = setTimeout(done, ms);
  pending.add(done);
  id = toast.add({
    title,
    type: "done",
    timeout: ms,
    actionProps: { children: undoLabel, onClick: () => settle(undo) },
    onClose: done,
  });
  holds.set(id, {
    hold: () => clearTimeout(timer),
    // a little time back once the pointer or focus leaves, to read it again or press Undo
    release: () => {
      clearTimeout(timer);
      if (!settled) timer = setTimeout(done, 2500);
    },
  });
  // `undo` takes it back from elsewhere too (an Undo on the row the toast is about), and `hold` and
  // `release` pause its clock from there, as pointing at the toast does
  return {
    id,
    commit: done,
    undo: () => settle(undo),
    hold: () => holds.get(id)?.hold(),
    release: () => holds.get(id)?.release(),
  };
}

/** How toasts and notices stack, move in and leave; each list sets its own gap and entry. */
const STACK = [
  "pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
  "[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
  "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))))_scale(var(--scale))] [transition:transform_400ms_cubic-bezier(0.22,1,0.36,1),opacity_300ms]",
  "data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
  "data-ending-style:opacity-0 data-limited:opacity-0",
  "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
];

function ToastList() {
  const { toasts, close } = ToastPrimitive.useToastManager();
  return toasts.map((item) => (
    <ToastPrimitive.Root
      key={item.id}
      toast={item}
      swipeDirection={["down", "right"]}
      data-slot="toast"
      onPointerEnter={() => holds.get(item.id)?.hold()}
      onPointerLeave={() => holds.get(item.id)?.release()}
      onFocus={() => holds.get(item.id)?.hold()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          holds.get(item.id)?.release();
      }}
      className={cn(
        STACK,
        "inverse left-0 mx-auto w-fit max-w-[min(92vw,32rem)] rounded-xl bg-background text-foreground shadow-[0_12px_32px_-10px_var(--shade)]",
        "[--gap:0.5rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.06)))]",
        "data-starting-style:[transform:translateY(150%)]",
      )}
    >
      <ToastPrimitive.Content className="flex h-11 items-center gap-2.5 overflow-hidden pr-4 pl-3.5 text-[13.5px] transition-opacity data-behind:opacity-0 data-expanded:opacity-100">
        <Check aria-hidden className="size-4 shrink-0 text-foreground/70" />
        <ToastPrimitive.Title className="min-w-0 truncate" />
        <ToastPrimitive.Action
          onClick={() => close(item.id)}
          className="-mr-1.5 ml-2 shrink-0 rounded-md px-1.5 py-1 font-semibold text-brand outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
        />
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  ));
}

function NoticeList() {
  const { toasts, close } = ToastPrimitive.useToastManager();
  // How high the cards stand, so a toast at the bottom centre stands above them instead of on them
  // where the window is too narrow to keep them apart.
  useLayoutEffect(() => {
    void toasts;
    const measure = () => {
      let top = window.innerHeight;
      let left = window.innerWidth;
      for (const card of document.querySelectorAll('[data-slot="notice"]')) {
        const box = card.getBoundingClientRect();
        top = Math.min(top, box.top);
        left = Math.min(left, box.left);
      }
      // only where the widest toast, centred, would reach the cards: a wide window keeps both low
      const reach =
        window.innerWidth / 2 + Math.min(window.innerWidth * 0.46, 256);
      document.documentElement.style.setProperty(
        "--notice-stack",
        `${reach > left - 8 ? Math.round(window.innerHeight - top) : 0}px`,
      );
    };
    measure();
    const settled = setTimeout(measure, 450);
    return () => clearTimeout(settled);
  }, [toasts]);
  return toasts.map((item) => {
    const notice = item.data as Notice | undefined;
    return (
      <ToastPrimitive.Root
        key={item.id}
        toast={item}
        swipeDirection={["right", "down"]}
        data-slot="notice"
        className={cn(
          STACK,
          "w-full rounded-[14px] bg-popover text-popover-foreground shadow-[0_0_0_1px_var(--alpha-08),0_16px_40px_-12px_var(--alpha-20)]",
          // always laid out one above the other, as the stack lays them out when pointed at
          "[--gap:0.625rem] [transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
          "data-starting-style:[transform:translateX(110%)]",
        )}
      >
        <ToastPrimitive.Content className="flex items-start gap-3 py-3.5 pr-3 pl-4">
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
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                  "mt-2 w-fit",
                )}
              >
                {notice.open.label}
              </button>
            )}
          </div>
          <Tip label={notice?.closeLabel ?? ""}>
            <ToastPrimitive.Close
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "-mt-1 text-muted-foreground",
              )}
            >
              <X className="size-3.5" />
            </ToastPrimitive.Close>
          </Tip>
        </ToastPrimitive.Content>
      </ToastPrimitive.Root>
    );
  });
}

function Toaster() {
  const t = useTranslations("common");
  // on a phone one card at a time, the next waiting behind it, so news never buries the screen
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const follow = () => setPhone(query.matches);
    follow();
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);
  return (
    <ToastPrimitive.Provider toastManager={toast} limit={3}>
      <ToastPrimitive.Provider toastManager={notices} limit={phone ? 1 : 3}>
        <ToastPrimitive.Portal>
          <ToastPrimitive.Viewport
            data-slot="notice-viewport"
            aria-label={t("newsLabel")}
            className="pointer-events-none fixed right-4 bottom-[max(1.5rem,calc(var(--notice-lift,0px)+0.75rem))] z-100 w-[min(22.5rem,calc(100vw-2rem))] outline-none"
          >
            <NoticeList />
          </ToastPrimitive.Viewport>
        </ToastPrimitive.Portal>
      </ToastPrimitive.Provider>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          aria-label={t("noticesLabel")}
          // above the box at the bottom, and above any news card standing there
          className="pointer-events-none fixed inset-x-4 bottom-[max(1.5rem,calc(var(--notice-lift,0px)+0.75rem),calc(var(--notice-stack,0px)+0.5rem))] z-100 mx-auto h-11 outline-none"
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}

/**
 * Keeps toasts and news above a box at the bottom of the screen (the chat box, the office's ask
 * box) while it is there, however tall it grows. Returns what undoes it.
 */
function liftNotices(box: Element | null): () => void {
  if (!box) return () => {};
  const root = document.documentElement;
  const measure = () => {
    const { top, height } = box.getBoundingClientRect();
    // a box not drawn (hidden for now) lifts nothing
    const lift = height ? Math.max(0, Math.round(window.innerHeight - top)) : 0;
    root.style.setProperty("--notice-lift", `${lift}px`);
  };
  const seen = new ResizeObserver(measure);
  seen.observe(box);
  window.addEventListener("resize", measure);
  measure();
  return () => {
    seen.disconnect();
    window.removeEventListener("resize", measure);
    root.style.removeProperty("--notice-lift");
  };
}

export { liftNotices, notify, say, sayUndoable, Toaster };
