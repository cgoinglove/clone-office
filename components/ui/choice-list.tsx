"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One option of a `ChoiceList`. */
export interface Choice<T extends string> {
  value: T;
  title: ReactNode;
  /** What picking it means, under the title. */
  body?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** A word beside the title, such as "Default". */
  tag?: ReactNode;
  disabled?: boolean;
}

/**
 * A choice between a few options, each with what it means under its name, so the difference is read
 * before it is picked. Every option is a card in the same hairline; the one picked is ringed and its
 * dot filled in the brand colour, as everything picked is (`.claude/rules/ui.md`), with no fill or
 * shadow of its own. The keyboard is a radio group's (Base UI, WAI-ARIA APG): Tab enters at the one
 * picked and the arrows move the pick.
 */
export function ChoiceList<T extends string>({
  value,
  onChange,
  options,
  className,
  dense,
  ...rest
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly Choice<T>[];
  className?: string;
  /** Tighter cards, for a step that must fit a short window with others above it. */
  dense?: boolean;
  "aria-label": string;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as T)}
      aria-label={rest["aria-label"]}
      className={cn("flex flex-col gap-1.5", className)}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "group/choice flex w-full items-start gap-3 rounded-[10px] px-3.5 text-left ring-1 ring-foreground/10 outline-none ring-inset transition-[box-shadow,background-color] hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 data-checked:ring-[1.5px] data-checked:ring-brand data-checked:hover:bg-transparent data-disabled:pointer-events-none data-disabled:opacity-50",
            dense ? "py-2.5" : "py-3",
          )}
        >
          <span
            aria-hidden
            className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ring-[1.5px] ring-foreground/25 ring-inset transition-colors group-data-checked/choice:bg-brand group-data-checked/choice:ring-0"
          >
            <span className="size-1.5 rounded-full bg-brand-foreground opacity-0 group-data-checked/choice:opacity-100" />
          </span>
          {option.icon && (
            <option.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2 text-sm leading-5 font-medium">
              <span className="min-w-0 truncate">{option.title}</span>
              {option.tag && (
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] leading-none font-normal text-muted-foreground">
                  {option.tag}
                </span>
              )}
            </span>
            {option.body && (
              <span
                className={cn(
                  "text-[13px] text-muted-foreground",
                  dense ? "leading-snug" : "leading-relaxed",
                )}
              >
                {option.body}
              </span>
            )}
          </span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
