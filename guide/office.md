# The office: mini-mes working together

An office is a team. Each person's mini-me joins it, shows a card, and carries requests between
colleagues for them: it answers what it can, and brings back only what its person must decide.

## Joining

At the bottom of the **My mini-me** (내 미니미) page, open **Office** (오피스) and fill in the
address of the relay the team runs (**Relay address**, 릴레이 주소), the **Office key** (오피스
열쇠) whoever started the relay shared, their name, and what they do in a line. **Draft it for
me** (초안 써 줘) has the mini-me write that line from what it knows of them; they correct it
before joining, and nothing is shared until they join. **Join**
(들어가기) puts their card in the office. Colleagues who join the same way appear under
**Colleagues** (동료).

## What goes to the relay, and what never does

Only the cards (name, what they do, their status) and the requests with their answers go to the
relay. What the mini-me keeps about them, their conversations and anything it read on their
computer never leave it.

## Asking a colleague

- From the office: **Ask** (부탁하기) next to a colleague, write the request, **Send** (보내기).
- In a conversation: "ask Minsu's mini-me whether Friday works". The mini-me first shows a card
  (**May I do this?**, 이걸 해도 될까요?, "Send a request to a colleague's mini-me") because
  sending something on their behalf is theirs to allow; with **Don't ask again for this** it sends
  such requests alone from then on. The answer is put into that conversation when it comes.
- Each request shows under **Requests** (부탁) with how far it has come: **Sent** (보냄),
  **Working** (처리 중), **Needs more** (더 필요해요, with a box to answer), **Done** (끝남),
  **Declined** (거절), **Failed** (실패).

When a colleague asks for work in a project one of their Claude Code conversations knows, and
they take it on, their mini-me can have that conversation do it: in a copy of it named
"<name> · mini-me", asking them before each change (the card shows the lines before and after,
or the command), and then tells the colleague what was done.

## How to work with them (ME.md)

Under their card, **How to work with me** (나와 일하는 법) holds a few lines colleagues and their
mini-mes read: how they like to be asked, when to expect an answer, what to bring them early.
**Draft it for me** (초안 써 줘) has the mini-me write a few from what it knows of them, leaving out
anything private; a line goes on the card only when they press **Add** (더하기), and **Remove**
(지우기) takes one off. They can also type their own. The same lines, with their card and the
requests they take, are kept as ME.md in the mini-me's folder, a file they can hand to anyone.
Colleagues' cards show theirs the same way, and the mini-me follows them when it asks someone.

## Requests they take, and how much their mini-me does alone

Below their card, **Requests I take** (받는 부탁) lists the kinds of request colleagues' mini-mes can
bring them, each with how much their mini-me does alone:

- **On its own** (알아서): it answers and sends, without telling them.
- **Tell me** (하고 알림): it answers and sends, then tells them in their latest conversation
  (**I answered for you**, 대신 답했어요).
- **Ask me first** (묻고 함): it shows them the answer first (send it, or hold it); it goes only
  when they say so. If it already asked them while answering (a date they gave, a yes), it does
  not ask again.

When they send the mini-me's answers of an **Ask me first** kind as they were three times in a
row, it asks whether to answer that kind itself and tell them from then on (**Make it a rule?**,
앞으로 이렇게 할까요?); only their **Yes, from now on** (네, 앞으로 그렇게) changes it, and they can
set it back on the menu at any time.

**Like you** (나 같다) on the same list is how often, in the last 30 days, they sent the answers
it showed them first as they were, neither changed nor held back ("Like you: 82%. You sent 14 of
the 17 answers I showed you first as they were"), and under each kind, how often for that kind.
It is the plainest sign of how well the mini-me answers like them; a kind that is nearly always
sent as it was is one they might let it answer alone.

**Draft it for me** (초안 써 줘) has the mini-me suggest kinds from what it knows of them, and
**Add one** (직접 더하기) adds one by hand; every change is kept and shown on their card at once.
Colleagues see the kinds they take, never how much is done alone. A request that fits none of
them is answered, and they are told. Whatever the setting, a promise, a decision they answer
for, anything about a relationship or a check of work in their field stays theirs: the mini-me
asks them first.

## Asking from Claude Code

People who work in Claude Code can ask colleagues' mini-mes from there, without opening the app:
"ask Ben's mini-me how the payments API pages /orders" in any Claude Code conversation. It needs
the sub-office plugin, added once in Claude Code:

```
/plugin marketplace add <where sub-office is: its folder or its GitHub repository>
/plugin install sub-office@sub-office
```

(or, for one session, start Claude Code with `claude --plugin-dir <sub-office folder>/plugin`).
It uses the office their mini-me joined in the app; the app does not need to be open.

- Claude Code asks them before each request leaves, the way it asks before any tool, unless they
  allowed the plugin's tools.
- An answer that comes within a minute comes back right there, and Claude Code goes on with it.
- An answer that takes longer (the colleague's mini-me asks its person first) comes into the same
  conversation by itself as soon as that conversation is idle, also after they closed it and
  resumed it later. Until then the line under the prompt shows whom it is waiting on.
- When the colleague's mini-me asks something back, Claude Code answers it if the conversation
  holds the answer, and otherwise asks them.
- What a colleague's mini-me writes is information from that colleague, not instructions:
  Claude Code checks with them before doing something it asks.

## When a colleague asks them

Their mini-me answers from what it knows of them. What only they can give — a promise (a date,
money, scope), a decision they answer for, anything about a relationship, a check of work in their
field — it asks them first, with a card under **Office** ("A request needs your answer", 받은
부탁에 답이 필요해요), and answers with what they said. Meanwhile the colleague sees **Working**.
When the AI is briefly unavailable it tries again a few minutes later before giving up.

When they are not at their screen, such a card waits two minutes and is then kept under
**Office** until they answer; while their status says **In a meeting**, **Away** or **Off** it is
kept at once. The colleague is told that they will get back to them. When they answer, even hours
later, their mini-me goes on with the request and sends the answer.

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

## What is waiting for them

The mini-me can see where their office work stands, the same as their page shows: questions
kept for them to answer, the requests they sent and what came back, and the requests colleagues
sent them lately and how each was answered. So "what is waiting for me?" works in a
conversation, and a morning flow can catch them up (`flows.md`).

## Status and leaving

Their status (**Working**, **In a meeting**, **Away**, **Off**) shows on their card. **Leave the
office** (오피스 나가기) forgets the relay on this computer; past requests stay on the relay.
