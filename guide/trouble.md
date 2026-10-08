# When something goes wrong

- **Not sure what is wrong**: `npx -y clone-office doctor` in a terminal checks this computer
  (Node.js, the clone's folder, whether the app runs, the AI model and its sign-in, the office,
  starting with the computer, a newer version) and says what to do for each thing that is not right.
  It changes nothing and calls no AI model.
- **"Claude Code is not on this computer"**: the clone was set to think with their own Claude
  Code. Install it (claude.com/code), or pick another model under Settings › **AI model** (AI 모델):
  their ChatGPT plan, a key, or a model on their computer (`brain.md`).
- **"Claude Code is not signed in"**: open a terminal, run `claude` and sign in once, then try
  again. Nothing in Clone Office signs in for them.
- **"The brain did not answer"**: what the service said is shown under it, as it said it (a model
  their plan does not include, a limit reached). Try again, or pick another model under **AI model**.
- **"The service did not accept that key"** or **"needs a key"**: the key was mistyped, removed or
  ran out of credit at the service. Make a new one there and paste it under **AI model** (AI 모델).
- **"Can't reach the office"** (오피스에 연결하지 못했어요), at the top of Home, Requests and Office: the
  computer that opened the office is off, its app is closed, or they are on another network (an
  office opened on a computer is reached on the same Wi-Fi). Once it answers again, everything
  reconnects by itself; what came meanwhile waits there. **Office settings** (오피스 설정) shows the
  office's address and, for an office opened on this computer, what went wrong.
- **Learning takes long**: with years of AI conversations the first reading can take a minute;
  the page shows what it is doing and roughly how far along it is. It keeps going if they close
  or reload the page, and the page picks it up again when reopened.
- **It said something out of date**: anything it kept about changing things may be stale. Tell it
  ("that's not true anymore"); it checks their computer and corrects what it kept.
- **It got them wrong**: use **Correct** (고치기) or **Remove** (지우기) on that line under **What it
  remembers** (기억하는 것) in **Your clone** (내 클론) › What it knows, or just tell it.
- **Bringing from another AI kept nothing**: the other AI's answer held only things that change or
  are private, or what the clone already keeps. That is expected; nothing was stored.
- **Read again**: **Read my AI records again** (내 AI 기록 다시 읽기) under **Your clone** › What it knows reads
  only what is new since the last time.
- **It seems to have forgotten the start of a long conversation**: long conversations go on from
  a summary. Ask it to look the detail up; it can search the whole conversation.
