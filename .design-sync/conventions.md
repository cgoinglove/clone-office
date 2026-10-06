# sub-office design system

sub-office is an office where everyone sends their *sub*, an AI stand-in (drawn as a small bot),
to carry requests between colleagues. Its screens are a calm messenger plus the office: an
isometric floor where each person's bot sits at their desk, piles of work show on the desk, and
the walls show what is going on. Light is the default theme.

## Setup

No provider is needed. Everything is styled by `styles.css`; do not add another CSS reset or
font. Dark theme: put `class="dark"` on `<html>` (or any ancestor); every token flips. Inside a
dark page, `class="inverse"` draws one element in the light theme (and the reverse).

Fonts are Geist and Geist Mono, already loaded. Use `font-sans` / `font-mono`.

## Styling: Tailwind utilities on the app's tokens

Style your own layout with Tailwind utility classes. Available: flex and grid
(`flex`, `grid`, `flex-col`, `items-center`, `justify-between`, `grid-cols-3`), spacing on the
0–24 scale (`gap-2`, `p-4`, `px-3`, `mt-6`, `space-y-2`), sizes (`w-full`, `max-w-2xl`,
`size-8`), type (`text-xs`…`text-5xl`, `font-medium`, `font-semibold`, `tabular-nums`,
`truncate`), shape (`rounded-lg`, `rounded-xl`, `rounded-full`, `border`, `shadow-sm`).

Colours are semantic utilities only; never a hex or a palette class like `bg-blue-500`:

| Utility | Meaning |
|---|---|
| `bg-background`, `text-foreground` | the page and its ink |
| `bg-card`, `bg-popover` | a raised surface |
| `bg-muted`, `bg-secondary`, `text-muted-foreground` | quiet fills and secondary text |
| `bg-primary text-primary-foreground` | the ink button, the user's own bubble |
| `bg-brand text-brand-foreground`, `text-brand` | blue: what is picked or asked for. A point, never a surface |
| `text-waiting`, `bg-waiting/10` | ember: waits on the viewer (a decision, "needs you") |
| `text-destructive`, `bg-destructive/10` | something failed. There is no success colour |
| `border-border` | every border: the ink at low opacity, never a grey of its own |

Corners are one family: every button and control (any `Button` variant, `Segmented`, tabs,
inputs, chips) is a rounded rectangle, `rounded-lg`, or `rounded-md` when small; menus and
popovers `rounded-lg`; large panels (dialogs, cards, toasts, bubbles) `rounded-xl`. Only what is
round by nature is `rounded-full`: a switch, a radio, a colour dot, an avatar. Never make one
button in a row a pill.

Separate groups with space, not lines; a hairline only between rows of a list or at a pane's
edge. Raw tokens for inline styles: `var(--gray-0)` (paper) to `var(--gray-1000)` (ink),
`var(--ink)`, `var(--brand)`, `var(--waiting)`, `var(--destructive)`, `var(--alpha-10)`.

Words are plain everyday English: "Needs you", "Computer off", "Ask Jae's bot", not jargon.

## Components

- Controls: `Button` (`variant` default | brand | outline | secondary | ghost | destructive | link;
  `size` xs | sm | default | lg | icon; `loading`), `Input`, `Textarea`, `Switch`, `Segmented`,
  `RadioGroup` + `RadioGroupItem`, `Combobox`, `Swatch`.
- Layout and text: `Field` (+ `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`),
  `Tabs` (+ `TabsList`, `TabsTrigger`, `TabsContent`), `Table` (+ parts), `Separator`,
  `Skeleton`, `ShinyText` (words for something still running), `Letters`, `FoldedText`.
- Messages: `BubbleGroup` > `Bubble` (`variant`, `align="end"` for the user's own) > `BubbleContent`.
- Overlays: `Dialog` + `DialogContent`, `DropdownMenu` + `DropdownMenuContent`, `Popover`,
  `Tooltip` inside `TooltipProvider`. Their parts only work inside their root.

## The office

The office pieces are SVG drawings that size themselves; give them a `width` in pixels (they
shrink to fit their container) and `assemble={false}` when they should not build themselves in.

- `OfficeFloor` draws a whole floor: `people` (each `{ name, team, status, mood, pile,
  needsDecision, says, you }`), `layout` plaza | grid | rooms | library, `deskStyle` panel | frame
  | wood, `sky` now | day | evening | night. It is full width; put it in a wide container.
- `Bot` is a person's bot: `mood` idle | working | talk | listening | surprised | asking | happy |
  sleep | walk, `color` (the viewer's own bot is the ink: leave `color` out), `shape`, `size`.
- Pieces: `Desk`, `Laptop`, `DeskLamp`, `PaperTray`, `DeskChair`, `WallClock`, `WallCalendar`,
  `OfficeScreen`, `DecisionBoard`, `TeamSign`, `Plant`, `CoffeeCorner`, `PingPongTable`,
  `Bookshelf`, `Lounge`, `MeetingRoom`, `OfficeCorner`, `Lift`.
- `BotBody` puts a bot inside your own `<svg>`; that svg needs `className="of"` and the
  bot's 240-unit box.

Status reads the same everywhere: active (lamp on, laptop open), away (bot on duty), offline
(laptop shut, bot asleep). Work piles one sheet per request up to 8, then a count. Ember means
the viewer must decide.

```jsx
<div className="flex flex-col gap-4 p-6 bg-background text-foreground">
  <div className="flex items-center justify-between">
    <h1 className="text-xl font-semibold">Sales floor</h1>
    <Button variant="brand">Ask a colleague</Button>
  </div>
  <OfficeFloor
    layout="plaza"
    people={[
      { name: "Jae", team: "Sales", you: true, mood: "working", pile: 2 },
      { name: "Mina", team: "Finance", needsDecision: true },
      { name: "Ana", team: "Finance", status: "offline", pile: 3 },
    ]}
  />
</div>
```

Read `styles.css` (it imports `_ds_bundle.css`) for every token, and each component's
`.prompt.md` and `.d.ts` for its props.
