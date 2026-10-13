# Changelog

Versions after 0.1.0 are written here by release-please from the commits on main
(CONTRIBUTING.md, "Releasing").

## [0.2.0](https://github.com/cgoinglove/clone-office/compare/v0.1.0...v0.2.0) (2026-10-13)


### Features

* **brain:** long work as Claude Code does it: a to-do list the person sees, long tool answers kept whole in a scratch folder, helpers, and a backup model ([ee02bfe](https://github.com/cgoinglove/clone-office/commit/ee02bfebc1b40712bd70d35b5f9bfb0a9d1c2e3a))
* **brain:** when what the person asks is a colleague's to answer, the clone says whose it is and offers to ask them rather than guessing ([c7749b7](https://github.com/cgoinglove/clone-office/commit/c7749b77b595806711d6ba8d03dd0d4e50aec067))
* **desktop:** Clone Office as a desktop app for macOS, Windows and Linux, with no Node.js to install: the npm package's own server inside, started with Electron's Node, its window and its icon in the menu bar or tray keeping the clone answering colleagues, the person's shell PATH, starting with the computer as the app's own login item, and updates from GitHub Releases where the app can replace itself, a download link where it cannot ([265495f](https://github.com/cgoinglove/clone-office/commit/265495f7e7b62484a04b26b4422542f9fa5a81ac))
* first steps as asked, a reading that learns where the work is, and the clone's own hands ([4160699](https://github.com/cgoinglove/clone-office/commit/4160699df39b0c157750c3ed774166d9b91c280a))
* **flows:** "ask me first when X comes up", held to by code ([8c23f3c](https://github.com/cgoinglove/clone-office/commit/8c23f3c9a243c7ddcc9d2d3a85945e24d0b153e1))
* **hands:** ask and give work to the person's Codex conversations ([bbdc68e](https://github.com/cgoinglove/clone-office/commit/bbdc68eb87795af83b08ce0ff1ae40c7b6444f73))
* **hands:** let one piece of work change files in its folder without asking each time ([1f164e8](https://github.com/cgoinglove/clone-office/commit/1f164e86e41d86be76b1abcf66342531030f806b))
* **home:** a real ask box, the day in one panel, and empty parts as one line ([56101b2](https://github.com/cgoinglove/clone-office/commit/56101b284979ecf2cec84e76c8bdf28ce3427230))
* **home:** ask for a star once, when the clone has answered a colleague ([44b750c](https://github.com/cgoinglove/clone-office/commit/44b750cf9e9a7d3768208e5531ea064acf2ee5a9))
* **install:** setup an AI on the person's computer can follow ([c3816f4](https://github.com/cgoinglove/clone-office/commit/c3816f4aaf0b243bc73533e02fa0d229057600f2))
* **learn:** the first reading learns their work, projects and people, not five lines ([8015d75](https://github.com/cgoinglove/clone-office/commit/8015d75ab2cb90e1040533acaef8d94510419ccf))
* **office:** only what means something moves, a big clock and who is in where the board stood, each clone named with what it is on ([643ed1d](https://github.com/cgoinglove/clone-office/commit/643ed1d6e6c35c454c91349938d4791711f97c40))
* **office:** share a skill with the office and add a colleague's ([d4bd941](https://github.com/cgoinglove/clone-office/commit/d4bd94141150a7e65875526a1021db8fbedcf3bc))
* **relay:** invites are one per person, a link that joins one clone and makes one account for a week, made when asked and cancelled by owners; a new server's admin is made with a setup link printed at start or asked for by the app that runs the office; a clone without an account gets a link to make its own; the sealing key is made once and kept apart from Postgres by default ([43032a1](https://github.com/cgoinglove/clone-office/commit/43032a13750d8effbadef8a24b26e12c0ee1462b))
* **relay:** keep the skills an office's members share ([e817570](https://github.com/cgoinglove/clone-office/commit/e817570d871f2cb983eb436bdfb2c11ad8f542a3))
* **relay:** people sign in with Google or a password as the server's admin sets it, the Google secret and the session secret sealed, a Google identity joined to an account only by its person ([41cbc56](https://github.com/cgoinglove/clone-office/commit/41cbc560406e90aab789498a36fa1215cb795c05))
* **relay:** someone with no computer takes part on the web: colleagues' clones see them as on the web and ask them, and they answer what was asked of them, ask a colleague and read the answers on the team server's requests page; a computer connected later takes their place over ([77dccd7](https://github.com/cgoinglove/clone-office/commit/77dccd7577e79dbc2715aba18d46364dd9ee9d2e))
* **shell:** a column of places marked filled while open, and first steps that explain each choice ([40bb319](https://github.com/cgoinglove/clone-office/commit/40bb319eecad9580d24a77a26f5f7a38c82017ad))
* **shell:** recent chats under headings by day, a page at a time, renamed (F2) or archived from their menu and brought back in Settings; news comes as a card at the bottom right, tips name icon buttons and their keys, the folder list is a page of Settings, the model picker moves with arrow keys, and an unreachable office reconnects quietly ([cf54b47](https://github.com/cgoinglove/clone-office/commit/cf54b47c6373dc8af510da9678bff84f2fd8d561))
* **shell:** the chat's address names the conversation open, so a reload, Back or another tab comes back to it ([a626565](https://github.com/cgoinglove/clone-office/commit/a6265651a536b2b11e8e331f77bbc7c3e3ec6813))
* **shell:** the column folds away and is a drawer on a narrow window, finds anything with ⌘K, and ends with the person and their menu; what waits on them is called what to decide, each row the asking clone with its red dot ([5e9cf43](https://github.com/cgoinglove/clone-office/commit/5e9cf4360c15cf474c83b626afff50bad8ce4770))
* **skills:** ship skills that do work, not report templates ([393e718](https://github.com/cgoinglove/clone-office/commit/393e718417d96f6d815222fa270a94cf10e35f57))
* **start:** a model's answer stands a day for the same choice, and the summary's kinds keep room round their fill ([d74fc05](https://github.com/cgoinglove/clone-office/commit/d74fc0556364573f61fcbf3de8a8c28f0a1eb5bb))
* **start:** first steps in one frame, with what is picked in popovers ([15659a8](https://github.com/cgoinglove/clone-office/commit/15659a8e30aada52ce1214c164e600477d3190b7))
* **start:** the first steps as drawn in v2 ([99ac004](https://github.com/cgoinglove/clone-office/commit/99ac004be148f6ea0069672b4cbca9d7332e7b94))
* **start:** the steps beside an office that tells its story, places that never nest, and what was learned taken back in place ([c6bf833](https://github.com/cgoinglove/clone-office/commit/c6bf8338f148364bd7abe15b9cd6970d6e33c27c))
* **start:** what the reading understood in names beside an office where a colleague's clone asks and theirs answers ([2142859](https://github.com/cgoinglove/clone-office/commit/21428595e69eae3e5881bda474ffc0315133f3a8))
* **start:** what they do leads what was understood, each kind marked, its chevron shown only when pointed at ([51de1a1](https://github.com/cgoinglove/clone-office/commit/51de1a1e7e7fe5bc3f355ff8c6b141d2b20b36d6))
* **ui:** buttons side by side share one shape and outline buttons are gone; big steps are asked once in a small dialog, small ones are undone from a toast, and a decision row opens from its end ([aeea883](https://github.com/cgoinglove/clone-office/commit/aeea8835b24ea4df50f1cf2171630f6a757d7883))


### Fixes

* **brain:** a plan's usage limit is said in the person's words with when it lifts, a closed laptop no longer uses up a session's time, and a reading's page follows it again after its connection goes; Claude Code's helpers run in front so one is done only when its report is back, its messages read as paragraphs and its own notices are never the clone's words; on the app's own loop the browser starts on a fresh install, outside text stays marked in every part, JSON is laid out whole, a page cut at its size says so, helpers are told what outside text is, a helper waiting its turn is not shown running, a model on this computer that refuses is said as such, and errors are not printed to the terminal; a carried conversation's summary covers only what came before the message it answers, and a chat's address opens that chat on a cold load ([560e74a](https://github.com/cgoinglove/clone-office/commit/560e74a37b33698f20bf10f871e817118ec90866))
* **brain:** an awake deadline fires once however its interval is stopped ([18c8dd8](https://github.com/cgoinglove/clone-office/commit/18c8dd8672cbb43e85aca9fffed1629f56d0f71d))
* **brain:** the backup model's field loads once and is read again only when the pick above changes ([8428d59](https://github.com/cgoinglove/clone-office/commit/8428d59480858d329bd7503b9610c49d9dfc4d13))
* **flows:** topic flows held by two looks, kept from offering a rule, shown as they apply ([d5d01c4](https://github.com/cgoinglove/clone-office/commit/d5d01c4ac65528282b7b744d595b575608a6a4a8))
* **hands:** keep a task's grant to its folder, and never report work over before it is ([ef6ec35](https://github.com/cgoinglove/clone-office/commit/ef6ec356a284cbed775e00ca5593c4cae72c9bbe))
* **office:** each piece is judged on its own as standing before a clone, and a clone at ease takes its covers again after the drawing is rebuilt ([7f0ab86](https://github.com/cgoinglove/clone-office/commit/7f0ab86e1fbf3745ce276e0fd8b257e2abbd421f))
* **office:** skills shared with the office recover from a halted update and stay names ([25c3591](https://github.com/cgoinglove/clone-office/commit/25c3591c6badf7f6a18f50cf6f0d249d4e066f8e))
* **office:** tags stay when nothing shows over a head, the clock's attendance reads at a glance, clones at ease hold still ([6cf162d](https://github.com/cgoinglove/clone-office/commit/6cf162dae3ad87f0c4d32cc9ce1591a993b3f8a3))
* **office:** the clock's faces take two rows rather than a count when a two-digit hour leaves less room, and a meeting spreads round its table with its words leaning off the clock ([db6fda5](https://github.com/cgoinglove/clone-office/commit/db6fda53c4187e40cb5bff461096ad3c00dbbed3))
* **office:** the floor ends a step past its desks, the clock says the hour as it is said with AM or PM beside it, and the panel speaks of the viewer as the viewer ([e8d69e6](https://github.com/cgoinglove/clone-office/commit/e8d69e66a1b9e97c84a42d9ca3165bb45adfd37a))
* **office:** the lobby's building stands as it is with nobody walking in, the lift's doors are a plain panel with its seam, and they open on the whole floor rather than a camera pulled back from the lift ([0fc2996](https://github.com/cgoinglove/clone-office/commit/0fc2996c00c88d15aa4eafdac141d1121b8a38be))
* **office:** the reading nook stands off the wall, so a meeting never hides the clock, and the clones round its table go untagged ([0dad4df](https://github.com/cgoinglove/clone-office/commit/0dad4dfeb1d1a4eea777cfb15f8134bb552a8f0e))
* **relay:** a reset link is checked again when used and its person can stop it, a wrong password never tells who the admin is, the admin hears when passwords come back for everyone, Google started at another address goes to the same page there, signing out from a join goes on to that invite, the limiter stays bounded and counts the address a proxy added, and an invite link is safe inside a shell's quotes ([a01e7c8](https://github.com/cgoinglove/clone-office/commit/a01e7c8beeb3914bfe8328e1575d96bf66441995))
* **relay:** a team server in a private network says to join from that network rather than from someone's computer, the web's ask names nobody until the person picks, and its links are big enough to tap; fix(office): what a clone says stays inside the room's edges, its tail over the head that says it ([d9d7349](https://github.com/cgoinglove/clone-office/commit/d9d7349a3af679e83599a6deafc9637ab67cbc11))
* **relay:** an invite's two halves are never joined, so whoever used the other half of a shared link takes over nobody's clone; the office's key makes no admin except for the app running the office on that computer; invites are made then shown once, ten open each, with a note of whom they are for; the setup link is taken in the database before the admin is made; a relay given another sealing key than its database's stops and says so; saved web answers read back stay marked as outside text, Electron's run-as-Node flag stays out of Claude Code and Codex, and the server pages say who is on the web, what waits for them, and whose answer is whose ([46d7716](https://github.com/cgoinglove/clone-office/commit/46d771654883f884ee482986bb9fa1395109fcd2))
* **relay:** buttons side by side on the server's pages share one size ([c7c80b8](https://github.com/cgoinglove/clone-office/commit/c7c80b8706d2b53bbefa0ff3169b48d57ac50437))
* **relay:** sign-in can never lock everyone out, Google starts write nothing and are limited, its way back answers only as itself, a forgotten password gets an admin's one-time link, accounts can be removed, joining another office is asked, and the pages meet focus, contrast and wording reviews ([26b771a](https://github.com/cgoinglove/clone-office/commit/26b771a7884914174901b7d4912bd56e3416a8bb))
* **relay:** someone who took part on the web and then connects the computer whose clone joined with the invite keeps one place, and is not told a computer left; an address with too many wrong tries is asked to wait rather than told a valid link is gone, and waiting does not add tries; a colleague on the web is shown so in the app and at an empty desk; an answer its person gave themselves is not counted as the clone's, and the web page says whose answer is a clone's; a person's own invite limit is said as theirs, where invites are made; the invite page names who invited as the invite keeps it; an invite's name is printed to the terminal without control characters; both pages ask for Node.js 22.13 ([9ad722c](https://github.com/cgoinglove/clone-office/commit/9ad722cdfac9b41553a9714680aee351bfa88667))
* **relay:** the server's admin acts only on accounts in offices they own, a reset link is never an owner's or a Google account's and is told to its person, a lost Google lets only the admin in to mend it, joining asks unless this invite just made the account, Google starts at its own address, and a person in several offices picks the one shown ([6c95f8f](https://github.com/cgoinglove/clone-office/commit/6c95f8f202d3246fc53bb1d9718250e090c1655d))
* **relay:** wrong tries count an IPv6 caller by its /64 and the address the outermost of RELAY_TRUST_PROXY's proxies saw, a blocked address is never let go to make room, signing out from a join keeps the inviter's name, a password-off page that cannot act says so in its heading, and a reset link's notice reads well at one minute and once stopped ([1fd75cd](https://github.com/cgoinglove/clone-office/commit/1fd75cd6c6f31444b3a68c7ccc301f3b149eb6fd))
* **security:** the clone's write_file never writes through a link, a relay's links open only on its own address, a PDF preview is only a PDF, saved answers are found by their real path, two relays starting at once agree on the sealing key, and the invite cookie is secure on https ([2d42c32](https://github.com/cgoinglove/clone-office/commit/2d42c32ff63e828964b6b822c3029c19f60a74c4))
* **shell:** ↵ in search opens what matches and ⌘↵ asks, words asked while the clone answers wait in the box, the chat list stops at its cap, the drawer closes wherever it goes, removals keep their own clock and finish when the screen goes, keys follow the system, and Esc steps back from the folder list ([c3a47c8](https://github.com/cgoinglove/clone-office/commit/c3a47c881d3b7d097f7a2a0524852486a136ecc6))
* **shell:** a confirm holds while its step runs, Undo waits while the toast is pointed at, removals commit or come back when the screen goes, IME keys are left to the syllable, tooltips name their buttons, and the office drops what nothing draws anymore ([a4b62e7](https://github.com/cgoinglove/clone-office/commit/a4b62e786052741f3f91c2aa1c6bd6a9545ea197))
* **shell:** a tap just after an answer on a request's page lands nowhere new, / reaches the office's box, an archived chat's title is cut short in its toast, a held request names whose answer it waits for, and answers are cut with the shared clip ([663cc1a](https://github.com/cgoinglove/clone-office/commit/663cc1a0a3b66956931476422ef753b9f4296588))
* **shell:** after an answer goes the keyboard moves on and is told, the red button's focus reads, the solo rail uses the app's buttons, the phone keeps the desk after the ride, and "to decide" reads one way everywhere ([20eb79a](https://github.com/cgoinglove/clone-office/commit/20eb79ad757205951cbe008d1a52b370eb7e61c1))
* **shell:** an answer always goes once its Undo runs out, it is said to go to the person's own clone, the floor stays still as the lift opens, and a toast steps aside beside news cards ([6ce19d3](https://github.com/cgoinglove/clone-office/commit/6ce19d3e0a4302005ba13be55366fc49b902163f))
* **shell:** an answer in the person's name waits with Undo and a stray tap is not taken, the keyboard passes the column in a few stops, focus and grey text meet contrast, news stands above the box at the bottom, and new chat moves to ⇧⌘O ([8704baa](https://github.com/cgoinglove/clone-office/commit/8704baaad118a3f9ce60a525d9daaf866af27ac9))
* **shell:** an answer on a request's own page waits with Undo as on Home, toasts keep off the column, the lift opens on the person's desk clear of the board, an asked-back request names whom it waits for, and the ask boxes ring when the keyboard brings focus ([40c815c](https://github.com/cgoinglove/clone-office/commit/40c815cf059c4cf88d4f3caeafc454d446461ec4))
* **shell:** an answer on its way says so on its row with its own Undo and leaves the counts, the brand button's focus and dark fill meet contrast, toasts stand above news cards, and the keyboard keeps its place in the last few spots ([0d2faa7](https://github.com/cgoinglove/clone-office/commit/0d2faa73c5a992faa4ab5146b6fcff635f84402c))
* **shell:** the Undo beside an answer holds its one clock, the phone's office controls sit above its box, the person's framing survives the board, the last answer is told, toasts lift only over a card they meet, and each send names its recipient ([92edb98](https://github.com/cgoinglove/clone-office/commit/92edb98097f37ec8b2c141d3f2fed19c094d9f45))
* **shell:** what already waited when the office and the conversations' questions were first read is not news, and a confirm over Settings dims the dialog beneath it ([4e00c77](https://github.com/cgoinglove/clone-office/commit/4e00c7713fbdb64f31384d3596305f881e097406))
* **start:** a still office opens seated behind the card, names follow as typed, and the learn step fits a short window in English ([91a21c8](https://github.com/cgoinglove/clone-office/commit/91a21c8fd5ede020222e4186242f7bea05167365))
* **start:** the example question is brought over as soon as the step opens, the answer shown whole, marks silent to screen readers ([b362440](https://github.com/cgoinglove/clone-office/commit/b362440151b5e6993a7ce987a27faeffc09b1440))


### Performance

* a spinner turns on a layer of its own, so the page around it is not painted again every frame ([049616b](https://github.com/cgoinglove/clone-office/commit/049616baa6860e5ebbefd0bc8f4cf3b6c3a9bb24))


### Docs

* **guide:** a plan's usage limit, a model server that refuses, work across a closed laptop, and someone on the web as colleagues see them ([2d893cd](https://github.com/cgoinglove/clone-office/commit/2d893cd38df76d5a0083b452cecafaed070522f7))
* **guide:** a topic flow is looked for twice ([5a8cd3a](https://github.com/cgoinglove/clone-office/commit/5a8cd3a21459db81f1c19bf0d540ab5bfaa6f129))
* install Clone Office from the desktop app or with Node.js, side by side, with the first open of an unsigned app on each system, and what the desktop app keeps, asks and updates ([91d5cab](https://github.com/cgoinglove/clone-office/commit/91d5cab393917143682e8b627384a332c941399c))
* **office:** the files' headers say what they now draw ([f93e496](https://github.com/cgoinglove/clone-office/commit/f93e496dc7e7908daeca79f6817adf44de4ff7e1))
* **taste:** a screen meant to fit at once never grows when something is clicked ([f4a94cd](https://github.com/cgoinglove/clone-office/commit/f4a94cd384045097b722bf8422aa50ebdd3c37a0))
* **taste:** the clock's place on the left wall was the agent's choice; the board belongs apart, outside the room ([ee2cdd5](https://github.com/cgoinglove/clone-office/commit/ee2cdd55a170d94eae8bdf3a70212738d22752a6))
* **taste:** what runs always shows it, and messages are never outlined ([689df26](https://github.com/cgoinglove/clone-office/commit/689df26b067dba14510a54b75f6bf4a2708e9e21))
* the code map for recovering and naming shared skills ([b5d9836](https://github.com/cgoinglove/clone-office/commit/b5d9836a75528bd2ceaf69c72a7b8057a5bcfe8e))
* the column, search, keys, notices, archived chats and the plain lobby in the guide, the code map and the design rules ([4e4da9b](https://github.com/cgoinglove/clone-office/commit/4e4da9b82e1231aceff3c558d6babae6798b5d1f))
* the learn step's summary as it is now ([6ee047a](https://github.com/cgoinglove/clone-office/commit/6ee047ae2bfec62d3b742a263cf0650c46f3a1eb))
* the to-do list, helpers, the scratch folder and the backup model in the guide and the code map ([c3a9cb4](https://github.com/cgoinglove/clone-office/commit/c3a9cb4a4a68d720133f5f4ea12ce40afe86550e))
* what works today names long work as Claude Code does it and taking part on the web ([d213048](https://github.com/cgoinglove/clone-office/commit/d2130487ac956c95957a1441a7a6cc1cccd49172))

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
