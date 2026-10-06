# Brain: what the clone thinks with

Under **Brain** (두뇌) on their page they pick what their clone thinks with. Whichever they pick,
the clone is the same: the same memory, skills, notes and conversations, the same cards before
it does anything they have not allowed, the same folders kept out.

- **My Claude Code** (내 Claude Code): their own Claude Code on this computer, signed in with their
  Claude subscription. Nothing else to set up; its use counts against their Claude plan.
- **A model with my key** (내 키로 다른 모델): Claude, OpenAI, Gemini or OpenRouter (which reaches
  many others), with an API key they make at that service (**Make a key**, 키 만들기, opens the
  page). They paste it and **Save** (저장); the key is checked by asking the service for its list
  of models, which costs nothing, and it is kept on this computer only, in a file only they can
  read. Then they pick a model (small, mid, large; or type another name the service has) and
  **Use this** (이걸로 쓰기). The service bills their key for what the clone uses.
- **Ollama / LM Studio**: a model running on this computer. No key and nothing leaves the
  computer; it is slower and less able than the services, and needs the model pulled first
  (for Ollama, `ollama pull <model>`), then its name typed here.

With a model reached directly, the clone runs its own loop the way Claude Code would: it reads
their files and the web only as they allow, asks on a card for everything else, and keeps its
conversations under `brain/sessions/` in the clone's folder. Talking with their own Claude Code
conversations (asking one, having one do work) still needs Claude Code on the computer.

Changing the brain keeps everything. A conversation started with one brain goes on with the
other from its own record.

Not yet: their ChatGPT plan (Sign in with ChatGPT), a key their team sets once for everyone, and
a clone thinking on the team's server for someone who cannot install anything.
