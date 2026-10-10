"use client";

// Asking once before something big or hard to undo (leaving the office, starting over): a small
// dialog with what will happen in one sentence, a quiet way out and the one button that does it,
// red only when it removes something. Both buttons are the same shape. Smaller things that can be
// brought back are done at once with an Undo in a toast instead (`say`).

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
}) {
  return (
    // While the step runs it stays: no Cancel, Esc or click outside leaves it half done unseen.
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        data-confirm
        className="sm:max-w-[26rem]"
        showCloseButton={false}
        above
      >
        <DialogHeader className="pr-0">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
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
