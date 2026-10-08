# AI model: what the clone thinks with

Under Settings › **AI model** (AI 모델), and in the first steps, they pick what their clone thinks
with: a vendor first, then how they reach it, then a model. Whichever they pick, the clone is the
same: the same memory, skills, notes and conversations, the same cards before anything they have
not allowed, the same folders kept out. A vendor already on this computer is marked **On this
computer** (**Found here**, 이 컴퓨터에 있음).

- **OpenAI**
  - **My ChatGPT plan** (내 ChatGPT 요금제): **Sign in with ChatGPT** (ChatGPT로 로그인) opens
    OpenAI's sign-in in a new tab; they approve, and the clone thinks within their plan's
    allowance (Plus, Pro, Business…). OpenAI's own way for an open-source app on their computer
    to use their plan, nothing to pay on top; it is a preview, and when the plan's allowance is
    used up the clone says so. **Sign out** (로그아웃) forgets the sign-in.
  - **API key** (API 키): a key from platform.openai.com, billed by OpenAI for what is used.
- **Claude**
  - **My Claude subscription** (내 Claude 구독): through their own Claude Code on this computer,
    signed in with their Claude account. Claude Code must be installed (claude.com/code). They
    pick which Claude it thinks with: Claude Haiku, Claude Sonnet (suggested) or Claude Opus.
  - **API key**: a key from platform.claude.com.
- **Gemini**: an API key from Google AI Studio.
- **OpenRouter**: one key reaching models from many makers.
- **This computer** (내 컴퓨터): Ollama or LM Studio, marked when one is running. No
  key and nothing leaves the computer; slower and less able than the services. The model has to
  be pulled first (for Ollama, `ollama pull <model>`), then its name typed here.

**Team key** (팀 키), under OpenAI, Claude, Gemini and OpenRouter, once they are in an office: one
API key the whole office shares, so the team pays once. Anyone in the office pastes it there; the
office's server asks the vendor whether it works, then keeps it sealed, and every clone that picks
**Team key** thinks with it through that server. The key never reaches anyone's computer: someone
who leaves the office stops using it at once, and the line under it says how many calls their clone
and the whole office made in the last 30 days. What a clone asks passes through the office's server
on its way and is never kept there. **Remove it from the office** (오피스에서 빼기) forgets it for
everyone. A Claude or ChatGPT subscription is never shared this way: each is its person's own, and
the vendors' terms say so. A server on its own Postgres keeps a team key only once whoever runs it
sets RELAY_ENCRYPTION_KEY; an office opened on someone's computer always can. So that a clone caught
in a loop cannot spend the team's money, each person's clone makes at most 1,000 calls a day with
one vendor's team key (a team's own server can set another number, `RELAY_TEAM_AI_DAILY`, or none);
past it, the clone says so, and it starts again the next day.

A key is checked by asking the service for its list of models, which costs nothing. Keys and the
ChatGPT sign-in are kept on this computer only, in files only they can read, sealed with the
folder's own key. Then they pick a
model (small, mid, large; or type another name the service has); the one marked **Suggested**
(추천) is picked to start with. **Use this** (이걸로 쓰기) makes it the clone's brain. On the first
steps, **Continue** (계속) first checks that it answers: whether Claude Code is there and signed
in (which calls no model), then one word asked of it, a few seconds. If it does not answer, the
step says why and what to do, with **Go on anyway** (그래도 계속하기).

Settings › AI model can send the work in the background (looking back after a conversation,
summaries, drafts) to a smaller model from the same service, which uses less of a plan or a key (`index.md`,
"Settings"); conversations, flows and every answer to colleagues stay on the model they
picked.

Except with Claude Code, the clone runs its own loop the way Claude Code would: it reads their
files and the web only as they allow, asks on a card for everything else, and keeps its
conversations under `brain/sessions/` in the clone's folder. Talking with their own Claude Code
conversations (asking one, having one do work) still needs Claude Code on the computer.

Changing the brain keeps everything. A conversation started with one brain goes on with another
from its own record.

**Last 30 days** (지난 30일), at the end of Settings › AI model, says what the clone used its AI
for: their conversations, colleagues' requests and meetings, flows, and learning how they work,
each with how often, how many failed, and the tokens. With Claude Code it also gives what that
would cost at API prices, as Claude Code reports it; on a subscription nothing more is paid. It is
read from the clone's run log, which keeps no conversation text.

Not yet: a clone thinking on the team's server for someone who cannot install anything.
