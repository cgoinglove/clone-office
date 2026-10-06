# design-sync notes (sub-office)

## How this repo is synced

- The repo is a Next.js app, not a published package. `node .design-sync/build.mjs` (cfg.buildCmd)
  builds a throwaway package in `.design-sync/.cache/pkg`: `dist/index.js` re-exports the source of
  `components/ui/*` and `features/office`, tsc emits the `.d.ts` tree (with `@/` paths rewritten to
  relative), and `dist/styles.css` is Geist from Google Fonts + `app/globals.css` compiled by
  Tailwind against the app sources + `features/office/office.css`. Run it before the converter.
- Skipped on purpose: `markdown`, `markdown-body` (streamdown pulls mermaid, KaTeX, Shiki),
  `theme-sync` (renders nothing), `notify` (imperative dialogs, no component).
- The stylesheet safelists everyday Tailwind utilities and the semantic colour utilities with
  `@source inline(...)` (see build.mjs). Without it a design gets only the classes the app's own
  sources happen to use (`justify-between`, `py-3`, `bg-card` were missing). This affects only the
  design system's stylesheet, not the app.
- `srcDir` points at `features/` so office components get the `office` group; the shadcn parts in
  `components/ui` land in `general` (both path segments are generic to the converter).
  `componentSrcMap` pins the pieces that all live in `features/office/objects.tsx`.
- Office drawings are SVG markup built from numbers (`features/office/*.ts`), injected with
  `dangerouslySetInnerHTML`; names are escaped. Their CSS is scoped under `.of`.
- Several claude.ai accounts sync from this one checkout. `projectId` in `config.json` is the project
  of the account that ran the first sync; another account cannot write to it. On another account:
  `/design-login`, `/design consent`, then remove `projectId` from `config.json` (or set that
  account's own) and run `/design-sync`; it creates or picks that account's project. Everything
  else here (build, previews, conventions) is shared and stays as it is.

## Known render warns (benign, screenshots checked 2026-10-04)

- `[RENDER_THIN]` on every SVG-only office piece (Bookshelf, CoffeeCorner, DeskChair, DeskLamp,
  Laptop, Lounge, MeetingRoom, OfficeCorner, PingPongTable, Plant, WallClock) and the brand icons
  (ClaudeIcon, GoogleIcon, GrokIcon, OpenAIIcon, VercelIcon): the check looks for text; the
  drawings paint.
- `[RENDER_THIN]` on Dialog: the popup is portalled and fixed, so the mount measures 0px; the
  screenshot shows the open dialog.
- `[TOKENS_MISSING]`: Base UI's runtime vars (`--toast-*`, `--available-*`, `--anchor-width`,
  `--transform-origin`) and streamdown's `--sdm-*`, set inline at runtime.
- The capture can screenshot before Geist finishes loading, so office text sometimes looks like
  Courier in `_screenshots/`; the font does load (checked with document.fonts).
- Letters captures mid-arrival: its letters arrive one by one by design.

## Re-sync risks

- Previews pin dates (`new Date(2026, 9, 6, ...)`) so clocks and calendars are stable; components
  are live by default.
- The Tailwind safelist in build.mjs is a hand list; a new semantic colour in globals.css must be
  added to `COLORS` there to reach designs.
- Fonts come from Google Fonts at runtime (`[FONT_REMOTE]`), matching next/font's Geist in the app.
- Built with node 26, Tailwind 4.3 and playwright 1.63.
- 85 shadcn sub-parts (DialogTitle, TableRow, ToastAction…) ship on the floor card; their parents'
  previews show them composed. Author more previews on a later sync if wanted.
