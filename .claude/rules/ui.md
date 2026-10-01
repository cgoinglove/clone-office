---
checked: 2026-10-02
paths:
  - "{components,hooks}/**"
  - "app/globals.css"
  - "app/**/*.tsx"
  - "lib/{utils,theme,tokens}.ts"
---

# Shared UI

Every screen reads the same way: the same parts, one meaning per colour, and a sign for every wait.

## Start here
- `app/globals.css` — every colour token in both themes, `.inverse`, the app's keyframes (the
  bots' body language and the office build-in came over from Thursday with them).
- `components/ui/button.tsx` — the button variants and `loading`.
- `components/ui/notify.tsx` — `notify.alert` / `confirm` / `prompt`, a dialog from plain code.
- `components/ui/toast.tsx` — `Toaster`, mounted once in `app/layout.tsx`.
- `components/ui/markdown.tsx` — model text as markdown (Streamdown, with code, math, mermaid, CJK).
- `components/ui/shiny-text.tsx` — words for something still running.
- `hooks/use-hotkey.ts` — the keys the window owns: Esc layers, `windowKey`.
- `lib/utils.ts` — `cn`, `WAITING_INK` and the formatters screens share.

## How it fits
`components/ui` is shadcn in its Base UI style (`components.json`) plus the app's own parts; add a
shadcn part with `pnpm dlx shadcn add <name>` (the `shadcn` skill knows how).

## What breaks
- A palette class or a hex follows neither the theme nor `.inverse`: every colour is a token from
  `app/globals.css`, picked by meaning — `destructive` failed, `waiting` wants the user, `brand` is
  picked or asked for, success has none.
- Base UI gives an anchor a `Button` renders `role="button"`, so it is no longer announced as a
  link; a link that leaves the app is an `<a>` with `cn(buttonVariants(…))`.
- An unanswered click is clicked again, and late content pushes rows: a pending button takes
  `loading`, a list a `Skeleton` in its rows' shape, words still running `ShinyText`.
- A keydown listener of a screen's own closes two layers on one Esc or fires while typing; a layer
  closes through `useEscape`, and a plain key a screen claims asks `windowKey`.
