# Connectors: the services the mini-me works in

Under **Connectors** (커넥터) on their page they connect the services their mini-me may work in:
Notion, Linear, Jira and Confluence, GitHub, and Google's Gmail, Calendar, Drive, Docs and Sheets.
The mini-me reaches each one through the service's own MCP server, made by the service itself,
signed in as them. It works there in their conversations with it and in their flows; it never
uses them for a colleague's request.

## Connecting one

- **Notion, Linear, Jira and Confluence:** **Connect** (연결하기) opens the service in a new tab;
  they sign in there if they have not, and approve. The tab says when it is done and can be
  closed; the page shows **Connected** (연결됨).
- **GitHub:** it takes a personal token. **Make a token** (토큰 만들기) opens GitHub's page for a
  fine-grained token: they give it a name, choose the repositories it may reach and what it may do
  there (read-only is enough to look things up), make it, copy it, paste it on the page and press
  **Save** (저장).
- **Google:** first someone on the team registers an OAuth client for the team, once (below).
  Then everyone presses **Connect** next to each Google service they want and approves with their
  own Google account.

What they connect is theirs alone: their sign-in, kept on their computer only, in a file only they
can read. Colleagues connect their own.

## Google's client, once for the team

Google does not let an app register itself, so a team registers its own client in Google Cloud.
Google's MCP servers are still in developer preview: the one who does this needs a Google Workspace
account that joined Google's preview program. **Register the client** (클라이언트 등록하기) walks
through it, a page of Google Cloud's console at a time:

1. Join Google's Workspace Developer Preview Program with the Google Workspace account. Google
   answers within a couple of days.
2. Turn on the APIs in a Google Cloud project, one link for all of them.
3. In Branding, give the app a name; in Audience, choose Internal, so only people in their
   organization can use it.
4. In Data Access, add the scopes the page shows (**Copy the scopes**, 범위 복사).
5. Create a client of the type Desktop app and download its JSON file.
6. Choose that file on the page (**Choose the JSON file**, JSON 파일 고르기). With **For everyone
   in the office** (오피스 모두에게) ticked, everyone in their office gets it, and the page shows who
   registered it; someone using sub-office alone keeps it for themselves.

The office keeps only the client (its ID and secret), never anyone's Google sign-in.

## What the mini-me does with them

It asks before it uses a service, on a card that names the service and what it would do there,
the first time it wants each kind of action ("search Notion", "read a mail"). They allow it once,
or tick that it may do that from now on without asking; refusing is always possible. A flow can
use only what they already let it do alone, since nobody is there to ask.

When a colleague's mini-me asks it something, it does not look in their connected services: what
is in their mail or documents does not go out to colleagues by itself.

## Disconnecting

**Disconnect** (연결 끊기) forgets their sign-in on this computer at once. To take the access back
at the service too, they remove sub-office there: in Notion, Settings, Connections; in their
Google account, Security, third-party access; in GitHub, the token on its tokens page.

## When it does not work

- **"The connection ran out"**: the service ended the sign-in (a changed password, an expired
  token, removed access). **Connect** again.
- **Google asks again every week:** the client's app is set to External and is still in testing,
  where Google ends sign-ins after seven days. Internal, for a Google Workspace organization, has
  no such limit.
- **Google says the app is not verified, or access is blocked:** for an Internal app this does not
  happen to people in the organization; someone outside it cannot use the team's client.
- **The Google services stay greyed out:** nobody has registered the team's client yet.
