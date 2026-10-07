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
One frame around every screen (`app/(app)/layout.tsx`, `features/minime/shell/`): the column on the
left (`sidebar.tsx`: new chat, Chat, Requests, Office, what waits on the person, recent chats, the
clone, status, Settings) and the open screen: `/chat` first (`chat-screen.tsx`, with the office's
live column `office-rail.tsx` and the getting-started list `welcome.tsx`), `/requests` and
`/requests/[id]`, `/office` (the floor with the person's turn over it at the right, and the
clones' meeting at the left while one goes on, `meeting.tsx`, started from its header), `/clone` (what it knows,
the requests it takes, flows). What the screens share lives in `app-state.tsx` (`useApp`); the
shared parts of these screens are `parts.tsx` (`PageHeader`, `Mark`, `PhaseChip`, `DoneStamp`,
`Flap`). Settings is one dialog of six sections (`features/minime/settings/settings.tsx`). The
first steps are `app/start`. A new feature finds its place in one of these before it asks for a
screen of its own, and the left column stays short.

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
