// The flows as the mini-me's tools: `flows` to see them, free to use; `flow_manage` to make or
// change one, which the person is asked first (a card shows the flow), as Claude Code asks before a
// tool it was not told to allow. Shaped after Hermes Agent's cronjob tool: a schedule and a request
// complete on its own, and changing a flow the person has rather than making a near-copy.

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
    'When it runs, worked out by you from their words. weekly: `days` (0 Sunday … 6 Saturday; all seven for every day) and `time` ("HH:MM", their own clock). every: `minutes`, at least 30. once: `in_minutes` from now (for "in an hour": never work out the clock yourself), or `at` ("YYYY-MM-DDTHH:MM", their own clock).',
  properties: {
    kind: { type: "string", enum: ["weekly", "every", "once"] },
    days: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
    time: { type: "string" },
    minutes: { type: "integer", minimum: 30 },
    in_minutes: { type: "integer", minimum: 1 },
    at: { type: "string" },
  },
  required: ["kind"],
};

export const FLOWS_TOOL = {
  name: "flows",
  description:
    'Your person\'s flows: the things you do on your own at set times ("every weekday at 9, sum up what is waiting for me"), each with when it runs next and how its last run went. Also the time now on their computer. Look here before making one, so you change a flow they have rather than make a near-copy.',
  inputSchema: { type: "object", properties: {} },
};

export const FLOW_MANAGE_TOOL = {
  name: "flow_manage",
  description:
    'Make, change, pause, resume or remove one of your person\'s flows: something you do on your own at set times, again and again or once later. Only when they ask for that ("every Friday at 5, list what I finished this week", "remind me in an hour to call Ana"); for anything to do now, just do it. `what` is the request you will get at that time with nobody to ask and none of this conversation, so make it complete on its own: what to look at, what to bring back, how short. They are asked first, with the flow shown. A flow\'s answer goes into its own conversation on their page. You cannot run one now from here; do it in this conversation instead if they want to see it.',
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
        description: "The request, complete on its own.",
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
  if (name === FLOWS_TOOL.name)
    return {
      result: {
        now: `${localStamp(now).replace("T", " ")} (${DAYS[now.getDay()]})`,
        flows: (await listFlows()).map((flow) => view(flow, now)),
      },
      isError: false,
    };
  const action = String(args.action ?? "");
  const text = (value: unknown, max: number) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  if (action === "create") {
    const flowName = text(args.name, 80);
    const what = text(args.what, 4000);
    const when = cleanWhen(args.when, now);
    if (!flowName || !what || !when)
      return {
        result:
          "A flow needs a name, a request complete on its own, and when it runs (see the `when` field: weekly days and time, every 30 minutes or more, or once).",
        isError: true,
      };
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
    if (action === "resume")
      return { ...flow, paused: false, seen: now.toISOString() };
    if (action === "update") {
      const when =
        args.when === undefined ? flow.when : cleanWhen(args.when, now);
      if (!when) {
        error = "That is not a schedule (see the `when` field).";
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
