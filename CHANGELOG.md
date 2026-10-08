# Changelog

Versions after 0.1.0 are written here by release-please from the commits on main
(CONTRIBUTING.md, "Releasing").

## [0.2.0](https://github.com/cgoinglove/clone-office/compare/v0.1.0...v0.2.0) (2026-10-08)


### Features

* answer a missing page and a failed screen in the person's language ([e16e169](https://github.com/cgoinglove/clone-office/commit/e16e16908b57e2dab7078131b92f4bc81616a2c8))
* **brain:** prompts from today's Claude Code and Hermes Agent ([c541a84](https://github.com/cgoinglove/clone-office/commit/c541a847e9e66e819470cc32ba7a6edb17653921))
* **brain:** treat what web pages and connected services say as information, not instructions ([f579d33](https://github.com/cgoinglove/clone-office/commit/f579d336417540b319869e0c87978c8b2457c8f4))
* browser notices for what waits, while the app's tab is not in view ([d165666](https://github.com/cgoinglove/clone-office/commit/d165666971804e698f0dbf87c9b4ee255e560422))
* **chat:** step in while the clone answers in the person's own conversation ([cac7746](https://github.com/cgoinglove/clone-office/commit/cac77465f899978590ef3d3d65c790f8a93d821e))
* **clone:** what the clone did in your name, any day ([cd31e56](https://github.com/cgoinglove/clone-office/commit/cd31e56313128dfcf6abc209778324c67e033bd9))
* give the app its icons everywhere, and let it be installed as a window ([8433700](https://github.com/cgoinglove/clone-office/commit/8433700d7c6966ff97f39c0e0322b7fbbb373fde))
* **i18n:** the screen and the relay's pages in Simplified Chinese, Japanese, Spanish and Brazilian Portuguese ([b688409](https://github.com/cgoinglove/clone-office/commit/b68840969e5b2d9c0cc693ebaca6f989eb7b8aa7))
* **memory:** each line keeps where it came from ([22d21c4](https://github.com/cgoinglove/clone-office/commit/22d21c4c7472a9c1281fbdd83a2a068918a2864c))
* npx clone-office doctor, what works and what does not here, each with what to do ([5c8803d](https://github.com/cgoinglove/clone-office/commit/5c8803d802d55cd010161ed268d19ee0f3edea05))
* offer the skills it ships with as things to try on its first day ([c02c484](https://github.com/cgoinglove/clone-office/commit/c02c484f2575a5c24886666c7b3b466a11442abc))
* **office:** let a colleague's request read in the person's work tools ([969e442](https://github.com/cgoinglove/clone-office/commit/969e442399125e6735bb69e4a4ccab2597ea4e70))
* **plugin:** colleagues and ask_colleague are always loaded, never behind tool search ([a114256](https://github.com/cgoinglove/clone-office/commit/a114256e73ad198434029949f4f756d5e786f9ac))
* **plugin:** what waits on the person, in their Claude Code ([ebf7121](https://github.com/cgoinglove/clone-office/commit/ebf712105a997669806eb1984bce85c6638c5885))
* quiet flows, and answers held back when nothing found shows their facts ([c7cfe34](https://github.com/cgoinglove/clone-office/commit/c7cfe348f728cbe6b33b2261066b144365f64294))
* **relay:** a day's limit on each member's calls with a team key ([bb42a3b](https://github.com/cgoinglove/clone-office/commit/bb42a3b67633c80f396586d3f5edaa7da851fc51))
* **relay:** give the invite and reply links a preview in messengers ([1977e04](https://github.com/cgoinglove/clone-office/commit/1977e0434c1159db7196747d79899dff1b837fbb))
* say when a newer version is on npm, and how to start it ([3463a82](https://github.com/cgoinglove/clone-office/commit/3463a8219ae77bfc288920eb5def10c5f5c09098))
* seal the keys and sign-ins the clone keeps ([75deaf1](https://github.com/cgoinglove/clone-office/commit/75deaf146a7fde01f547ce150a4c585843a0fb31))
* **settings:** what the clone used its AI for, the last 30 days ([16551a7](https://github.com/cgoinglove/clone-office/commit/16551a707414ff0ff11d620b56b4bc12c3602398))
* start with the computer, so the clone answers colleagues with no window open ([6403f70](https://github.com/cgoinglove/clone-office/commit/6403f705c03e78ffc65f5dee1169d0e04928d345))
* team keys, so an office pays once for an AI vendor ([a94c93a](https://github.com/cgoinglove/clone-office/commit/a94c93aae141e0b824fcb95889ac71c7ed3e719e))


### Fixes

* bound the relay calls the AI model screen waits for, settle the clone's folder once, and keep the key out of reach ([682009d](https://github.com/cgoinglove/clone-office/commit/682009df2fea1a1efa392e5d9b5ee4ebe5afce21))
* **chat:** keep every word written while the clone works, read or given back ([489646c](https://github.com/cgoinglove/clone-office/commit/489646c4a65895131e029fb5f82322c9b3b99c93))
* guard team keys and colleagues' reads, and keep OpenAI from storing calls ([fec096f](https://github.com/cgoinglove/clone-office/commit/fec096f766677d8484ab160fa9aed395186cfa70))
* let the first release reach npm, and never write over secrets that cannot be read ([e6914a2](https://github.com/cgoinglove/clone-office/commit/e6914a2184ed241feda9e0795e9af9063478a446))
* **messenger:** a bot started again after it failed does not keep the failed one's listeners ([81b2007](https://github.com/cgoinglove/clone-office/commit/81b2007b01c1a919d3d0459d6edb404e388fe392))
* **office:** keep the office state small after years of requests ([6bce5d8](https://github.com/cgoinglove/clone-office/commit/6bce5d8420e703ca2fdecf4babcec455b19ea0d1))
* **office:** look a request up by its id, never in the latest fifty ([5477859](https://github.com/cgoinglove/clone-office/commit/5477859ce43aecf3bcecee016d6201362068485a))
* **relay:** build the relay's image with every file it needs, and try it in CI ([d422cfd](https://github.com/cgoinglove/clone-office/commit/d422cfd0662125deb08d70ee7645c5531faf77c6))
* **relay:** stopping always ends the process ([5d939b8](https://github.com/cgoinglove/clone-office/commit/5d939b8e9cc1dd0e7b47f72ab85be7711738aed0))
* **release:** version a canary as the next release's prerelease, and tell its users when that is out ([14df69a](https://github.com/cgoinglove/clone-office/commit/14df69a92c9c7e4b4ba7ad7156efd3285f88cdd7))
* **sources:** read Hermes Agent's structured messages on Node 22, and test flow cards in any time zone ([6fd9433](https://github.com/cgoinglove/clone-office/commit/6fd94335f585e9cf2d3343cfda229696dd71b7fa))
* time limits on calls to the relay, and the server's own work starts with it ([b388dbb](https://github.com/cgoinglove/clone-office/commit/b388dbb6cce7ecca5e0867fab4b76e571321fcb2))


### Performance

* **brain:** keep the vendors' prompt caches warm, and show how often they hit ([9ef9acb](https://github.com/cgoinglove/clone-office/commit/9ef9acb690d088545f3a44c1cd0aab7528810c00))
* **relay:** build requests in three queries however many there are (lists, the inbox, A2A), filter ([5477859](https://github.com/cgoinglove/clone-office/commit/5477859ce43aecf3bcecee016d6201362068485a))
* **relay:** move a file's bytes as base64 text, and read them only for whoever may take it ([1253f5b](https://github.com/cgoinglove/clone-office/commit/1253f5b52ae73654f6f80a3ef0bf7f4539255d26))


### Docs

* install the Claude Code plugin from cgoinglove/clone-office ([6d46fac](https://github.com/cgoinglove/clone-office/commit/6d46fac3cd0f9f31f663027fbbe21fb88eef452c))
* issue and pull request templates ([c005ee0](https://github.com/cgoinglove/clone-office/commit/c005ee0764192e5c621f65ed01d4c4a6fb8a3f1f))
* keep the notices of the code and marks taken from Hermes Agent and Lobe Icons, and ship them ([06701ee](https://github.com/cgoinglove/clone-office/commit/06701eee3596f1f3a62eca838157d360235484f0))
* **readme:** how it works inside the Claude Code people already use ([7e98a06](https://github.com/cgoinglove/clone-office/commit/7e98a06aa21a84e486ec92589a4af8761c8741ad))
* **readme:** team keys, sealed secrets, installing the app as a window, and update notices ([b2adf13](https://github.com/cgoinglove/clone-office/commit/b2adf13baddefc8b63963ef94e493d8dcc69126d))
* the README in Korean and Simplified Chinese, and its stale lines fixed ([8f74faf](https://github.com/cgoinglove/clone-office/commit/8f74faf4c0270b62b6d19eb0921637dfb524f176))

## 0.1.0

The first release, MIT licensed. `npx clone-office` starts it.

### Your clone

- First steps that open on what a clone is, beside the office playing the app's loop: what it
  thinks with, letting it learn how you work, who you are and your team, then the office's lobby.
- Learns from your AI conversations on this computer (Claude Code, Codex, Cursor, Hermes Agent),
  your instruction and memory files and your commits, or from what ChatGPT, Claude or Gemini
  remembers about you. Keeps only what lasts, shown exactly as saved, each line fixable.
- Thinks with your ChatGPT plan (Sign in with ChatGPT), your Claude subscription through your own
  Claude Code, an OpenAI, Anthropic, Gemini or OpenRouter key, or Ollama or LM Studio.
- Searches your past AI conversations; asks your Claude Code conversations and has copies of them
  do work, every change shown to you first.
- Works in Notion, Linear, Jira and Confluence, GitHub, Gmail, Calendar, Drive, Docs and Sheets
  through each vendor's own MCP server.
- Flows: things it does on its own at set times, made by asking.
- From your phone through your own Discord, Telegram or Slack bot.

### The office

- The office is the main screen: your clone at its desk, colleagues' clones carrying requests,
  a board of who is on what, and the lobby once a day.
- Requests between clones with trust levels per kind of request (on its own, tell me, ask me
  first), a second look before any answer leaves, questions batched three times a day while you
  are away, files with requests, and reply links for people without a clone.
- An office opened on your computer for your network, or a team server with Docker and Postgres:
  accounts, one-line computer connect, and owners who manage who is in.
- The Claude Code plugin: your colleagues' clones as tools in your Claude Code.

### The app

- One app: the office, a side panel for your clone and your requests, and Settings.
- English and Korean.
