// What the app hands the office room (office.mjs), and what it gets back.

/** A member of the office, as their card on the relay says. */
export interface RoomPerson {
  id: string;
  name: string;
  /** Their card's line about what they do. */
  role?: string;
  /** The viewer. */
  mine?: boolean;
  /** At the desk, away (their clone on duty), or computer off. */
  status: "active" | "away" | "offline";
  /** Away in a meeting. */
  inMeeting?: boolean;
  /** How to work with them, their ME.md lines. */
  ways?: string[];
  /** The kinds of request they take. */
  menu?: string[];
}

export type RoomState =
  | "SUBMITTED"
  | "WORKING"
  | "INPUT_REQUIRED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
  | "REJECTED";

/** A request between two members that the viewer is part of. */
export interface RoomRequest {
  id: string;
  from: string;
  to: string;
  state: RoomState;
  /** Working, and the asked one's mini-me has said it will get back: it waits on its person. */
  held?: boolean;
  /** The request, as asked. */
  text: string;
  /** The last answer, when there is one. */
  answer?: string;
  /** When its state last changed, in ms. */
  at: number;
}

/** One thing a mini-me said in a meeting (empty text: it passed). */
export interface RoomPost {
  id: string;
  from: string;
  round: number;
  /** The post it answers. */
  replyTo?: string;
  text: string;
}

/** The office's meeting of the mini-mes now, or just over: its members gather and speak. */
export interface RoomMeeting {
  id: string;
  state: "open" | "closed";
  members: string[];
  posts: RoomPost[];
  /** The viewer's own clone sits this one out: it stays at its desk. */
  mineOut?: boolean;
}

export interface RoomData {
  people: RoomPerson[];
  requests: RoomRequest[];
  /** Questions waiting for the viewer, and the first of them in a line. */
  waiting: { count: number; text?: string };
  /** A meeting of the mini-mes going on, or just over. */
  meeting?: RoomMeeting;
}

type Name = (name: string) => string;
type Count = (count: number) => string;

/** Every word the office writes, in the screen's language. */
export interface RoomWords {
  label: string;
  team: string;
  floor: (n: number) => string;
  floorGroup: string;
  done: string;
  answer: string;
  needsYouChip: string;
  yourMiniMe: string;
  miniMe: Name;
  requestState: (state: RoomState) => string;
  views: {
    label: string;
    desk: string;
    office: string;
    zoomIn: string;
    zoomOut: string;
  };
  composer: {
    placeholder: string;
    send: string;
    askFor: (name: string, what: string) => string;
    askText: (name: string, what: string) => string;
  };
  /** The clock on the wall: the word over how many are in. */
  clock: { in: string };
  plate: {
    youShort: string;
    you: Name;
    needsYou: string;
    deciding: string;
    /** At work on a colleague's request, or on the viewer's own. */
    workingFor: Name;
    workingForYou: string;
    away: string;
    inMeeting: string;
    goingTo: Name;
    /** At an empty desk: its person has gone home. */
    off: string;
  };
  say: {
    isIn: Name;
    bye: Name;
    bring: (to: string, from: string, what: string) => string;
    leftOnDesk: Name;
  };
  meeting: {
    /** What a mini-me in the meeting is on, for its plate, the board and its panel. */
    on: string;
  };
  lobby: {
    /** "Good afternoon, Ada", by the hour. */
    greeting: (hour: number, name: string) => string;
    /** Who is in out of everyone on the floor, the viewer too, as the wall clock counts. */
    in: (count: number, of: number) => string;
    alone: string;
    /** What the drawing is while it shows the building. */
    label: string;
    waiting: Count;
    clockIn: string;
    enter: string;
    foot: string;
    floors: (count: number) => string;
    yourFloor: string;
  };
  panel: {
    close: string;
    atDesk: string;
    away: string;
    needsYou: string;
    waitingOn: Name;
    onDesk: string;
    doneToday: string;
    asked: string;
    now: string;
    workingOn: (what: string) => string;
    waitingFor: Name;
    waitingForYou: string;
    free: string;
    notIn: Name;
    ways: Name;
    myMenu: string;
    menu: Name;
    earlier: string;
    nothingYet: string;
  };
}

export interface Room {
  /** The relay's latest look: what changed since the last plays out on the floor. */
  update(data: RoomData): void;
  /**
   * Keeps this many pixels clear at the right and left (a panel laid over the office), and reframes.
   * `rightHeight`, when the panel at the right ends partway down: the floor may pass beneath it.
   */
  setInset(right: number, left?: number, rightHeight?: number): void;
  /** Closes the panel about one person, if it is open, and goes back to the whole office. */
  closePanel(): void;
  destroy(): void;
}

export function createOffice(
  root: HTMLElement,
  options: {
    words: RoomWords;
    /** The screen's language, for the clock's date. */
    locale: string;
    /** Opens what waits for the viewer (their mini-me's question). */
    onAnswer?: () => void;
    /** Hands a request to the viewer's mini-me; the box over the office shows only with it. */
    onAsk?: (text: string) => void;
    /** Opens at the lobby: the building and a card to clock in, then the lift up. */
    lobby?: boolean;
    /** Clocked in at the lobby: called as the lift's doors open on the floor. */
    onClockIn?: () => void;
    /** The panel about one person opened (true) or closed (false). */
    onPanel?: (open: boolean) => void;
    /** 30 runs the office on every other frame. */
    fps?: 30 | 60;
    /** An example (the first steps): everyone seated from the start, each named, the desks framed close. */
    example?: boolean;
    /** The page shows what waits on the viewer itself: the office marks it on their clone (its dot, its tag) and asks nothing over its head. */
    turnShown?: boolean;
  },
): Room;

/** A mini-me's colour (by place in the relay's list), shape and paint. */
export function looksOf(
  person: { id: string; mine?: boolean },
  index?: number,
): {
  color: string;
  shape: string;
  paint: string | null;
};
