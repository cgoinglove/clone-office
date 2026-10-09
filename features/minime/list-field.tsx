"use client";

// A short list (what someone looks after, the tools they work in) kept as its items, never as text
// split on commas, since an item may hold one ("Clone Office (the app, its repository)"). One line
// says what it holds; pressing it opens the items in a popover at the field's width, each taken out
// with its ×, and a new one added below, so the screen around it never grows.

import { ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { splitList } from "./home/use-office";

export function ListField({
  values,
  onChange,
  max,
  maxItem,
  placeholder,
  label,
  className,
  disabled,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  /** How many items, and how long each, as the profile keeps them. */
  max: number;
  maxItem: number;
  placeholder: string;
  /** The field's name inside it, on its left; without it, a caption above names the field. */
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("common.list");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const full = values.length >= max;
  // What is typed may be several at once: "billing, deploys" adds two.
  const add = () => {
    const next = splitList(typed)
      .map((item) => item.slice(0, maxItem))
      .filter((item) => !values.includes(item));
    if (next.length) onChange([...values, ...next].slice(0, max));
    setTyped("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            className={cn(
              "flex h-10 w-full min-w-0 items-center gap-3 rounded-[10px] pr-2.5 pl-3 text-left ring-1 ring-input outline-none ring-inset transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-expanded:ring-ring/60 dark:bg-input/30",
              className,
            )}
          />
        }
      >
        {label && (
          <span className="shrink-0 text-[13px] text-muted-foreground">
            {label}
          </span>
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            !values.length && "text-muted-foreground/80",
          )}
        >
          {values.length ? values.join(" · ") : placeholder}
        </span>
        {values.length > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {values.length}
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) gap-1 p-1.5"
        onKeyDown={(event) => {
          // Enter adds what is typed; it never closes the popover or sends a form behind it.
          if (event.key === "Enter") event.preventDefault();
        }}
      >
        {values.length > 0 && (
          <ul className="flex flex-col">
            {values.map((value) => (
              <li
                key={value}
                className="flex min-w-0 items-start gap-2 rounded-lg py-1.5 pr-1 pl-2.5 hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 py-0.5 text-[13.5px] leading-snug break-keep">
                  {value}
                </span>
                <button
                  type="button"
                  aria-label={t("remove", { item: value })}
                  onClick={() =>
                    onChange(values.filter((item) => item !== value))
                  }
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          value={typed}
          disabled={full}
          maxLength={maxItem * 4}
          aria-label={t("add")}
          placeholder={full ? t("full", { count: max }) : t("add")}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
            else if (event.key === "Backspace" && !typed && values.length)
              onChange(values.slice(0, -1));
          }}
          onBlur={() => typed.trim() && add()}
          className="h-9 rounded-lg bg-muted/50 px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
        />
      </PopoverContent>
    </Popover>
  );
}
