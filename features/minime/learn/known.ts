// One thing the first reading kept, as the screen names it to take it back (learn/forget.ts does
// it on the server): a line of memory by its words, a page or a place by its path. Plain data and
// a pure function, shared by the server and the page.

export type Known =
  /** A line about the person (USER.md) or about their work's surroundings (MEMORY.md). */
  | { kind: "user" | "work"; text: string }
  /** A page of the notes, or a place on the map of where their work lives. */
  | { kind: "projects" | "people" | "places"; path: string };

interface KnowsShape {
  user: { text: string }[];
  work: string[];
  projects: { path: string }[];
  people: { path: string }[];
  places?: { path: string }[];
}

/** What a reading knows, without one thing it kept. */
export function withoutKnown<K extends KnowsShape>(knows: K, item: Known): K {
  switch (item.kind) {
    case "user":
      return {
        ...knows,
        user: knows.user.filter((one) => one.text !== item.text),
      };
    case "work":
      return { ...knows, work: knows.work.filter((one) => one !== item.text) };
    case "places":
      return {
        ...knows,
        places: knows.places?.filter((one) => one.path !== item.path),
      };
    default:
      return {
        ...knows,
        [item.kind]: knows[item.kind].filter((one) => one.path !== item.path),
      };
  }
}
