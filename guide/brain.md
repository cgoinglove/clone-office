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

A key is checked by asking the service for its list of models, which costs nothing. Keys and the
ChatGPT sign-in are kept on this computer only, in files only they can read. Then they pick a
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

Not yet: a key their team sets once for everyone, and a clone thinking on the team's server for
someone who cannot install anything.
