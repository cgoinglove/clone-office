import { homedir } from "node:os";
import * as z from "zod";
import {
  memoryDir,
  notesDir,
  skillsDir,
} from "@/features/minime/brain/session";
import { NoteStore } from "@/features/minime/memory/notes";
import { SkillStore } from "@/features/minime/memory/skills";
import { MemoryStore } from "@/features/minime/memory/store";
import { refuse } from "@/features/minime/server/guard";

/** Everything the mini-me keeps, as it is saved: both memory files' entries and how many skills and notes. */
async function snapshot() {
  const store = new MemoryStore(memoryDir());
  const [user, memory, skills, notes] = await Promise.all([
    store.entries("user"),
    store.entries("memory"),
    new SkillStore(skillsDir()).list().catch(() => []),
    new NoteStore(notesDir()).pages().catch(() => []),
  ]);
  const home = homedir();
  return {
    user,
    memory,
    skills: skills.length,
    notes: notes.length,
    dir: memoryDir().startsWith(home)
      ? `~${memoryDir().slice(home.length)}`
      : memoryDir(),
  };
}

// What the mini-me keeps about the person, read from its files each time, so the screen always
// shows exactly what is saved.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json(await snapshot());
}

const Body = z.object({
  remove: z.object({
    target: z.enum(["user", "memory"]),
    entry: z.string().min(1).max(4000),
  }),
});

// The person removed one entry. It is removed as it is, without asking the model.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "Bad request." }, { status: 400 });
  const { target, entry } = body.data.remove;
  const result = await new MemoryStore(memoryDir()).remove(target, entry);
  if (!result.success)
    return Response.json({ error: result.error }, { status: 409 });
  return Response.json(await snapshot());
}
