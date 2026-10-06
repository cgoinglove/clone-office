---
checked: 2026-10-07
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
  bots' body language came over from Thursday with them). The office floor keeps its own in
  `features/office/room/room.css`, mapped onto these tokens.
- `components/ui/button.tsx` — the button variants and `loading`.
- `components/ui/notify.tsx` — `notify.alert` / `confirm` / `prompt`, a dialog from plain code.
- `components/ui/toast.tsx` — `Toaster`, mounted once in `app/layout.tsx`.
- `components/ui/markdown.tsx` — model text as markdown (Streamdown, with code, math, mermaid, CJK).
- `components/ui/shiny-text.tsx` — words for something still running.
- `hooks/use-hotkey.ts` — the keys the window owns: Esc layers, `windowKey`.
- `lib/utils.ts` — `cn`, `WAITING_INK` and the formatters screens share.
- `messages/<language>.json` and `i18n/` — every word a person reads (next-intl, no language in
  the address): `useTranslations` in a component, English as the source and the fallback,
  `useProblem` for an error code, `LanguageSwitch` to pick a language.
- `features/brand/` — the app's mark (`Logo`, `LogoMark`) and every service's or AI vendor's own
  mark (`BrandMark`): use these rather than drawing a logo or typing a vendor's name alone.
- `features/minime/settings/parts.tsx` — how a Settings section is laid out (`Groups`, `Group`,
  `Rows`, `Empty`); a new section uses them, so every section reads the same.

## The app's screens
One screen around the office (`app/office`, `features/minime/home/`): the office full screen, a bar
over its top, the box to ask the clone at its bottom, and a side panel (Chat, Requests). Everything
else is a section of Settings (`features/minime/settings/settings.tsx`). The first steps are
`app/start`. A new feature finds its place in one of these, not a page of its own.

## How it fits
`components/ui` is shadcn in its Base UI style (`components.json`) plus the app's own parts; add a
shadcn part with `pnpm dlx shadcn add <name>` (the `shadcn` skill knows how).

## What breaks
- A word typed into a component, or a sentence a route returns, reads in one language only:
  words go in `messages/en.json` (and every other language file: `pnpm test` says what is
  missing), a route answers with an error code, and a status or kind stored or sent to others
  is a code each screen reads in its own language.
- A palette class or a hex follows neither the theme nor `.inverse`: every colour is a token from
  `app/globals.css`, picked by meaning — `destructive` failed, `waiting` wants the user, `brand` is
  picked or asked for, success has none.
- Base UI gives an anchor a `Button` renders `role="button"`, so it is no longer announced as a
  link; a link that leaves the app is an `<a>` with `cn(buttonVariants(…))`.
- An unanswered click is clicked again, and late content pushes rows: a pending button takes
  `loading`, a list a `Skeleton` in its rows' shape, words still running `ShinyText`.
- A keydown listener of a screen's own closes two layers on one Esc or fires while typing; a layer
  closes through `useEscape`, and a plain key a screen claims asks `windowKey`.
