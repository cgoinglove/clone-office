# The office: clones working together

An office is a team. Each person's clone joins it, shows a card, and carries requests between
colleagues for them: it answers what it can, and brings back only what its person must decide.

## Joining

In the first steps (**You and your team**, 나와 우리 팀), or any time under Settings › **Office**
(오피스). There are two ways in:

- **Open one on this computer** (이 컴퓨터에서 열기): this computer becomes the team's office. The
  app starts the relay itself (the same one as `pnpm relay`, keeping the office in `relay/` in
  the clone's folder) and puts their card in it. Teammates on the same network (the same Wi-Fi,
  or the same office network) join with the invite link they send. Settings › Office then says
  **Open on this computer** (이 컴퓨터에서 열려 있어요), with the address teammates reach and
  **Copy invite** (초대 링크 복사). The first time, the computer may ask whether the app may accept
  incoming connections; it has to, for teammates to reach it. The office rests while the computer
  sleeps or the app is closed, and teammates cannot reach it then; it opens again at the same
  address, with the same key, when the app is back. On another network the address can change,
  and teammates need a new link. Teammates who are not on the same network need a relay the team
  runs on a server (the README says how).
- **Join with an invite link** (초대 링크로 들어가기): paste the link a teammate sent. **Join with
  an address and key instead** (주소와 열쇠로 들어가기) is for a relay someone runs by hand: its
  address and the **Office key** (오피스 열쇠) they shared.

Either way they give their name and what they do in a line. **Draft it for me** (초안 써 줘) has
the clone write that line from what it knows of them; they correct it before going in, and
nothing is shared until then. Colleagues who join appear at their desks in the office, under
**Colleagues** (동료) in the side panel's Requests tab, and under **People** (사람들) in Settings ›
Office.

Anyone in the office can copy the invite link in Settings › Office and send it. Anyone with the
link can join, so it goes only to the team.

### From the invite link, in a browser

Opened in a browser, the invite link is the office server's page for making an account there
(**Make your account**, 내 계정 만들기: name, email, a password of 8 characters or more), or
signing in with one they have. Their own page on the server then has:

- **Connect your computer** (내 컴퓨터 연결): **Make my connect command** (연결 명령 만들기) gives
  one line, `npx sub-office connect <link>`, to run once in a terminal on the computer their
  clone should live on (it needs Node.js 22 or later, from nodejs.org). It works once, for ten
  minutes; a new one can be made any time. Run, it puts their clone in the office under their
  account and opens the app there. Their page on the server then says which clone is connected.
  One person has one clone: connecting another computer moves it there, and the one before
  leaves the office.
- **Invite a teammate** (동료 초대): the office's invite link, to send on.
- **People in this office** (이 오피스의 사람들): everyone with an account there, owner or member,
  and whether their computer is connected.
- **Sign out** (로그아웃).

The first account made in an office owns it. An owner also sees, on that page: **Remove**
(내보내기) beside a person (their clone stops working in the office at once; what they asked and
answered stays), **Make owner** (주인으로), clones that joined with the link without an account,
**Make a new invite link** (새 초대 링크 만들기; the old link stops working, everyone in stays in),
and **Office name** (오피스 이름). Each change is shown once more on its own page before it is
made. The server keeps their password only hashed and
their session in a cookie; the line's code is kept only hashed and ends once used. Someone who
already runs sub-office can still paste the invite link under Settings › Office in the app
instead.

## What goes to the relay, and what never does

Only the cards (name, what they do, their status) and the requests with their answers go to the
relay, and the files they chose to send with one. What the clone keeps about them, their
conversations and anything it read on their computer never leave it.

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
  **Working** (처리 중), **Needs more** (더 필요해요, with a box to answer), **Done** (끝남),
  **Declined** (거절), **Failed** (실패).

When a colleague asks for work in a project one of their Claude Code conversations knows, and
they take it on, their clone can have that conversation do it: in a copy of it named
"<name> · clone", asking them before each change (the card shows the lines before and after,
or the command), and then tells the colleague what was done.

## How to work with them (ME.md)

Under Settings › **Requests you take** (받는 부탁), **How to work with me** (나와 일하는 법) holds a few lines colleagues and their
clones read: how they like to be asked, when to expect an answer, what to bring them early.
**Draft it for me** (초안 써 줘) has the clone write a few from what it knows of them, leaving out
anything private; a line goes on the card only when they press **Add** (더하기), and **Remove**
(지우기) takes one off. They can also type their own. The same lines, with their card and the
requests they take, are kept as ME.md in the clone's folder, a file they can hand to anyone.
Colleagues' cards show theirs the same way, and the clone follows them when it asks someone.

## Requests they take, and how much their clone does alone

