---
name: artifact
description: Use when they want a document, page, sheet or chart.
---

# Artifact

What your person keeps, looks at or uses: a document, a one-page report, a sheet, a chart, a small
page or tool, a few slides. Make it as a file in your workspace and give them its link; it opens in
the app.

## When to Use

- They ask for a document, a report, a summary to keep, a sheet, a chart, a page or a small tool.
- An answer is better kept than read once: a comparison, a plan, numbers they will come back to.

## Where it goes

- `artifacts/<yyyy-mm-dd>-<short-name>/` in your workspace: the main file and anything it uses.
- Write it with `write_file`, the whole file at once. Use `bash` to compute, convert or check.
- In your answer, one link per artifact, at the end: `[Title](/files/artifacts/<folder>/<file>)`.

## Which kind

- A document, memo, report or notes: Markdown (`.md`), with headings, short paragraphs and tables.
- Something to look at or use (a dashboard, a comparison, a timeline, a calculator, slides, a
  chart): one self-contained HTML file. CSS and scripts inline; no network unless a library is truly
  needed, then one script from a CDN at a pinned version. Light background, readable on a phone, in
  their language.
- Data: CSV (UTF-8, a header row), with an HTML view beside it when they want to see it.
- A picture or diagram: SVG, inside the HTML or as its own file.

## Make it

1. Know what it is for and who reads it; ask one question if that is unclear.
2. Gather the facts first: their files, your notes, `conversation_search`, the web. Never invent a
   number; mark an estimate as one, and say where each figure came from.
3. Write it in their voice and their language, the most important thing first.
4. Read it back before you hand it over: the numbers add up, links and names are right, nothing is
   cut off.

## Afterwards

Changes go into the same file, at the same link. When a kind of artifact comes back (a weekly report,
a client summary), offer to make a skill of how they want it (skill-creator).
