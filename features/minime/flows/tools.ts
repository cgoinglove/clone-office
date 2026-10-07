// The flows as the mini-me's tools: `flows` to see them, free to use; `flow_manage` to make or
// change one, which the person is asked first (a card shows the flow), as Claude Code asks before a
// tool it was not told to allow. Shaped after Hermes Agent's cronjob tool: a schedule and a request
// complete on its own, and changing a flow the person has rather than making a near-copy. A flow
// may also be how the person wants a kind of colleague's request handled, read while answering one.

import { threatMessage } from "../memory/threats.ts";
import { loadMenu } from "../office/menu.ts";
import { cleanWhen, localStamp, nextRun, type When } from "./schedule.ts";
import {
  addFlow,
  changeFlow,
  type Flow,
  getFlow,
  listFlows,
  newFlowId,
} from "./store.ts";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** A schedule in plain English, for the mini-me (the screen writes it in the person's language). */
export function describeWhen(when: When): string {
  if (when.kind === "request")
    return when.menu
      ? `when a colleague's request of the kind ${when.menu} comes in`
      : "when any colleague's request comes in";
  if (when.kind === "every")
    return when.minutes % 60 === 0
      ? `every ${when.minutes / 60} hour(s)`
      : `every ${when.minutes} minutes`;
  if (when.kind === "once") return `once, at ${when.at.replace("T", " ")}`;
  const days =
    when.days.length === 7
      ? "every day"
      : when.days.join(",") === "1,2,3,4,5"
        ? "weekdays"
        : when.days.map((day) => DAYS[day]).join(", ");
  return `${days} at ${when.time}`;
}

const WHEN_SCHEMA = {
  type: "object",
  description:
    'When it runs, worked out by you from their words. weekly: `days` (0 Sunday … 6 Saturday; all seven for every day) and `time` ("HH:MM", their own clock). every: `minutes`, at least 30. once: `in_minutes` from now (for "in an hour": never work out the clock yourself), or `at` ("YYYY-MM-DDTHH:MM", their own clock). request: when a colleague\'s request comes in, of the kind `menu` (an id from `flows`), or any request without one; `what` is then how they want those handled, which you follow while answering such a request.',
  properties: {
    kind: { type: "string", enum: ["weekly", "every", "once", "request"] },
    days: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
    time: { type: "string" },
    minutes: { type: "integer", minimum: 30 },
    in_minutes: { type: "integer", minimum: 1 },
    at: { type: "string" },
    menu: { type: "string" },
  },
  required: ["kind"],
};

export const FLOWS_TOOL = {
  name: "flows",
  description:
    'Your person\'s flows: what you do on your own at set times ("every weekday at 9, sum up what is waiting for me") or when a colleague\'s request comes in ("when someone asks about the payments API, check with my api conversation first"), each with when it runs next and how its last run went. Also the time now on their computer and the kinds of request they take (`menu`). Look here before making one, so you change a flow they have rather than make a near-copy.',
  inputSchema: { type: "object", properties: {} },
};

export const FLOW_MANAGE_TOOL = {
  name: "flow_manage",
  description:
    'Make, change, pause, resume or remove one of your person\'s flows: something you do on your own at set times, again and again or once later, or how to handle a kind of colleague\'s request when it comes in. Only when they ask for that ("every Friday at 5, list what I finished this week", "remind me in an hour to call Ana", "when someone asks for a code review, have my web-app conversation look first"); for anything to do now, just do it. For a set time, `what` is the request you will get then with nobody to ask and none of this conversation, so make it complete on its own: what to look at, what to bring back, how short. For a colleague\'s request, `what` is how they want it handled. They are asked first, with the flow shown. A timed flow\'s answer goes into its own conversation on their page. You cannot run one now from here; do it in this conversation instead if they want to see it.',
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "update", "pause", "resume", "remove"],
      },
      id: {
        type: "string",
        description: "The flow, for every action but create (from `flows`).",
      },
      name: {
        type: "string",
        description: "A short name they will recognise, in their language.",
      },
      when: WHEN_SCHEMA,
      what: {
        type: "string",
        description:
          "The request, complete on its own; or, for a colleague's request, how to handle it.",
      },
    },
    required: ["action"],
  },
};

