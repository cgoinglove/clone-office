import { BotMotion } from "@/features/office/bot-shape";
import { cn } from "@/lib/utils";

/**
 * The app's mark: your own clone as the office draws it (the ink blob with two eyes, at rest), so
 * the logo and the one at your desk are the same face. Computed once from the shape itself, and
 * drawn in the text colour so it turns over with the theme. `app/icon.svg` is the same drawing.
 */
const REST = new BotMotion("b113", "idle", 0).frame(0, 1, true);

export const APP_NAME = "Clone Office";

export function LogoMark({
  className,
  label,
}: {
  className?: string;
  /** What a screen reader hears when the mark stands alone. */
  label?: string;
}) {
  return (
    <svg
      viewBox="14 12 212 220"
      className={cn("size-6 shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={REST.body} fill="currentColor" />
      <path d={REST.eyes[0]} className="fill-background" />
      <path d={REST.eyes[1]} className="fill-background" />
    </svg>
  );
}

/** The mark and the name, as the app signs its screens. */
export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]",
        className,
      )}
    >
      <LogoMark className={markClassName} />
      {APP_NAME}
    </span>
  );
}
