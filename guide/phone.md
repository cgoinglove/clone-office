# On their phone: the mini-me in Discord, Telegram or Slack

They can talk with their mini-me from Discord, Telegram or Slack on their phone, the same as on its
page. It answers while the app runs on their computer; what they say there goes into a conversation
they also see on the page. The words go through that messenger. One messenger at a time: to change,
they disconnect and set up the other.

## Setting it up, once

Under **On your phone** (휴대폰에서) on their page they pick Discord, Telegram or Slack.

With Telegram (no server needed):

1. In Telegram they open @BotFather and send /newbot, give the bot a name and then a username
   that ends in "bot"; BotFather answers with its token, which they copy.
2. They paste the token and press **Connect** (연결하기).
3. **Open the chat with the bot** (봇과의 대화 열기), on their phone (pointing its camera at the
   picture on the page opens it), and press Start.

With Slack (in a workspace where they may add an app):

1. At api.slack.com/apps: Create New App, From a manifest, their workspace, and the manifest the
   page copies (**Copy the manifest**, 매니페스트 복사). It asks only for what the mini-me uses:
   its Messages tab, writing there first, the person's name, and files sent there both ways.
2. Basic Information, App-Level Tokens: one with connections:write (it starts with xapp-).
3. Install App to the workspace, and the Bot User OAuth Token (it starts with xoxb-). Both tokens
   go on the page, in either box, and **Connect** (연결하기).
4. In Slack, the app under Apps, and a message in its Messages tab.

With Discord:

1. At Discord's Developer Portal they make a New Application. So nobody else can add it to a
   server, they set Install Link to None on its Installation page and turn off Public Bot on its
   Bot page, then press Reset Token there and copy the token.
2. They paste the token and press **Connect** (연결하기).
3. **Add the bot to a server** (봇을 서버에 추가) adds it to a server of their own: Discord only
   delivers a message to a bot they share a server with. A private server made for this is fine.
4. They send the bot a direct message, not in the server: on their phone, the bot in the
   server's member list, then Message.

The bot answers with a code and the page asks about them with the same code. They press **Let
in** (들여보내기) only if the code is the one their phone shows; then the mini-me answers what they
wrote. Anyone else who writes to the bot is not answered: it talks with its person only. **Not
them** (내가 아니에요) turns away someone who is not them.

## Talking

They write as they would on the page. When the mini-me needs something from them (may it read a
file, which of two options), it asks with buttons; they press one, or answer a question in their
own words. "/new" starts a new conversation. The app keeps the bot's token on their computer
only, in a settings file only they can read.

## Files

A photo or a document they send the bot is kept on their computer (in `messenger/files/` in the
mini-me's folder, a folder a day, up to 25 MB each), and the mini-me reads it: "what does this
receipt say?", "send this to Minsu". Only the person let in is taken from; a stranger's file is
never fetched. A file that comes with a colleague's answer to something asked from the phone
comes to the phone too (up to 10 MB, which Discord takes from a bot); a larger one stays on the
computer, named in the message.

## What comes to the phone by itself

While they are not looking at their mini-me's page (it is closed, hidden, or another window is in
front for about a minute), what waits on them comes to their messenger:

- **A question waiting on them**: about a colleague's request (who asked, what, and the mini-me's
  question), or one from a conversation they left on the page. They answer with a button or in
  their own words; when several wait, replying to one answers that one.
- **Questions kept for later**: ones they did not answer in time come together at 10, 14 and 17
  o'clock, once each. While their status says they are in a meeting, away or off, colleagues'
  questions wait for those moments instead of coming at once.
- **Finished work nobody has seen**: a flow's answer (the morning brief), or a colleague's answer
  to a request they sent from the page.

An answer to something they asked from the phone comes back to the phone even while the page is
open. Progress does not come: the phone is not for every step. While the page is in view,
everything stays there.

## When it does not answer

The app has to be running on their computer, which must be awake. If another copy of the app on
the same computer already talks through the bot, the page says so. If Discord or Telegram stops
taking the token (it was reset or revoked), they get a new one (Discord's Bot page, /token at
@BotFather, or Slack's app pages) and connect again; they stay let in. A Telegram bot is read by one program at a time,
so the same bot cannot also serve another app (Hermes Agent, for one). **Disconnect**
(연결 끊기) forgets the token and who the bot talks with.
