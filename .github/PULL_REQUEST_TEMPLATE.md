## What this changes

<!-- One or two sentences, for the person using the app. Link the issue if there is one. -->

## Why

<!-- What was wrong, or what became possible. Skip if it is obvious. -->

## Checks

- [ ] The title is a conventional commit (`feat: …`, `fix(office): …`): it becomes the changelog line
- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` pass
- [ ] Ran the app and looked at what I changed, in both languages and both themes (screenshot below if it is a screen)
- [ ] Every word a person reads is in `messages/en.json` and each other language
- [ ] Something a person would notice? `guide/` says it too
- [ ] Prompt or tool change? Read the whole prompt the clone gets, not just the diff
