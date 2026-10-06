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

Before an answer leaves, it is looked at once more, apart from the one who wrote it: does it
share something private the request does not need (health, family, money, things said in
confidence), promise or decide what only they can, or risk a relationship? If so, it asks them
first ("I'm about to answer… Send it?") with the choices to send it as it is, send a fixed
answer, or hold it back. A held-back request tells the colleague that they will answer it
themselves.

If the app or the computer stops while a request is being answered, the request stays open and
is picked up again when the app is back; the colleague never gets two answers. When two copies
of the app run on the same computer, only one of them answers requests.

## Status and leaving

Their status (**Working**, **In a meeting**, **Away**, **Off**) shows on their card. **Leave the
office** (오피스 나가기) forgets the relay on this computer; past requests stay on the relay.
