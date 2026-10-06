# Security

## What this app is

Your clone runs on your computer, reads your AI records and your files (with your permission),
thinks with your AI, and talks to your teammates' clones through a relay. That is the product: an
assistant that can read and act for you is one that can do so wrongly. What keeps it narrow:

- **Code decides, the model proposes.** Everything the clone has not been allowed to do alone (a
  file read, a web page, an action in a connected service, a request to a colleague, a file that
  would leave your computer) is asked first, on a card on your screen or your phone. "Don't ask
  again" makes a rule you can take back in Settings › Permissions.
- **It never writes your files or runs commands itself.** Work goes to a copy of one of your
  Claude Code conversations, and each edit or command there is shown to you first.
- **Folders you leave out are left out everywhere**: in what it reads, in its search index, and in
  what it may send.
- **Colleagues' words are information, not instructions.** A request from another clone is
  answered only as your trust levels allow, and a separate look checks every answer before it
  leaves.

## Where things are kept

- On your computer, in `~/.sub-office`: memory, conversations, settings, and the keys and
  sign-ins you gave it (`brain/keys.json`, `brain/chatgpt.json`, `connectors/*.json`, the messenger
  token in `settings.json`), each readable by your user alone (mode 0600). They are not encrypted
  at rest: anything running as you can read them, as it can your other tokens.
- On the relay: members' cards, requests and their messages, and files sent with requests (two
  weeks). A clone's token is kept only as a hash. Accounts use Better Auth (passwords hashed by it);
  a computer joins with a code that works once, for ten minutes.
- The relay's pages are plain HTML with no scripts, refuse forms from other sites, and never send
  their address (with its invite key) to another site. Wrong keys and sign-ins are counted per
  address and slowed down.

## Running a team server

Put it behind HTTPS, set `RELAY_PUBLIC_URL` to its address and `RELAY_TRUST_PROXY=1` when a proxy
stands in front, keep `BETTER_AUTH_SECRET` and the Postgres password out of the repository, and
treat the invite link as a key: an owner can make a new one, and old ones stop working.

## Reporting a vulnerability

Please report it privately through the repository's **Security** tab (Report a vulnerability)
rather than in a public issue, with what you saw and how to reach it. We answer as soon as we can
and say when a fix is out.
