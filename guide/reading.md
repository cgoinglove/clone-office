# What the clone reads

To learn how they work, the first time, it reads (from the last two weeks, newest first, at most
about 60,000 characters in all; it takes about half a minute):

- what they wrote for their AI tools (such as Claude Code's or Codex's instruction files) and what
  those tools already noted about them;
- what they typed to their AI tools lately, from the folders they worked in most;
- their own recent commits in those folders, when the folders are git projects;
- which kinds of documents they opened lately and which apps they use most — counted by kind,
  never opened and never read by name.

It never reads the contents of their documents, their browser history or their screen. **Read
again** (다시 읽기) reads only what is new or changed since the last time.

## Leaving something out

Before it reads, the **My clone** (내 클론) page lists the folders they worked in lately, from
all their AI tools; **Leave out** (빼기) keeps a folder out of everything the clone reads and
searches, from then on. Folders it leaves out are shown struck through, with **Left out** (뺐어요)
to bring them back.

Later, **Folders left out** (읽지 않는 폴더), under the conversation, shows the same list at any
time, and they can type any other folder's name or path to leave it out. What the clone had
gathered from a folder for searching is removed as soon as it is left out. Lines it already
remembers stay in its memory, where they can remove any of them. They can also just tell the
clone ("don't look at my client work"): it asks first, with the folder shown, and leaves it out.
Bringing a folder back is done only on the page.

## Their past conversations

So that it can answer "what did I do today" without keeping copies, the clone keeps a search
index of their conversations with their AI tools (Claude Code, Codex, Cursor's chat and Hermes
Agent), and of their conversations with the clone itself: only what they typed and what the AI
answered in text, never tool output. A conversation they delete in Cursor or Hermes Agent leaves
the index too. The first reading indexes only the last two weeks, so it can start
within seconds; the rest of the last three months is filled in afterwards, in the background. The
index is a file on this computer, refreshed a little at a time (every ten minutes while the app
is open, and just before each search); deleting it loses nothing, it is
rebuilt from the AI tools' own records, which it only ever reads.

## What it records about itself

Each time the clone thinks with their AI, it writes one line to a run log: what for (learning,
a conversation, looking back, summing up), how long it took, and how much it used, as their AI
reports it. It holds no conversation text. It is listed under **All files I keep** (저장된 파일
전체) as the run log.

## Where their data goes

Nothing is uploaded to sub-office. What the clone reads goes only to their own Claude Code, the
AI tool they already use and are signed in to, which does the thinking; it counts toward that
subscription's usage like any other use.
