// What the office room draws, from what the relay says: the members at their desks, the requests
// between them that the viewer is part of, and the office's meeting of the clones while it goes
// on. What colleagues ask each other stays between them; a request asked by a link (someone
// without a mini-me) has no desk to go to.

import type { RoomData } from "@/features/office/room/office.mjs";

// A card's status is a code, so each colleague reads it in their own language.
export const STATUSES = ["working", "meeting", "away", "off"] as const;
export type Status = (typeof STATUSES)[number];

// Cards kept their person's own words before the status was a code.
const OLD_WORDS: Record<string, Status> = {
  "일하는 중": "working",
  Working: "working",
  "회의 중": "meeting",
  "In a meeting": "meeting",
  "자리 비움": "away",
  Away: "away",
  퇴근: "off",
  Off: "off",
};

export function statusCode(status: string | undefined): Status | undefined {
  if (!status) return undefined;
  return (STATUSES as readonly string[]).includes(status)
    ? (status as Status)
    : OLD_WORDS[status];
}

type State = RoomData["requests"][number]["state"];
type Message = { role: "user" | "agent"; parts: { text: string }[] };

/** The parts of the relay's look the room needs. */
export interface OfficeLook {
  me?: { id: string };
  members?: {
    id: string;
    seen: string;
    card: {
      name: string;
      description: string;
      status?: string;
      skills?: { name: string }[];
      howToWork?: string[];
    };
  }[];
  tasks?: {
    id: string;
    status: { state: State; timestamp: string };
    history: Message[];
    metadata: { from: string; to: string };
  }[];
  /** The office's latest meetings of the clones, newest first. */
  meetings?: {
    id: string;
    state: "open" | "closed";
    members: string[];
    closed?: string;
    posts: {
      id: string;
      from: string;
      round: number;
      replyTo?: string;
      text: string;
    }[];
  }[];
}

/** A meeting just over stays on the floor this long, so its last words are read. */
const MEETING_AFTER_MS = 90 * 1000;

/** The meeting the floor shows: one going on, or one just over. */
export function currentMeeting(
  office: Pick<OfficeLook, "meetings">,
  now = Date.now(),
) {
  const latest = office.meetings?.[0];
  if (!latest) return undefined;
  if (latest.state === "open") return latest;
  return latest.closed && now - Date.parse(latest.closed) < MEETING_AFTER_MS
    ? latest
    : undefined;
}

/** A meeting as the floor draws it. */
function roomMeeting(
  meeting: NonNullable<OfficeLook["meetings"]>[number],
): NonNullable<RoomData["meeting"]> {
  return {
    id: meeting.id,
    state: meeting.state,
    members: meeting.members,
    posts: meeting.posts.map((post) => ({
      id: post.id,
      from: post.from,
      round: post.round,
      text: post.text,
      ...(post.replyTo ? { replyTo: post.replyTo } : {}),
    })),
  };
}

/** A computer not heard from at the relay for this long is off. */
const GONE_MS = 2 * 60 * 1000;

const textOf = (message?: Message) =>
  message?.parts.map((part) => part.text).join(" ") ?? "";

/**
 * Each member at a desk, as their card's status says, and the requests between members. `waiting`
 * is how many questions wait for the viewer now, `line` the first of them in a line.
 */
export function roomData(
  office: OfficeLook,
  waiting: number,
  line?: string,
  now = Date.now(),
  /** The viewer's clone does not take part in meetings: it stays at its desk. */
  mineOut = false,
): RoomData {
  const members = office.members ?? [];
  const ids = new Set(members.map((m) => m.id));
  const meeting = currentMeeting(office, now);
  return {
    people: members.map((member) => {
      const mine = member.id === office.me?.id;
      const status = statusCode(member.card.status);
      const gone = now - Date.parse(member.seen) > GONE_MS;
      return {
        id: member.id,
        name: member.card.name,
        role: member.card.description,
        mine,
        status:
          status === "off" || (gone && !mine)
            ? "offline"
            : status === "meeting" || status === "away"
              ? "away"
              : "active",
        ways: member.card.howToWork ?? [],
        menu: member.card.skills?.map((skill) => skill.name) ?? [],
      };
    }),
    requests: (office.tasks ?? [])
      .filter(
        (task) => ids.has(task.metadata.from) && ids.has(task.metadata.to),
      )
      .map((task) => {
        const state = task.status.state;
        const last = task.history.at(-1);
        const answer = task.history.findLast((m) => m.role === "agent");
        return {
          id: task.id,
          from: task.metadata.from,
          to: task.metadata.to,
          state,
          // Working, and its mini-me has said it will get back: the asked one decides.
          held: state === "WORKING" && last?.role === "agent",
          text: textOf(task.history[0]),
          ...(answer ? { answer: textOf(answer) } : {}),
          at: Date.parse(task.status.timestamp),
        };
      }),
    waiting: { count: waiting, ...(line ? { text: line } : {}) },
    ...(meeting
      ? {
          meeting: { ...roomMeeting(meeting), ...(mineOut ? { mineOut } : {}) },
        }
      : {}),
  };
}
