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
- `components/ui/button.tsx` — the button variants and `loading`; a brand fill under white words is
  `bg-brand-fill` (the brand itself in light, a deeper blue in dark), never `bg-brand`.
- `components/ui/confirm-dialog.tsx` — `ConfirmDialog`: a big step asked once (both buttons one
  shape, only a removing one red; `error` says in it why the step failed; `confirmOpen()` for a
  key that must wait while one is open).
- `components/ui/toast.tsx` — `say` (what the person just did, one line at the bottom centre),
  `sayUndoable` (done when the toast goes without Undo), `notify` (news they did not cause, a
  card at the bottom right); `Toaster` is mounted once in `app/layout.tsx`; a screen with a box at
  its bottom keeps them above it with `liftNotices(box)`.
- `hooks/use-undoable-removal.ts` — removing an item from a list with Undo: hidden at once (the
  list's count and order following), removed when the toast goes or the list does, back on failure.
- `components/ui/tooltip.tsx` — `Tip`: what an icon-only button does, and its keys; its words are
  the button's name for a screen reader too, so the button takes no `aria-label` of its own.
- `components/ui/markdown.tsx` — model text as markdown (Streamdown, with code, math, mermaid, CJK).
- `components/ui/shiny-text.tsx` — words for something still running.
- `hooks/use-hotkey.ts` — the keys the window owns: Esc layers, `windowKey`.
- `lib/utils.ts` — `cn`, `WAITING_INK` and the formatters screens share.
- `messages/<language>.json` and `i18n/` — every word a person reads (next-intl, no language in
  the address): `useTranslations` in a component, English as the source and the fallback,
  `useProblem` for an error code, `LanguageSwitch` to pick a language.
- `features/brand/` — the app's mark (`Logo`, `LogoMark`), the places' marks (`NavIcon`: a
  column's rows, lucide's as Thursday picks them, the clone's place the app's mark outlined) and every service's or AI vendor's own mark
  (`BrandMark`): use these rather than drawing a logo or typing a vendor's name alone.
- `components/ui/choice-list.tsx` — `ChoiceList`: a choice between a few options, each explained
  under its name (a radio group as cards, the picked one ringed in the brand colour; `dense` where
  a step must fit a short window).
- `features/minime/list-field.tsx` — `ListField`: a short list kept as items (what someone looks
  after, their tools), one line opening its items in a popover; never a text field split on commas.
- `features/minime/settings/parts.tsx` — how a Settings section is laid out (`Groups`, `Group`,
  `Rows`, `Empty`); a new section uses them, so every section reads the same.

## The app's screens
One frame around every screen (`app/(app)/layout.tsx`, `features/minime/shell/`): the column on the
left (`sidebar.tsx`: New chat and Search, ⌘K, `command-palette.tsx`; the places Home, Requests,
Office and Your clone, the open one by its row's fill; To decide, the asking clones with their red
dot; recent chats by day, a page at a time, each with a menu, `recent-chats.tsx`; the person with
their menu, and Settings), folding away with ⌘\ and a drawer on a narrow window
(`app-shell.tsx`, which also marks the root `data-keys` while the keyboard moves focus, so a box one
types in, `data-ask-box`, rings only then), and the open screen: `/home` first (`home-screen.tsx`: what
waits on the person answered in place, the requests on their way, what the clone did today, today;
the getting-started list `welcome.tsx` `FirstSteps`), `/chat` (`chat-screen.tsx`, with the
office's live column `office-rail.tsx`; the turns are `home/chat-view.tsx` `TurnRow`, the clone's
to-do list one card above its answer, `TodoCard`, and a helper or a move to the backup model a
quiet line), `/requests` and
`/requests/[id]`, `/office` (the floor with the person's turn over it at the right), `/clone` (three numbers and the card colleagues see over what it knows,
the requests it takes, flows and what it did, each in two columns), and `/files/<path>` (what the clone made in its workspace, opened by the
link in its answer, `file-screen.tsx`; a page runs in a frame without the app's origin). Home, Requests and Office open with one line when the office cannot be reached, saying what to
do (`office-trouble.tsx`), so an empty office never passes for a quiet one. What the screens share
lives in `app-state.tsx` (`useApp`); the
shared parts of these screens are `parts.tsx` (`PageHeader`, `Mark`, `PhaseChip`, `DoneStamp`,
`Flap`, `Asking`; `RequestLine`, a request as one line wherever requests are listed; `useWhen`, one
way of saying when), and a decision is one card wherever it is answered (`turn-rows.tsx`). Settings is one dialog of six sections (`features/minime/settings/settings.tsx`). The
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