function view(flow: Flow, now: Date) {
  const next = flow.paused
    ? undefined
    : nextRun(
        flow.when,
        flow.seen ? new Date(flow.seen) : now,
        new Date(flow.created),
      );
  return {
    id: flow.id,
    name: flow.name,
    when: describeWhen(flow.when),
    what: flow.what,
    paused: Boolean(flow.paused),
    next: next ? localStamp(next) : null,
    last: flow.last
      ? {
          at: localStamp(new Date(flow.last.at)),
          result: flow.last.missed
            ? "missed"
            : flow.last.ok
              ? "done"
              : "failed",
        }
      : null,
  };
}

export async function callFlowTool(
  name: string,
  args: Record<string, unknown>,
  now = new Date(),
): Promise<{ result: unknown; isError: boolean }> {
  const menu = await loadMenu();
  if (name === FLOWS_TOOL.name)
    return {
      result: {
        now: `${localStamp(now).replace("T", " ")} (${DAYS[now.getDay()]})`,
        menu: menu.map((item) => ({ id: item.id, name: item.name })),
        flows: (await listFlows()).map((flow) => view(flow, now)),
      },
      isError: false,
    };
  // A request flow names a kind they take, or none for every request.
  const unknownKind = (when: When | undefined) =>
    when?.kind === "request" &&
    when.menu !== undefined &&
    !menu.some((item) => item.id === when.menu);
  const kinds = menu.length
    ? `The kinds they take: ${menu.map((item) => `${item.id} (${item.name})`).join(", ")}.`
    : "They take no kinds yet: leave out menu for any request.";
  const action = String(args.action ?? "");
  const text = (value: unknown, _max: number) =>
    typeof value === "string" ? value.trim() : "";
  // What the person approved is what is kept: too long is refused, never cut.
  if (text(args.name, 80).length > 80 || text(args.what, 4000).length > 4000)
    return {
      result:
        "Too long to keep: a flow's name takes 80 characters and its request 4,000. Make it shorter and ask again.",
      isError: true,
    };
  // What runs later with nobody watching is checked as memory is: no hidden instructions, no
  // invisible characters behind what the card showed (Hermes Agent scans its jobs the same way).
  const threat = threatMessage(
    `${text(args.name, 80)}\n${text(args.what, 4000)}`,
  );
  if (threat) return { result: threat, isError: true };
  if (action === "create") {
    const flowName = text(args.name, 80);
    const what = text(args.what, 4000);
    const when = cleanWhen(args.when, now);
    if (!flowName || !what || !when)
      return {
        result:
          "A flow needs a name, a request complete on its own, and when it runs (see the `when` field: weekly days and time, every 30 minutes or more, once, or a colleague's request).",
        isError: true,
      };
    if (unknownKind(when))
      return { result: `No such kind of request. ${kinds}`, isError: true };
    const flow: Flow = {
      id: newFlowId(flowName),
      name: flowName,
      when,
      what,
      created: now.toISOString(),
    };
    await addFlow(flow);
    return { result: { made: view(flow, now) }, isError: false };
  }
  const id = text(args.id, 80);
  if (!id || !(await getFlow(id)))
    return { result: "Which flow? Give its id from `flows`.", isError: true };
  let error: string | undefined;
  const changed = await changeFlow(id, (flow) => {
    if (action === "remove") return undefined;
    if (action === "pause") return { ...flow, paused: true };
    if (action === "resume") return { ...flow, paused: false };
    if (action === "update") {
      const when =
        args.when === undefined ? flow.when : cleanWhen(args.when, now);
      if (!when) {
        error = "That is not a schedule (see the `when` field).";
        return flow;
      }
      if (unknownKind(when)) {
        error = `No such kind of request. ${kinds}`;
        return flow;
      }
      return {
        ...flow,
        name: text(args.name, 80) || flow.name,
        what: text(args.what, 4000) || flow.what,
        when,
        // A new schedule starts from now: nothing before it is made up.
        ...(args.when === undefined ? {} : { seen: now.toISOString() }),
      };
    }
    error = `Unknown action: ${action}`;
    return flow;
  });
  if (error) return { result: error, isError: true };
  if (action === "remove") return { result: `Removed ${id}.`, isError: false };
  if (!changed)
    return { result: `No flow '${id}'. See \`flows\`.`, isError: true };
  return { result: { flow: view(changed, now) }, isError: false };
}
