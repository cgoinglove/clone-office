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
const holds = new Map<
  string,
  { hold: (by: string) => void; release: (by: string) => void }
>();

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
  // One clock, its own: the toast itself never times out, so nothing else can make the step.
  let left = ms;
  let since = Date.now();
  // who holds it now (the pointer on the toast, focus in it, the same on an Undo beside the item):
  // each counted once, however often it says so
  const holders = new Set<string>();
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
  timer = setTimeout(done, left);
  pending.add(done);
  id = toast.add({
    title,
    type: "done",
    timeout: 0,
    actionProps: { children: undoLabel, onClick: () => settle(undo) },
    onClose: done,
  });
  holds.set(id, {
    // waits while it is pointed at or focused (the toast, or an Undo beside what it is about)
    hold: (by: string) => {
      if (settled || holders.has(by)) return;
      holders.add(by);
      if (holders.size > 1) return;
      clearTimeout(timer);
      left = Math.max(0, left - (Date.now() - since));
    },
    // and runs on from where it was, with a little time back to read it again or press Undo
    release: (by: string) => {
      if (settled || !holders.delete(by) || holders.size > 0) return;
      left = Math.max(left, 2500);
      since = Date.now();
      timer = setTimeout(done, left);
    },
  });
  // `undo` takes it back from elsewhere too (an Undo on the row the toast is about), and `hold` and
  // `release` pause its clock from there, as pointing at the toast does
  return {
    id,
    commit: done,
    undo: () => settle(undo),
    hold: (by: string) => holds.get(id)?.hold(by),
    release: (by: string) => holds.get(id)?.release(by),
  };
}

/**
 * Keeps a toast off the news cards only where one actually meets them, measured from what is on
 * screen whenever either list or the window changes: it moves over into the room left of the
 * cards where it fits there, and above them only where it does not (a phone). Nor does it stand
 * over the column at the left: it keeps to the screen's own area where it would.
 */
/** The screen's own area, watched so a toast moves with it as the column folds or unfolds. */
let watched: Element | null = null;
const resized =
  typeof ResizeObserver === "undefined"
    ? undefined
    : new ResizeObserver(() => liftToasts());

function liftToasts() {
  const area = document.querySelector("main");
  if (area !== watched) {
    resized?.disconnect();
    if (area) resized?.observe(area);
    watched = area;
  }
  const boxes = (slot: string) =>
    [...document.querySelectorAll(`[data-slot="${slot}"]`)].map((el) =>
      el.getBoundingClientRect(),
    );
  const cards = boxes("notice");
  const toasts = boxes("toast");
  const wide = window.innerWidth;
  const widest = Math.max(0, ...toasts.map((box) => box.width));
  // Never over the column: where a toast centred on the window would reach into it, it centres
  // on the screen's own area beside it instead, and the room beside the cards starts there too.
  const main = area?.getBoundingClientRect();
  const column = main && main.left > 0 ? Math.round(main.left + 16) : 0;
  let from = wide / 2 - widest / 2 < column - 8 ? column : 0;
  let lift = 0;
  let aside = 0;
  if (cards.length && toasts.length) {
    const left = Math.min(...cards.map((box) => box.left));
    const top = Math.min(...cards.map((box) => box.top));
    // judged by where it would stand centred, never where it was put last
    const centre = from ? (from + wide - 16) / 2 : wide / 2;
    if (centre + widest / 2 > left - 8) {
      // beside the cards where it fits between them and the column, else above them
      if (left - 8 - Math.max(16, column) >= widest) {
        aside = Math.round(wide - left + 8);
        from = column;
      } else lift = Math.round(window.innerHeight - top);
    }
  }
  const root = document.documentElement.style;
  root.setProperty("--notice-stack", `${lift}px`);
  root.setProperty("--toast-aside", `${aside}px`);
  root.setProperty("--toast-from", `${from}px`);
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
  useLayoutEffect(() => {
    void toasts;
    liftToasts();
  }, [toasts]);
  return toasts.map((item) => (
    <ToastPrimitive.Root
      key={item.id}
      toast={item}
      swipeDirection={["down", "right"]}
      data-slot="toast"
      onPointerEnter={() => holds.get(item.id)?.hold("pointer")}
      onPointerLeave={() => holds.get(item.id)?.release("pointer")}
      onFocus={() => holds.get(item.id)?.hold("focus")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          holds.get(item.id)?.release("focus");
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
  // A toast at the bottom centre stands above the cards only where it would meet them.
  useLayoutEffect(() => {
    void toasts;
    liftToasts();
    const settled = setTimeout(liftToasts, 450);
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
    window.addEventListener("resize", liftToasts);
    return () => {
      query.removeEventListener("change", follow);
      window.removeEventListener("resize", liftToasts);
    };
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
          className="pointer-events-none fixed right-[max(1rem,var(--toast-aside,0px))] bottom-[max(1.5rem,calc(var(--notice-lift,0px)+0.75rem),calc(var(--notice-stack,0px)+0.5rem))] left-[max(1rem,var(--toast-from,0px))] z-100 mx-auto h-11 outline-none"
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
