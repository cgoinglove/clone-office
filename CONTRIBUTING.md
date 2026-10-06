# Contributing

## Run it

```sh
git clone <this repository> sub-office && cd sub-office
pnpm install
pnpm dev       # http://127.0.0.1:3000
```

Node.js 22.18 or later and pnpm 10. There is no `.env` to fill in: what the clone thinks with is
picked on the first screen, and everything it keeps goes to `~/.sub-office` (`SUB_OFFICE_HOME`
moves it, so a test never touches your own clone).

| | |
|---|---|
| `pnpm dev` | the app with hot reload |
| `SUB_OFFICE_HOME=… SUB_OFFICE_DEV_DIR=.next-b pnpm dev --port 3001` | a second clone beside the first |
| `pnpm relay` | a team server (relay) on this computer |
| `pnpm typecheck` / `pnpm lint` | types, and Biome |
| `pnpm test` | every test, offline: models are stood in for |
| `pnpm build` | the production build |
| `node scripts/pack.mjs --working` | the npm package from your working tree, into `dist/`, published nowhere |

## Before you open a pull request

- **Read [AGENTS.md](AGENTS.md) first**: what each folder is for and the few rules that hold
  there. A coding agent reads the same file.
- `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
- **Changed a screen? Run it and look at it**, in both themes and both languages; screenshots
  help. Every word a person reads is in `messages/en.json` (and every other language file).
- **Changed what the clone is told or a tool's description?** Read the whole prompt it gets, not
  only the diff.
- **Changed something a person would notice?** Update `guide/` in the same change: the clone
  reads it to answer how the app works.
- Code, comments, prompts and commit messages are in English. Commit messages say what changed
  for the person using the app.

## What the project holds to

- What a clone keeps stays on its person's computer; the relay carries cards and requests only.
- Code decides what goes to the person; the model only proposes.
- Each AI vendor is used only the way its terms allow.
- Nothing about one maintainer's computer, accounts or language belongs in shared code.
