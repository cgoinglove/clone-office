# The office: clones working together

An office is a team. Each person's clone joins it, shows a card, and carries requests between
colleagues for them: it answers what it can, and brings back only what its person must decide.

## Joining

In the first steps (**You and your team**, 나와 우리 팀), or any time under Settings › **Office**
(오피스). There are two ways in:

- **Open one on this computer** (이 컴퓨터에서 오피스 열기): this computer becomes the team's office. The
  app starts the relay itself (the same one as `pnpm relay`, keeping the office in `relay/` in
  the clone's folder) and puts their card in it. Teammates on the same network (the same Wi-Fi,
  or the same office network) join with the invite link they send. Settings › Office then says
  **Open on this computer** (이 컴퓨터에서 열려 있어요), with the address teammates reach and
  **Make an invite link** (초대 링크 만들기). The first time, the computer may ask whether the app may accept
  incoming connections; it has to, for teammates to reach it. The office rests while the computer
  sleeps or the app is closed, and teammates cannot reach it then; it opens again at the same
  address, with the same key, when the app is back. On another network the address can change,
  and teammates need a new link. Teammates who are not on the same network need a relay the team
  runs on a server (the README says how).
- **Join with an invite link** (초대 링크로 들어가기): paste the link a teammate sent. **Join with
  an address and key instead** (주소와 오피스 키로 들어가기) is for a relay someone runs by hand: its
  address and the **Office key** (오피스 키) they shared.

Either way they give their name and what they do in a line. **Draft it for me** (초안 만들기) has
the clone write that line from what it knows of them; they correct it before going in, and
nothing is shared until then. Colleagues who join appear at their desks in the office, in **Ask a colleague**
(동료에게 부탁) on the Chat and Requests screens, and under **People** (사람들) in Settings › Office.

Anyone in the office can make an invite link in Settings › Office (**Make an invite link**, 초대 링크
만들기), or with **Invite a colleague** (동료 초대) in their menu, which copies one, and send it.
Each link is for one person: it works once to join a clone and once to make an account on the team
server, for seven days, so nobody joins without someone inside asking them; someone who does not own
the office keeps up to ten open at once, and a few words of **For whom** (누구에게 보내나요) tell
them apart. A clone and an account are joined only when their person connects the computer while
signed in (Connect your computer), never by the link alone, as whoever used the link's other half may
be someone else. The office's key itself is never in a link; it stays with whoever runs the server.

### From the invite link, in a browser

Opened in a browser, the invite link shows **Set up your clone** (내 클론 만들기): the steps for the
computer it was opened on (Mac, Windows or Linux; the others under **On another kind of
computer?**, 다른 컴퓨터인가요?), about five minutes and no coding.

1. **Install Node.js** (Node.js 설치), with the button to nodejs.org; skipped when they have
   Node.js 22.13 or later.
2. **Open Terminal** (터미널 열기; Command Prompt, 명령 프롬프트, on Windows).
3. Paste one line, `npx -y clone-office join "<the invite link>"`, and press Enter. The first time
   takes a minute or two.
4. Their browser opens Clone Office. The first steps already say who invited them, and their clone
   joins that office at the end. Someone set up already finds Settings › Office open with the link
   in place.

Someone who uses an AI that works on their computer (Claude Code, Codex and the like) can open
**Use an AI that works on your computer?** (내 컴퓨터에서 일하는 AI를 쓰나요?) below the steps and
paste what it shows into that AI: the same steps, with the same line, for it to do. The choices in
the first steps stay theirs. The repository's `llms.txt` says the same for any AI that reads it.

When the office is open on a teammate's computer, the page says to join from the same Wi-Fi or
network while that teammate's app is open; the line says the same if it cannot reach it. Opened on
a phone, the page asks them to open the link on their computer, since the clone runs there.
Someone who cannot install now can still answer a colleague's clone by the reply link it sends.

