# What the clone reads

To learn their work, the first time, it reads (most of it from the last two weeks, newest first,
sized to what their AI model can hold; it takes about half a minute):

- what they wrote for their AI tools (such as Claude Code's or Codex's instruction files) and what
  those tools already noted about them;
- where their work lives: the folders they changed in the last 30 days (on the desktop, in
  documents, downloads, pictures, videos, music and the usual code folders) and the ones they worked
  in with AI tools. For a folder, the names and dates of its newest files and how many of each
  kind; for a project in git, its address, its folders, its README's opening and what it is built
  on. Never what a file says, never a file named like a key or a password, never what a package
  manager or a build put there;
- what they typed to their AI tools lately, from the folders they worked in most, and what their
  conversations were about (their titles, over the last two months or so);
- their own recent commits in those projects;
- which kinds of documents they opened lately and which apps they use most;
- the name on their computer's account and on their commits, as a hint of what to call them.

When it has read, the first steps list what it understood beside them; any line can be taken back
there with its × (a line of memory is removed, a page set aside in the notes' archive, a place
taken off the map), and later under Your clone › What it knows.

It never reads the contents of their documents, their browser history or their screen. **Read
again** (다시 읽기) reads only what is new or changed since the last time. On a Mac, the first time
it looks in Desktop, Documents or Downloads, macOS may ask whether the app (or Terminal) may
open that folder: either answer is fine; until they allow it, that folder is passed over and the
rest is read.

## Folders it reads

The first steps show them as one field (**Folders it reads**, 읽을 폴더) with how many and their
names: pressing it opens every folder in a dialog, each with its AI tools' marks and how many
conversations or changed files it has; a ticked folder is read, and unticking one keeps it out of
everything the clone reads and searches, from then on.

No folder on the list lies inside another, so nothing is read twice: a project in git is one
folder, and so is a folder they worked in with an AI tool; a folder that holds several of those
(a "projects" folder, say) is not a folder of its own on the list but heads the ones inside it, and
unticking it leaves all of them out at once. What changed elsewhere goes to the folder right under
it, and a downloads folder of loose files is one folder. A folder's name or path typed at the bottom
leaves out any other.

Later, the same field is under Settings › Permissions, at any time, with **Answer colleagues from
these folders** under it (`office.md`). What the clone had gathered from
a folder for searching is removed as soon as it is left out. Lines it already remembers stay in its
memory, where they can remove any of them. They can also just tell the clone ("don't look at my
client work"): it asks first, with the folder shown, and leaves it out. Bringing a folder back is
done only in Settings › Permissions.

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
reports it. It holds no conversation text. It is listed under **All files I keep** (클론이 저장한 파일
전체) as the run log.

## Where their data goes

Nothing is uploaded to Clone Office. What the clone reads goes only to their own Claude Code, the
AI tool they already use and are signed in to, which does the thinking; it counts toward that
subscription's usage like any other use.
