# A team server

Clones talk to each other through one small server, the team's relay. It carries cards and
requests only: what each clone knows and every conversation stay on each person's own computer.
One person on the team sets it up once; everyone else just opens the invite link they are sent.

## Do they need one?

- **Everyone is on the same Wi-Fi or office network**: no. Settings › Office › **Open on this
  computer** (이 컴퓨터에서 오피스 열기) makes their own computer the office, with nothing to
  install (`office.md`). It rests while that computer sleeps or the app is closed, so a computer
  that stays on in the office, with **Start with this computer** (컴퓨터와 함께 켜기) on, is a good
  home for it.
- **Someone works from home, another office or a phone network**: yes, a server they can all reach
  on the internet. The rest of this page is for that.

## A server on the internet, with Docker

About fifteen minutes, once. What they need:

- **A small Linux server** with Docker: any cloud's smallest machine with 1 GB of memory does
  (Hetzner, DigitalOcean, Vultr, AWS Lightsail and the like). Most offer an image with Docker
  installed already. Its cost is between them and that cloud; Clone Office charges nothing.
- **A name for it** that points at the server's address: a domain they own with an A record to the
  server's IP (`office.example.com`), or, with no domain, the IP itself as a name under sslip.io
  (the server at `203.0.113.5` is `203-0-113-5.sslip.io`). A domain of their own is steadier.
- **Ports 80 and 443 open** in the cloud's firewall: HTTPS needs them, and the certificate is
  fetched over them.

Then, on the server:

```sh
git clone https://github.com/cgoinglove/clone-office.git
cd clone-office
printf 'DOMAIN=%s\nPOSTGRES_PASSWORD=%s\nCOMPOSE_PROFILES=https\n' office.example.com "$(openssl rand -hex 24)" > .env
docker compose up -d
docker compose logs relay
```

The third line writes the server's settings once into `.env` in that folder, with a random
password for its database (only the server uses it), so every later `docker compose` command
there reads them by itself.

1. The last line prints **set up this server** with a link (`https://office.example.com/setup/…`).
   Opening it makes their account, the server's admin. It works once, for a day; restarting the
   server prints a new one while there is no admin.
2. On their page there, **Invite a teammate** (동료 초대) makes a link for one person, for a week.
   They send it however they like. Its page walks the teammate through setting up, from installing
   Node.js to the one line that joins the office.
3. Their own clone joins the same way, or from their page's **Connect your computer** (내 컴퓨터
   연결하기).

The `https` part puts Caddy in front of the relay: it gets the certificate, renews it and sends
everything on to the relay, and the relay gives links with that address. Sign-in with Google, if
they want it, is set up on the same page later (`office.md`).

**Keep two things safe.** Docker keeps the office in two volumes: `postgres` (everything the server
holds) and `relay-keys` (the key that seals team API keys and sign-in secrets). A copy of the
database is of no use without that key, so back up both, and keep the key's copy apart.

**Updating**: in the same folder, `git pull`, then `docker compose up -d --build`. People's accounts, offices and invites stay.

## Letting their own AI do it

Someone with Claude Code, Codex or a similar assistant can hand it the job. They paste this into
it on their own computer, with their server's details, and stay to answer what only they know:

```text
Set up a Clone Office team server for me on my Linux server (I will give you how to reach it).
Follow https://github.com/cgoinglove/clone-office/blob/main/guide/team-server.md: install Docker
if it is missing, clone the repository, write .env there with DOMAIN=<the name>, a long random
POSTGRES_PASSWORD and COMPOSE_PROFILES=https, and run docker compose up -d.
Check that https://<the name> answers, then give me the setup link from `docker compose logs relay`
and tell me where the two volumes to back up are. Ask me before opening firewall ports or
changing DNS, and never show me the password in plain text twice.
```

## Without Docker

`npx -y clone-office relay` runs the same relay with Node.js 22.13 or later: with
`--database <a Postgres URL>` (or `DATABASE_URL`) it keeps the office there, without one in a
`relay-data` folder beside it. In front of it they put their own HTTPS proxy and set
`RELAY_PUBLIC_URL` to the address people reach (`https://office.example.com`) and
`RELAY_TRUST_PROXY=1` (2 with a CDN in front of the proxy).

## When it does not work

- **The link does not open from outside**: the name does not point at the server yet (a new DNS
  record can take some minutes), or ports 80 and 443 are closed in the cloud's firewall.
  `docker compose logs caddy` says which.
- **The setup link is gone**: restarting the server prints a new one while it has no admin
  (`docker compose restart relay`, then `docker compose logs relay`).
- **"Set DOMAIN to the name that points at this machine"** or **"required variable
  POSTGRES_PASSWORD is missing"**: the command ran outside the folder with `.env`, or `.env` lacks
  that line.
- **A teammate's line says it cannot reach the office**: they can open the invite link in their
  browser to check; if the page does not open there either, it is the server, not their computer.