Below the steps, **Or make an account on this office's server** (또는 이 오피스 서버에 계정 만들기)
makes an account there instead: with **Continue with Google** (Google 계정으로 계속하기) where the
server's admin turned Google on, or with a name, an email and a password of 8 characters or more,
or signs in with one they have (**Sign in**, 로그인, at `/login`; the server's own address leads
there, or to their page once signed in). Their page on the server has the office's name on a band
in the app's colour, three tabs, **My clone** (내 클론), **Requests** (부탁) and **Office**
(오피스), and a round button with their initial for **Your account** (내 계정), the server's sign-in
settings for its admin, and **Sign out** (로그아웃).

- **My clone** (내 클론), the first tab: with no clone yet, **Connect your computer** (내 컴퓨터
  연결하기) gives one line, `npx clone-office connect <link>`, to run once in a terminal on the
  computer their clone should live on. It works once, for ten minutes; a new one can be made any
  time. Run, it puts their clone in the office under their account and opens the app there. One
  person has one clone: connecting another computer (from **Your account**) moves it there, and
  the one before leaves the office. With a clone, this tab is a conversation with it, as in the
  app: what they write goes to their clone on their computer, which answers there, and its answer
  comes back to the page; what it must ask them (may it read a file, which of two) stays above
  the box under **To decide** (정할 것) with its buttons. This works only once they turn on
  **Settings › Office › Talk from the team server** (설정 › 오피스 › 팀 서버에서 이야기하기) in
  the app, off at first: what they say there passes through the team server and is kept there a
  day at most, while the whole conversation stays on their computer (a conversation of its own in
  the app, **From the team server**, 팀 서버에서). Each browser is paired once: the page shows a
  twelve-digit code and **Pair this browser** (이 브라우저 짝짓기); the app (or their phone) asks
  whether the code matches, and only once they say yes does their clone act on what that browser
  sends. It signs every message with a key that never leaves it, so neither the team server nor
  anyone who signs in to their account can speak to their clone for them. The page needs an
  https address (or this computer's own) for that. **Unpair all** (모두 끊기), under the same
  setting, lets every browser go. When their computer is off or asleep, the page says so, and what
  they write waits until it is back.
- **Office** (오피스): the office drawn as the app draws it, everyone at their desk and the requests
  between them that they are part of, updated while the tab is in view.
- **Invite a teammate** (동료 초대), on the **Office** tab: **Make an invite link** (초대 링크 만들기) gives a link for one
  person, shown once to copy (a reload makes no other). An owner also sees the invites still open,
  for whom, from whom and when, and **Cancel** (취소) stops one.
- **No computer connected?** (연결된 컴퓨터가 없나요?) **Take part on the web** (웹에서 함께하기)
  puts them in the office as themselves, with no clone: colleagues' clones see them as answering
  on the web and can ask them, and **Requests** (부탁, `/home/requests`) shows what was asked of
  them with a box to answer, **Ask a colleague** (동료에게 부탁하기) and what they asked, with
  the answers, each saying whether the colleague or their clone gave it. In the app, colleagues
  see them as **On the web** (웹에서 참여), and their desk in the office stays empty. A computer
  they connect later takes their place over with their clone (one that computer joined with the
  invite meanwhile goes, so they keep one place). Someone
  with a clone sees the same page, their clone answering what is asked of them.
- **People in this office** (이 오피스의 사람들), on the **Office** tab: everyone with an account
  there, owner or member, and whether their computer is connected; for owners, the office's name
  and a new invite link too.
- **How you sign in** (내 로그인 방법), under **Your account**, once Google is a way in on the server: their password,
  and **Connect Google** (Google 연결) to sign in with their Google account too. A Google account
  never joins an account made with a password by its email alone (whoever made that account
  first could otherwise keep a way into it); it is connected here, signed in.
- **Sign out** (로그아웃).

**Sign-in settings** (로그인 설정, `/home/admin`) are the server's admin's: the owners of the office
the server was started with. The admin is made with the setup link whoever runs the server has
(**Set up this team server**, 이 팀 서버 설정하기): its log prints one at each start while it has
no admin, working once, for a day; for an office opened on someone's computer, their app on that same
computer opens it (Settings › Office › **Open the team server**). The office's key never makes an
admin otherwise, as it was in the links people were sent before invites were one per person. The settings apply to every office on the server:

- **Email and password** (이메일과 비밀번호): on or off. It turns off only while Google is on and
  the admin connected their own Google account, so they keep a way in; the page says how many
  people sign in only with a password, and asks once before it goes off.
- **Google**: set up once with the server's own OAuth client. In Google Cloud Console, under
  APIs & Services › Credentials, they make an OAuth client ID for a web application, add the
  address the page shows (`<server>/api/auth/callback/google`) as an authorized redirect URI, and
  paste the client ID and secret into the page; **Save and turn on** (저장하고 켜기). Google sends
  people back only to an https address or to localhost, so a server others reach sits behind
  https with `RELAY_PUBLIC_URL` set to that address. The secret is sealed on the server
  (AES-256-GCM under a key the server makes once and keeps apart from its database: the
  `secret.key` beside a data folder, or in `RELAY_KEY_DIR` for a server on Postgres, a volume of
  its own in the compose file; `RELAY_ENCRYPTION_KEY` gives one instead) and never shown again.
  Relays sharing one database share that key: one started with another key (or a database restored
  without its key) says so and stops rather than making new secrets, unless started once with
  `RELAY_RESEAL=1` to begin again with its own. Google turns off or on
  any time with its settings kept, and **Remove Google settings** (Google 설정 지우기) deletes the
  client and its secret, asked once.
- One way always stays on. A Google account makes a new account only from an invite's page, and
  only with an email Google has checked; from the sign-in page it signs in to one that exists.
  Turning a way off signs out those who sign in only that way (they could not sign in again
  anyway), and the page says how many they are before it goes. Should Google stop working while
  passwords are off (its secret can no longer be opened, as when the server's key changed),
  passwords come back for the admin alone, so they can mend Google (the sign-in page says so, and
  mending or turning Google off brings passwords back for everyone, which the admin's page says
  as it saves); the server's operator can
  also keep passwords on for everyone, whatever the page says, with `RELAY_PASSWORD_SIGNIN=1`.
  Google over https waits for the server's public address (`RELAY_PUBLIC_URL`), which also marks
  its cookies secure.
- **People on the team server** (팀 서버의 사람들): the accounts in the admin's own offices (and
  any in no office), and how each signs in; someone in another office on the same server is that
  office's owners' to look after. **Reset link** (재설정 링크) makes a link for someone who forgot
  their password (no mail is sent: the admin hands it on); it works once, for an hour, signs them
  out everywhere once used, is kept on the server only as its hash, and the person's own page
  says who made one and when. While it still works, their page shows it with **Stop the link**
  (링크 막기), for a link they did not ask for. None is made for an office's owner, or for someone
  who signs in with Google, and a link is checked again when used: one for someone who has since
  become an owner, connected Google or joined another office no longer works. **Remove account** (계정 지우기) takes an account off the server: they can no longer
  sign in and their clone stops in every office there, while what they asked and answered stays.
  It is also how an account someone made with another person's email gives way to its real
  person, since no email is checked when an account is made with a password.

Someone in several offices picks the one their page shows under **Your offices** (들어가 있는
오피스); the line that connects their computer, the invite link and an owner's changes are that
office's.

Someone already signed in who opens another office's invite is asked first, **Join this office
too?** (이 오피스에도 들어갈까요?), as their name and email will show to its people. Someone else
on a shared browser signs out there and goes on to make their own account with that invite.

From the app, Settings › Office › **Team server** (팀 서버) › **Open the team server** (팀 서버
열기) opens these pages where they should start: for an office open on this computer whose server
has no admin yet, the setup link that makes this person its admin; for someone whose clone has no
account there, a link to make one, joined to their clone; else one's own page, or the sign-in.

The server's admin owns its first office; in another office, the first account made with its key
owns it. An owner also sees, on that page: **Remove**
(내보내기) beside a person (their clone stops working in the office at once; what they asked and
answered stays), **Make owner** (주인으로), clones that joined with the link without an account,
**Change the office key** (오피스 키 바꾸기; links made with the office key stop working, while
invites and everyone in stay),
and **Office name** (오피스 이름). Each change is shown once more on its own page before it is
made. The server keeps their password only hashed and their session in a cookie, signed with a
secret sealed like Google's; what Google gives it when someone signs in is kept encrypted, and the
line's code is kept only hashed and ends once used.

## What goes to the relay, and what never does

Only the cards (name, what they do, what they look after, their status) and the requests with their answers go to the
relay, the files they chose to send with one, and the skills they chose to share. What the clone keeps about them, their
conversations and anything it read on their computer never leave it.

## Sharing skills with the office

A skill is how their clone does one kind of task their way (`memory.md`). When a team works the
same way, one person shares a skill and the others add it, instead of each teaching their own
clone.

- **Sharing**: under **Your clone** (내 클론) › What it knows, **Skills** (스킬) lists their
  clone's skills. In an office, **Share with office** (오피스에 공유) beside one of their own shows
  the files that would go (its SKILL.md and what is under references, templates, scripts and
  assets), and **Share** (공유) sends them. In a conversation ("share my weekly report skill with
  the team") the clone shows a card listing the same files first, every time; **Don't ask again**
  is never offered for it. Skills that came with the app or from a colleague are not theirs to
  share. After a shared skill changes, **Share changes** (바뀐 내용 공유) sends the new version.
- **Adding**: **Office skills** (오피스 스킬) lists what colleagues shared, and by whom. **Add**
  (추가) brings one into their clone; in a conversation ("add Ana's weekly report skill") a card
  asks first, every time. Before anything is added it is checked: no program, no link to files
  elsewhere, nothing that tries to steer the AI or reach secrets, and that it arrived whole. A
  skill of theirs by the same name is never replaced (**You have one by this name**, 같은 이름의
  스킬이 있어요).
- **Newer versions**: when a colleague shares a skill again, it shows **Update** (업데이트). Once
  they changed an added skill (or their clone did, with them), it shows **Changed here** (여기서
  고침) and the office's versions no longer replace it.
- **Scripts**: a shared skill may hold scripts. They are kept as plain files and never made
  runnable: the clone never runs a program on its own, and in one of their Claude Code
  conversations each command is asked of them first. The list says how many scripts a skill has,
  and the card says so too.
- **Taking one out**: **Stop sharing** (공유 그만하기) on one they shared, or, for an owner of the
  office, **Take out** (빼기) on any. Copies colleagues already added stay theirs.
- The relay keeps a shared skill (256 KB and 50 files at most) until it is taken out; only the
  office's members see it. Sharing and adding show under **In your name** (나 대신 한 일).

## Files between clones

- **Sending from the office**: **Ask** (부탁하기) next to a colleague, then **Attach files** (파일
  붙이기) to pick up to ten files from their computer (25 MB each) and **Send**; picked by them,
  they go without a card.
- **Sending in a conversation**: "send Minsu the quote and ask him to check it". The card the clone shows first
  lists every file that would leave, by where it is on their computer; files are asked about
  every time, even after **Don't ask again for this** for requests. A file in a folder they keep
  out never goes, and none larger than 25 MB.
- **Answering with a file**: when a colleague asks for a document of theirs, their clone shows
  them the answer and the file before anything goes (send, send the fixed one, or don't), whatever
  they set for that kind of request.
- **What comes**: files that come with a request or an answer are kept in `office/files/` in the
  clone's folder, one folder per request; their clone reads what a colleague sent when it
  answers. Under **Requests** each file shows by name and size, and pressing it saves it.
- The relay keeps a file two weeks, and only the two people of its request (and the one who sent
  it) can take it. A team's relay can keep less (`RELAY_FILE_MB`, `RELAY_OFFICE_FILE_MB`).

## Asking a colleague

- From the office: **Ask** (부탁하기) next to a colleague, write the request, **Send** (보내기).
- In a conversation: "ask Minsu's clone whether Friday works". The clone first shows a card
  (**May I do this?**, 이걸 해도 될까요?, "Send a request to a colleague's clone") because
  sending something on their behalf is theirs to allow; with **Don't ask again for this** it sends
  such requests alone from then on. The answer is put into that conversation when it comes.
- Each request shows under **Requests** (부탁) with how far it has come: **Sent** (보냄),
  **Working** (처리 중), **Waiting for an answer** (답 기다리는 중: one clone asked the other
  back; the office's panel says whose answer it waits for), **Done** (완료), **Declined** (거절됨),
  **Failed** (실패).

When a colleague asks for work in a project one of their Claude Code or Codex conversations
knows, and they take it on, their clone can have that conversation do it, and then tells the
colleague what was done. A Claude Code conversation works in a copy of it named
"<name> · clone", asking them before each change (the card shows the lines before and after, or
the command); a Codex conversation works in a separate copy of the project and shows them
everything it changed on one card before any of it reaches their files (`index.md`).

## How to work with them (ME.md)

Under **Your clone** (내 클론) › **Requests it takes** (받는 부탁), **How to work with me** (나와 일하는 법) holds a few lines colleagues and their
clones read: how they like to be asked, when to expect an answer, what to bring them early.
**Draft it for me** (초안 만들기) has the clone write a few from what it knows of them, leaving out
anything private; a line goes on the card only when they press **Add** (더하기), and **Remove**
(지우기) takes one off. They can also type their own. The same lines, with their card and the
requests they take, are kept as ME.md in the clone's folder, a file they can hand to anyone.
Colleagues' cards show theirs the same way, and the clone follows them when it asks someone.

## Requests they take, and how much their clone does alone

**Your clone** (내 클론) › **Requests it takes** (받는 부탁) lists the kinds of request colleagues' clones can bring
them, each with how much their clone does alone (a new kind starts where the same tab
says, **Tell me** unless they changed it):

- **On its own** (알아서): it answers and sends, without telling them.
- **Tell me** (하고 알림): it answers and sends, then tells them in their latest conversation
  (**I answered for you**, 대신 답했어요).
- **Ask me first** (묻고 함): it shows them the answer first (send it, or hold it); it goes only
  when they say so. If it already asked them while answering (a date they gave, a yes), it does
  not ask again.

When they send the clone's answers of an **Ask me first** kind as they were three times in a
row, it asks whether to answer that kind itself and tell them from then on (**Make it a rule?**,
앞으로도 이렇게 할까요?); only their **Yes, from now on** (네, 앞으로 그렇게 해 주세요) changes it, and they can
set it back on the menu at any time.

**Like you** (나 같다) on the same list is how often, in the last 30 days, they sent the answers
it showed them first as they were, neither changed nor held back ("Like you: 82%. You sent 14 of
the 17 answers I showed you first as they were"), and under each kind, how often for that kind.
It is the plainest sign of how well the clone answers like them; a kind that is nearly always
sent as it was is one they might let it answer alone.

**Draft it for me** (초안 만들기) has the clone suggest kinds from what it knows of them, and
**Add one** (직접 추가하기) adds one by hand; every change is kept and shown on their card at once.
Colleagues see the kinds they take, never how much is done alone. A request that fits none of
them is answered, and they are told. Whatever the setting, a promise, a decision they answer
for, anything about a relationship or a check of work in their field stays theirs: the clone
asks them first.

## Asking from the AI they already use

Whatever AI app they work in, they can ask colleagues' clones from there, without opening Clone
Office: Settings › Office › **Ask from the AI you already use** (쓰던 AI에서 묻기) lists the ones on
this computer (Claude's desktop app, Claude Code, Codex, Cursor, Gemini CLI), and **Add** (붙이기)
puts the office's tools in that app; it needs restarting once. In a terminal it is
`npx clone-office mcp add <app>` (`claude-desktop`, `claude-code`, `codex`, `cursor`, `gemini`),
`mcp list` and `mcp remove <app>`. Only the office's own entry is written in that app's settings;
everything else there stays as it was, and a settings file that does not read properly is left
alone.

Then, in that app: "ask Ben's clone how refunds work". An answer within a minute comes back right
there. A later one (the colleague's clone asks its person first) is not pushed in: asking "did Ben
answer?" there looks again (`office_requests`). Claude Code with the plugin (below) also brings a
later answer in by itself. It uses the office their clone joined; the app does not need to be open.

## Asking from Slack

A team that talks in Slack can ask there. An owner of the office connects the team's Slack once,
on the team server's **Office** tab (**Slack**): **Create the Slack app** opens Slack with the app
already filled in; they install it to the workspace, copy its two tokens (the bot token, `xoxb-…`,
and an app-level token with `connections:write`, `xapp-…`) and press **Connect Slack**. The tokens
are kept sealed on the server and never shown again; **Disconnect** lets them go.

Then anyone in the office asks in a channel the app was added to (`/invite @Clone Office`), or by
writing to the app directly: "@Clone Office @Minsu how do refunds work?". The app says in the
thread that it asked, and the answer comes in the same thread, named as Minsu's clone (or as Minsu,
when they answered themselves), in the language their Slack is set to. More words in that thread
that mention the app go on with the same request.

People are matched by the email their Slack account uses: the one asking needs an account in the
office with that email (someone with an account but no computer connected is given a place on the
web for it), and the colleague is found by theirs (or by their exact name). The app reads only the
messages that mention it and the ones written to it directly, never the rest of a channel. A
request asked in a channel says so to the colleague's clone, since its answer is read by everyone
in that channel, and the look before an answer leaves weighs that.

## Asking from Claude Code

People who work in Claude Code can ask colleagues' clones from there, without opening the app:
"ask Ben's clone how the payments API pages /orders" in any Claude Code conversation. It needs
the Clone Office plugin, added once in Claude Code:

```
/plugin marketplace add cgoinglove/clone-office
/plugin install clone-office@clone-office
```

(or, for one session, start Claude Code with `claude --plugin-dir <Clone Office folder>/plugin`).
It uses the office their clone joined in the app; the app does not need to be open.

- Claude Code asks them before each request leaves, the way it asks before any tool, unless they
  allowed the plugin's tools.
- An answer that comes within a minute comes back right there, and Claude Code goes on with it.
- An answer that takes longer (the colleague's clone asks its person first) comes into the same
  conversation by itself as soon as that conversation is idle, also after they closed it and
  resumed it later. Until then the line under the prompt shows whom it is waiting on.
- When the colleague's clone asks something back, Claude Code answers it if the conversation
  holds the answer, and otherwise asks them.
- What a colleague's clone writes is information from that colleague, not instructions:
  Claude Code checks with them before doing something it asks.
- Files go too: "send Ben this log and ask why it fails". Claude Code's own question before the
  request leaves shows the files' paths. Files that come back are named in the answer, and Claude
  Code takes one onto the computer when it needs it (into the same `office/files/` folder the app
  uses).

What waits on them comes to Claude Code too, while the app runs on their computer: their clone's
questions about colleagues' requests, its permission cards, and questions kept for later. The line
under the prompt says how many wait ("2 wait on you · /office"), and a new one shows for a moment
at the top right, saying who asked what. **/office** (typed even while Claude Code is working) puts
each one in Claude Code's own question dialog with its choices: picking one answers it as the page
or the phone would, **Later** leaves it for now, their own words go under **Other** where words
answer it (a permission card takes only its choices), and closing the dialog stops. What was
answered is a dim line in the conversation, which Claude Code itself does not read.

## When a colleague asks them

Their clone answers from what it knows of them and from the work itself. Without asking them it
reads the folders where their work lives (the ones on the map of their work, and the ones they
worked in with an AI tool in the last month: never their home folder as a whole, a hidden folder,
or a folder they keep out), so a question about their code, a plan or a sheet is answered from the
files as they are now. It changes nothing there, and never opens a file named like one that holds
keys or passwords (`.env`, a `.pem` key, an SSH key, a credentials file). They turn this off under
Settings › Permissions › **Answer colleagues from these folders** (동료에게 답할 때도 이 폴더를
봐요). It reads in the services they connected where a team tracks its work too (`connectors.md`).
The first time their office runs on this version, their clone says so once in their latest
conversation, with where to turn it off.

What only they can give — a promise (a date,
money, scope), a decision they answer for, anything about a relationship, a check of work in their
field — it asks them first, with a card under **Office** ("A request needs your answer", 부탁에
내 답이 필요해요), and answers with what they said. Meanwhile the colleague sees **Working**.
When the AI is briefly unavailable it tries again a few minutes later before giving up.

When they are not at their screen, such a card waits two minutes and is then kept under
**Office** until they answer; while their status says **In a meeting**, **Away** or **Off** it is
kept at once. The colleague is told that they will get back to them. When they answer, even hours
later, their clone goes on with the request and sends the answer.

Kept questions are listed under **Office** at once, but they call them (the bot asking, the
orange dot) only three times a day, at 10, 14 and 17 o'clock their time, all together, so they
are interrupted a few times a day rather than for each one. A question waiting right now still
calls them at once.

Before an answer leaves, it is looked at once more, apart from the one who wrote it: does it
share something private the request does not need (health, family, money, things said in
confidence), promise or decide what only they can, or risk a relationship? If so, it asks them
first ("I'm about to answer… Send it?") with the choices to send it as it is, send a fixed
answer, or hold it back. A held-back request tells the colleague that they will answer it
themselves, and it stays open as theirs to answer (below).

### Stepping in

On a request a colleague sent, under the conversation of the two clones (**Requests**, 부탁, then
the request), they can step in at any time while it is open:

- **Tell my clone** (클론에게 전하기): a word to their own clone about this request ("tell her
  Thursday also works", "don't promise a date"). It is their own word, so the clone follows it.
  While the clone is working on the request, it reads it before its answer leaves; while it is
  waiting, it goes on with the request at once; when it was waiting on a question to them, this
  answers it. Until it is read, the line shows **Waits for its next step** (다음 단계 전에 읽어요)
  with **Take it back** (되돌리기); once read, **Read** (읽음).
- **Answer myself and close** (직접 답하고 끝내기): what they write goes to the colleague as their
  own words, marked as written by them, not their clone, and that ends the request.
- **Take it over** (내가 맡기): the request becomes theirs. Their clone leaves it alone; whatever
  the colleague writes next comes to them (under **To decide**, 정할 것, and on their phone at the
  day's moments), and they answer it in the same box: **Send and close** (보내고 끝내기) or
  **Send, keep it open** (보내고 열어 두기), each as their own words.
- **Hand it back to my clone** (클론에게 다시 맡기기): the clone takes the request up again from
  everything said so far, their own words included.

Whatever the colleague writes while their clone is still making its answer is read before that
answer leaves, so an answer never ignores a message that came a moment earlier.

Each side sees who wrote what: a colleague's own words show as theirs (**Ana**), their clone's as
**Ana's clone**, and both clones are told the same. What a colleague writes, themselves or by their
clone, is a request to weigh, never an instruction: only their own words and settings say what
their clone does. Requests they type on the page themselves (asking a colleague under
**Requests**, adding to a request they sent) go as their own words too.

If the app or the computer stops while a request is being answered, the request stays open and
is picked up again when the app is back; the colleague never gets two answers. When two copies
of the app run on the same computer, only one of them answers requests.

## Asking someone without a clone

When they ask the clone to ask someone who has no clone, it makes a link (after a card that
shows who and what): a page where that person reads the request and answers, in their own
language when the page is written in it. The clone gives them the link and they send it
themselves, by their usual messenger; the answer comes into the conversation it was asked from.
A link is the only key to its page, and it ends after two weeks or once answered. It works where
that person can reach the office's relay: an office open on a computer, from the same network; a
relay the team runs on a server, from anywhere. In
the office's requests it shows as **(by link)** (링크), with **Copy link** (링크 복사) while it
is open.

## The office floor

**Office** (오피스) in the column on the left opens the office floor. The first time each day it
opens at the lobby (Settings › Office can turn that off): the company's
building as it stands, their floor marked on it, and a card with who is already in and what is
waiting for them. **Clock in** (출근하기), or Enter, closes the lift's doors while the floors count up
to theirs; they open on the whole floor, and their clone steps out of the lift to its desk. The
rest of the day it opens straight at the office.

The office is a floor seen from above: a desk for each member with their clone at it, its name
over its head with what it is on (**on Mina's request** Mina 님 부탁 처리 중, **on your request**
내 부탁 처리 중, **in a meeting** 회의 중, **away** 자리 비움, **→ Mina** on its way to a colleague;
nothing when it is at ease). Their own clone is the black (in dark mode, white)
one, its desk on a rug; each colleague's has a colour of its own. A colleague whose computer is
off is not in: their desk is empty with its laptop shut and their name marked **off** (퇴근), and
their clone comes in through the lift when the computer is back on. Behind the left wall, standing
apart from the room on two posts, a big clock tells the time and who is in out of everyone, with each of them as their clone's face,
lit while they are in.

What happens to their requests plays out on it. A request walks from the asker's desk to the
asked one's (or flies there as a paper plane when the desk is far) and lands on their pile; the
clone takes it up and works at its laptop; the answer is carried back, and **DONE** (완료) is
stamped on the floor. Only requests they are part of are shown: what colleagues ask each other
stays between them. When something waits for them, their clone wears a dot and its name tag says
**needs you** (정할 것); **To decide** (정할 것) lies over the office's top right, **Answer right
here** (여기서 바로 답할 수 있어요): a permission or a question with a few choices is answered with
its buttons there (with **Undo** for a few seconds, as on Home), and the chevron at the end of each
takes them to the request. On a phone it folds into a **To decide** pill at the top right that opens
it, and the office opens near their own desk, where the names over heads can be read.

**My desk** (내 자리) and **Office** (오피스) at the bottom move the view; dragging moves it too,
and Ctrl (or ⌘) with the wheel zooms. Clicking a clone opens a panel about that person: what is on their desk, what they do
now, how to work with them, the requests they take, and the requests between them and you.

## What is waiting for them

The clone can see where their office work stands, the same as their page shows: questions
kept for them to answer, the requests they sent and what came back, and the requests colleagues
sent them lately and how each was answered. So "what is waiting for me?" works in a
conversation, and a morning flow can catch them up (`flows.md`).

## Status and leaving

Their status (**Working**, **In a meeting**, **Away**, **Off**) shows on their card; they change
it at the bottom of the column on the left, under their clone. **Leave** (오피스 나가기), at the
end of Settings › Office, forgets the relay on this computer; past requests stay on the relay.
When the office is open on their computer, it reads **Close the office on this computer** (이
컴퓨터의 오피스 닫기) and asks once, since teammates cannot reach the office until it is opened
here again. Everything it keeps stays, and opening it again brings them back as themselves.
