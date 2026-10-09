# Taste

Working visual directions and inherited defaults, not a frozen design specification.
A dated line in this file is not, by itself, proof of user approval. Use it as a starting point;
consider alternatives when the actual workflow calls for them. Respect a design the user explicitly
chooses within its scope, and ask before a major visual change. Keep this list short.

- **Office**: the design to build is the one in `docs/office-room.local.d/` (sign-in lobby, lift ride, the office); the user approved it for development. (10-06) Nothing moves for show (no tea runs, vacuum, hearts or smiling eyes, no sketching in on open); the board's content gave way to a big LED clock with who is in; each clone is named over its head with what it is on. The user chose this. (10-09) The clock went onto the left wall by the agent's choice; the user liked the board standing apart, outside the room, and that is where it should go back. (10-09)
- **Colour**: black and white; the brand colour only for buttons and a few points (in the office: your floor, the sign-in button); what waits on the person is the ember (`--waiting`); red only for deleting and the dot badge on a mini-me's mark. The office room adds no colours of its own (no warm lamps, dusk, tinted floors); the mini-mes keep their own colours. The user chose this. (10-06)
- **New shapes**: start from this app's own screens, not from generic UI (a dark theme, letter avatars, red badges). (09-17)
- **Corners**: mixed as Thursday mixes them: the brand button (the one thing a screen asks for) and short suggestion chips are round (`rounded-full`); every other button and control is the same rounded rectangle (10px, small sizes 8px; large panels 14px); a box that grows with what is typed (the ask box, the chat box) takes a large radius in pixels (26px), a pill at one line that stays sound at five, as ChatGPT's does. The user chose this. (10-08, replacing 10-04's one corner for all)
- **No shadows on buttons**: a button, a segmented pick or a field is flat: a fill or a hairline ring, never a drop shadow; only what floats (a popover, a menu, a toast, a dialog) casts one. The user chose this. (10-08)
- **No separators between items**: rows in a short list (a step's points, a summary, a card's lines) are split by space, never by a hairline between them; a hairline stays only at the edge of a pane or a long scrolling list. The user chose this. (10-08)
- **Next and back**: chevrons (`ChevronRight`, `ChevronLeft`), never arrows, on a step's buttons and wherever a row opens more. The user chose this. (10-08) A summary of several kinds that each open (what the reading understood) shows its chevrons only while pointed at, and a bordered pill none, so the summary stays quiet. (10-09)
- **Icons**: lucide, as Thursday uses it (its own picks where it has the same place: Aperture for the
  AI model, Cable for connectors, Smartphone, Settings2, SquarePen); never sparkles, lightning or
  magic wands, which read dated. A column's open row is told by its fill, not by a filled icon;
  `NavIcon` holds the column's marks, the clone's own place the app's mark. A line with no meaning
  (a placeholder saying what a list is for) is never drawn in the column. The user chose this.
  (10-09)
- **Explained choices**: picking one of a few options that need a sentence each is `ChoiceList`
  (cards, the picked one ringed in brand), never a segmented control with a paragraph under it,
  and never a filled black tile. (10-09)
- **Borders**: the ink at low opacity, never a grey of their own. (09-20)
- **Separation**: groups are split by space; a hairline only at the edge of a pane or between the rows of a long list that scrolls (see No separators between items). (09-18, 10-08)
- **Icons**: an icon on a filled button is filled, not outlined. (09-18)
- **Triggers**: sit inside what they belong to. (09-18)
- **Halves**: the first steps take half the window and what stands beside them the other half,
  and that half changes with the step (the office, what was understood, the card being written)
  rather than the steps scrolling; the footer holds only Back and the step's button. The user
  chose this. (10-09)
- **No growing panes**: a screen meant to fit at once (the first steps beside the office, a card, a
  settings row) never grows a scrollbar because something was clicked; choices open in a popover or
  dropdown at the field's own width, as Thursday's model picker does (one button, a two-column
  popover: vendors, then what the one in hand offers). Screens meant to scroll (a conversation, a
  list) scroll. This holds for every new part, not only the model. The user chose this. (10-08)
- **Under way**: anything still running says so, always: a spinning icon or ShinyText, never a still
  word. The user chose this. (10-08)
- **Messages**: as a chat reads, the person's own on the right with a fill, the other side on the
  left with neither fill nor border; never a bubble drawn as an outline. The user chose this. (10-08)
- **Words**: what a first-time user reads is plain everyday English with no jargon. (09-19)
- **Theme**: Light is the default, whatever the computer is set to. (10-01)
