"use client";

// Asking once before something big or hard to undo (leaving the office, starting over): a small
// dialog with what will happen in one sentence, a quiet way out and the one button that does it,
// red only when it removes something. Both buttons are the same shape. Smaller things that can be
// brought back are done at once with an Undo in a toast instead (`say`). A step that fails says
// why inside the dialog, which stays open to try again or step back.

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Whether a confirm is open: it waits for its answer, and no key opens anything over or under it. */
export const confirmOpen = () =>
  typeof document !== "undefined" &&
  Boolean(document.querySelector("[data-confirm]"));

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  cancel,
  onConfirm,
  destructive = false,
  busy = false,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirm: ReactNode;
  cancel: ReactNode;
  onConfirm: () => void;
  destructive?: boolean;
  busy?: boolean;
  /** Why the step failed, shown in the dialog itself. */
  error?: ReactNode;
}) {
  return (
    // While the step runs it stays: no Cancel, Esc or click outside leaves it half done unseen.
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        data-confirm
        role="alertdialog"
        className="sm:max-w-[26rem]"
        showCloseButton={false}
        above
      >
        <DialogHeader className="pr-0">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="pt-2">
          <DialogClose
            disabled={busy}
            render={<Button variant="ghost" size="lg" />}
          >
            {cancel}
          </DialogClose>
          <Button
            size="lg"
            variant={destructive ? "destructive" : "default"}
            loading={busy}
            onClick={onConfirm}
          >
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