Settings › **Requests you take** (받는 부탁) lists the kinds of request colleagues' clones can bring
them, each with how much their clone does alone (a new kind starts where Settings › Preferences
says, **Tell me** unless they changed it):

- **On its own** (알아서): it answers and sends, without telling them.
- **Tell me** (하고 알림): it answers and sends, then tells them in their latest conversation
  (**I answered for you**, 대신 답했어요).
- **Ask me first** (묻고 함): it shows them the answer first (send it, or hold it); it goes only
  when they say so. If it already asked them while answering (a date they gave, a yes), it does
  not ask again.

When they send the clone's answers of an **Ask me first** kind as they were three times in a
row, it asks whether to answer that kind itself and tell them from then on (**Make it a rule?**,
앞으로 이렇게 할까요?); only their **Yes, from now on** (네, 앞으로 그렇게) changes it, and they can
set it back on the menu at any time.

**Like you** (나 같다) on the same list is how often, in the last 30 days, they sent the answers
it showed them first as they were, neither changed nor held back ("Like you: 82%. You sent 14 of
the 17 answers I showed you first as they were"), and under each kind, how often for that kind.
It is the plainest sign of how well the clone answers like them; a kind that is nearly always
sent as it was is one they might let it answer alone.

**Draft it for me** (초안 써 줘) has the clone suggest kinds from what it knows of them, and
**Add one** (직접 더하기) adds one by hand; every change is kept and shown on their card at once.
Colleagues see the kinds they take, never how much is done alone. A request that fits none of
them is answered, and they are told. Whatever the setting, a promise, a decision they answer
for, anything about a relationship or a check of work in their field stays theirs: the clone
asks them first.

## Asking from Claude Code

People who work in Claude Code can ask colleagues' clones from there, without opening the app:
"ask Ben's clone how the payments API pages /orders" in any Claude Code conversation. It needs
the sub-office plugin, added once in Claude Code:

```
/plugin marketplace add <where sub-office is: its folder or its GitHub repository>
/plugin install sub-office@sub-office
```

(or, for one session, start Claude Code with `claude --plugin-dir <sub-office folder>/plugin`).
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

## When a colleague asks them

Their clone answers from what it knows of them. What only they can give — a promise (a date,
money, scope), a decision they answer for, anything about a relationship, a check of work in their
field — it asks them first, with a card under **Office** ("A request needs your answer", 받은
부탁에 답이 필요해요), and answers with what they said. Meanwhile the colleague sees **Working**.
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
themselves.

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

The office is the app's main screen. The first time each day it opens at the lobby (Settings ›
Preferences can turn that off): the company's
building, their floor marked on it, and a card with who is already in and what is waiting for
them. **Clock in** (출근하기), or Enter, rides the lift up to their floor, where their clone steps
out to its desk. The rest of the day it opens straight at the office.

The office is a floor seen from above: a desk for each member
with their clone at it, their name on the floor in front. Their own clone is the black (in
dark mode, white) one, with a loop drawn round its desk; each colleague's has a colour of its
own. A colleague whose computer is off is not in: their desk shows **OFF** (꺼짐), and their
clone comes in through the lift when the computer is back on.

What happens to their requests plays out on it. A request walks from the asker's desk to the
asked one's (or flies there as a paper plane when the desk is far) and lands on their pile; the
clone takes it up and works at its laptop; the answer is carried back, and **DONE** (완료) is
stamped on the floor. Only requests they are part of are shown: what colleagues ask each other
stays between them. When something waits for them, their clone asks over its head with
**Answer** (답하기), which brings them to the question, and **YOUR TURN** (내 차례) is written on
the floor.

Behind the wall stands the office board: everyone, those a decision waits on first, with what
they are on and how much is on their desk. **My desk** (내 자리), **Board** (보드) and **Office**
(오피스) at the bottom move the view; dragging moves it too, and Ctrl (or ⌘) with the wheel
zooms. Clicking a clone opens a panel about that person: what is on their desk, what they do
now, how to work with them, the requests they take, and the requests between them and you.

## What is waiting for them

The clone can see where their office work stands, the same as their page shows: questions
kept for them to answer, the requests they sent and what came back, and the requests colleagues
sent them lately and how each was answered. So "what is waiting for me?" works in a
conversation, and a morning flow can catch them up (`flows.md`).

## Status and leaving

Their status (**Working**, **In a meeting**, **Away**, **Off**) shows on their card; they change
it from the bar at the top of the office, beside the app's name. **Leave** (오피스 나가기), at the
end of Settings › Office, forgets the relay on this computer; past requests stay on the relay.
When the office is open on their computer, it reads **Close the office on this computer** (이
컴퓨터의 오피스 닫기) and asks once, since teammates cannot reach the office until it is opened
here again. Everything it keeps stays, and opening it again brings them back as themselves.
