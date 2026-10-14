# AI model: what the clone thinks with

Under Settings › **AI model** (AI 모델), and in the first steps, they pick what their clone thinks
with: a vendor first, then how they reach it, then a model. Whichever they pick, the clone is the
same: the same memory, skills, notes and conversations, the same cards before anything they have
not allowed, the same folders kept out. A vendor already on this computer is marked **On this
computer** (**Found here**, 이 컴퓨터에 있음).

In the first steps it is one field (**Pick a model**, 모델 고르기) that opens on two columns: the
vendors, and what the one in hand offers, its ways in, what a way needs first (a sign-in or a key),
then its models; pressing a model picks it. What this computer already has is offered under the
field, one press away (**Claude Code is on this computer**, 이 컴퓨터에 Claude Code가 있어요). The
model picked is asked one word at once, and the step says it answered (**It answered**, 답했어요) or
what to do when it did not. An answer is remembered for a day with the model it came from, so
opening the first steps again does not ask again (**Answered 3 hours ago**, 3시간 전 확인했어요);
**Check again** (다시 확인) asks anew, and another model is always asked.

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

**Our team** (우리 팀), at the top of the model's list once their office keeps a key: the models the
office's own keys reach, one API key per vendor the whole office shares, so the team pays once.
The keys are added under Settings › Office › **Team keys** (팀 키): anyone in the office pastes one
there; the office's server asks the vendor whether it works, then keeps it sealed, and every clone
that picks one of the team's models thinks with it through that server. The key never reaches anyone's computer: someone
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
or Codex conversations (asking one, having one do work) needs that tool on the computer, signed
in as they use it, whatever the clone itself thinks with.

Changing the brain keeps everything. A conversation started with one brain goes on with another
from its own record.

## Backup model

Under the model, Settings › AI model has a **Backup model** (예비 모델): the same field, picked the
same way, for when their model is overloaded, rate-limited or failing on its vendor's side. The
clone first tries again a couple of times, as it always does; if that does not get through, it
finishes the answer with the backup, and the conversation says so in a line (**Your model was busy,
so … finished this answer**). Their next message goes to their own model again. A wrong key, a
signed-out plan or a refused request is not a reason to move: those are said as they are.

- With **My Claude subscription** (Claude Code), the backup is another Claude through the same
  Claude Code (Claude Code moves itself, its own `--fallback-model`).
- With any other way, the backup is any model the clone can reach: another vendor's with their key,
  their ChatGPT plan, the team's key, or a model on this computer. Their own model is never its own
  backup.
- **None** (없음) takes the backup away. Picking another model keeps the backup while it still fits.

## Long work

When something takes several steps, the clone works through it the way Claude Code does:

- **A to-do list** (할 일): it writes the steps first, marks the one it is on and ticks each as it is
  done, and they see it above the answer as it goes. It is kept with the conversation, so opening
  it again shows the last list, and a long conversation carried into a fresh session takes the
  steps still open with it.
- **Helpers** (도우미, with a key's model, the ChatGPT plan or a model on this computer): a long
  search or a lot of reading that the rest does not wait on can go to a helper, a fresh session of
  the clone that sees none of the conversation, reads (or, when sent to work, also uses the
  clone's shell and workspace), and brings back only its report. A few run side by side, at most
  eight for one answer, and a helper never sends helpers of its own or writes the clone's memory.
  What a helper may not do alone is asked on their screen exactly as the clone's own requests are,
  and refused with nobody to ask. Helpers work only in their own work, never on a colleague's
  request. Each is its own line in the run log, counted with the work that sent it. With Claude
  Code, the clone uses Claude Code's own sub-agents the same way, in the same places.
- **A scratch folder** for each conversation, `scratch/<session>/` in the clone's folder: when a
  tool answers more than the model can read at once (a long web page, a service's whole database,
  a command's long output), the whole answer is saved there and the clone reads a preview with
  the path, then the parts it needs, instead of losing the rest. How much one answer may take
  follows the model's window, so a small model on this computer is never filled by one answer. The
  clone also keeps its own temporary files there. A scratch folder is removed on its own a week
  after its conversation was last used; nothing else is touched.

**Last 30 days** (지난 30일), at the end of Settings › AI model, says what the clone used its AI
for: their conversations, colleagues' requests, flows, and learning how they work,
each with how often, how many failed, the tokens, and how much of what was sent the vendor read
from its cache (cheaper and faster than sending it anew; the clone keeps what it sends first the
same from call to call so that share stays high). With Claude Code it also gives what that
would cost at API prices, as Claude Code reports it; on a subscription nothing more is paid. It is
read from the clone's run log, which keeps no conversation text.

Not yet: a clone thinking on the team's server for someone who cannot install anything.
