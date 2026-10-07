// The relay's A2A face (a2a-protocol.org v1.0, its JSON-RPC binding): every member is an A2A agent
// at /a2a/<member>, its Agent Card at /a2a/<member>/.well-known/agent-card.json. Any A2A client
// (another framework's agent, Hermes Agent's a2a tools, the official SDKs) asks a colleague's
// clone the way a clone does: it is a member of the office, and its own member token is its
// bearer. A request made here is the same request as one made through the relay's own routes:
// the clone asked answers it as it answers any colleague (its person decides what is theirs), and
// both sides see it with their other requests.
//
// Requests are one task each and carry text; a file of the relay's goes out as a file part the
// caller fetches with its token, and a file part that comes in is named by its address in the
// text, never fetched. Waiting for the answer (SendMessage without returnImmediately) holds the
// call until the clone answers, asks back or the wait ends, then answers the task as it is; a
// client asks again with GetTask. Streaming and push notifications are not offered.

import {
  type Caller,
  type Card,
  FINAL,
  type Member,
  type Message,
  type Relay,
  RelayError,
  type Task,
} from "./relay.ts";

export const PROTOCOL_VERSION = "1.0";

/** How long a SendMessage waits for the clone's answer before answering the task as it is. */
const WAIT_MS = (Number(process.env.RELAY_A2A_WAIT_S) || 110) * 1000;

/** JSON-RPC's own codes, and A2A's (specification, JSON-RPC binding). */
export const A2A_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  taskNotFound: -32001,
  taskNotCancelable: -32002,
  pushNotSupported: -32003,
  unsupported: -32004,
  contentType: -32005,
  extendedCardNotConfigured: -32007,
  versionNotSupported: -32009,
} as const;

type RpcId = string | number | null;

export interface RpcResponse {
  jsonrpc: "2.0";
  id: RpcId;
  result?: unknown;
  error?: { code: number; message: string };
}

const ok = (id: RpcId, result: unknown): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
});

const fail = (id: RpcId, code: number, message: string): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

/** A member's Agent Card: who they are, what they take, and how to reach their clone. */
export function agentCard(
  member: Member,
  url: string,
): Record<string, unknown> {
  const card: Card = member.card;
  const owns = card.owns?.length
    ? `\n\nLooks after: ${card.owns.join("; ")}`
    : "";
  const ways = card.howToWork?.length
    ? `\n\nHow to work with them:\n${card.howToWork.map((line) => `- ${line}`).join("\n")}`
    : "";
  return {
    name: card.name,
    description: `${card.description || `${card.name}'s clone`}${owns}${ways}`,
    supportedInterfaces: [
      { url, protocolBinding: "JSONRPC", protocolVersion: PROTOCOL_VERSION },
    ],
    version: "1.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    securitySchemes: {
      member: {
        httpAuthSecurityScheme: {
          scheme: "Bearer",
          description: "The caller's own member token in this office.",
        },
      },
    },
    securityRequirements: [{ schemes: { member: { list: [] } } }],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: card.skills?.length
      ? card.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description || skill.name,
          tags: [skill.id],
          ...(skill.examples?.length ? { examples: skill.examples } : {}),
        }))
      : [
          {
            id: "ask",
            name: "Ask",
            description: `Ask ${card.name}'s clone what ${card.name} would answer.`,
            tags: ["ask"],
          },
        ],
  };
}

const STATE_PREFIX = "TASK_STATE_";

/** A relay message as A2A's: its text, and its files as parts the caller fetches with its token. */
function a2aMessage(message: Message, base: string): Record<string, unknown> {
  return {
    messageId: message.messageId,
    contextId: message.contextId,
    taskId: message.taskId,
    role: message.role === "user" ? "ROLE_USER" : "ROLE_AGENT",
    parts: [
      ...(message.parts.some((part) => part.text)
        ? message.parts.map((part) => ({
            text: part.text,
            mediaType: "text/plain",
          }))
        : []),
      ...(message.files ?? []).map((file) => ({
        url: `${base}/files/${file.id}`,
        filename: file.name,
        mediaType: file.type || "application/octet-stream",
      })),
    ],
    metadata: message.metadata,
  };
}

/** A relay request as an A2A Task; its last answer is the task's artifact once it is done. */
export function a2aTask(
  task: Task,
  base: string,
  options: { historyLength?: number; artifacts?: boolean } = {},
): Record<string, unknown> {
  const history =
    options.historyLength === undefined
      ? task.history
      : options.historyLength > 0
        ? task.history.slice(-options.historyLength)
        : [];
  const answer =
    task.status.state === "COMPLETED"
      ? task.history.filter((m) => m.role === "agent").at(-1)
      : undefined;
  const status = task.status.message
    ? { message: a2aMessage(task.status.message, base) }
    : {};
  return {
    id: task.id,
    contextId: task.contextId,
    status: {
      state: `${STATE_PREFIX}${task.status.state}`,
      ...status,
      timestamp: task.status.timestamp,
    },
    ...(answer && options.artifacts !== false
      ? {
          artifacts: [
            {
              artifactId: `${task.id}-answer`,
              name: "answer",
              parts: a2aMessage(answer, base).parts,
            },
          ],
        }
      : {}),
    ...(history.length
      ? { history: history.map((m) => a2aMessage(m, base)) }
      : {}),
    metadata: {
      from: task.metadata.from,
      to: task.metadata.to,
      created: task.metadata.created,
    },
  };
}

/** The words of an A2A message: its text parts; a file is named by its address, never fetched. */
export function messageText(message: unknown): string {
  const parts = (message as { parts?: unknown })?.parts;
  if (!Array.isArray(parts)) return "";
  const out: string[] = [];
  for (const part of parts as Record<string, unknown>[]) {
    if (!part || typeof part !== "object") continue;
    if (typeof part.text === "string") out.push(part.text);
    else if (typeof part.url === "string")
      out.push(
        `[file${typeof part.filename === "string" ? `: ${part.filename}` : ""}] ${part.url}`,
      );
    else if (typeof part.raw === "string")
      out.push(
        `[file${typeof part.filename === "string" ? `: ${part.filename}` : ""}, not taken: send it as a link]`,
      );
    else if (part.data !== undefined) {
      try {
        out.push(JSON.stringify(part.data));
      } catch {
        // A data part that cannot be written as JSON says nothing.
      }
    }
  }
  return out.join("\n").trim();
}

// Methods by their v1.0 names, with the slash names clients before 1.0 send.
const METHODS: Record<string, string> = {
  SendMessage: "send",
  "message/send": "send",
  GetTask: "get",
  "tasks/get": "get",
  ListTasks: "list",
  "tasks/list": "list",
  CancelTask: "cancel",
  "tasks/cancel": "cancel",
  SendStreamingMessage: "stream",
  "message/stream": "stream",
  SubscribeToTask: "stream",
  "tasks/subscribe": "stream",
  "tasks/resubscribe": "stream",
  CreateTaskPushNotificationConfig: "push",
  GetTaskPushNotificationConfig: "push",
  ListTaskPushNotificationConfigs: "push",
  DeleteTaskPushNotificationConfig: "push",
  "tasks/pushNotificationConfig/set": "push",
  "tasks/pushNotificationConfig/get": "push",
  "tasks/pushNotificationConfig/list": "push",
  "tasks/pushNotificationConfig/delete": "push",
  GetExtendedAgentCard: "extended",
  "agent/getAuthenticatedExtendedCard": "extended",
};

/** A2A-Version: 1.0 is served; none means a client from before 1.0, served the same shapes. */
export function versionServed(header: string | undefined): boolean {
  const version = (header ?? "").trim();
  return !version || /^(0\.3|1\.0)(\.\d+)?$/.test(version);
}

/** A request between the caller and the member this endpoint is, or none. */
async function between(
  relay: Relay,
  caller: Caller,
  target: string,
  id: string,
): Promise<Task | undefined> {
  const task = await relay.taskFor(caller, id).catch((error) => {
    if (error instanceof RelayError && error.status === 404) return undefined;
    throw error;
  });
  if (!task) return undefined;
  const other =
    task.metadata.from === caller.id ? task.metadata.to : task.metadata.from;
  return other === target ? task : undefined;
}

/** States after which a waiting SendMessage answers: done, or asking back. */
const settled = (task: Task) =>
  FINAL.includes(task.status.state) || task.status.state === "INPUT_REQUIRED";

/**
 * One JSON-RPC call to the member `target`'s endpoint, by `caller` (already known by its token).
 * Answers the JSON-RPC response; what fails is an error in it, never a thrown one.
 */
export async function a2aCall(
  relay: Relay,
  caller: Caller,
  target: Member,
  request: unknown,
  options: { base: string; version?: string; waitMs?: number },
): Promise<RpcResponse> {
  if (!request || typeof request !== "object" || Array.isArray(request))
    return fail(null, A2A_ERRORS.invalidRequest, "Not a JSON-RPC request.");
  const call = request as { id?: unknown; method?: unknown; params?: unknown };
  const id: RpcId =
    typeof call.id === "string" || typeof call.id === "number" ? call.id : null;
  if (!versionServed(options.version))
    return fail(
      id,
      A2A_ERRORS.versionNotSupported,
      `A2A-Version ${options.version} is not served here; 1.0 is.`,
    );
  const method = typeof call.method === "string" ? call.method : "";
  const kind = METHODS[method];
  if (!kind) return fail(id, A2A_ERRORS.methodNotFound, `No method ${method}.`);
  const params = (
    call.params && typeof call.params === "object" ? call.params : {}
  ) as Record<string, unknown>;
  const v1 = !method.includes("/");
  try {
    if (kind === "stream")
      return fail(
        id,
        A2A_ERRORS.unsupported,
        "Streaming is not offered: send the message and get the task.",
      );
    if (kind === "push")
      return fail(
        id,
        A2A_ERRORS.pushNotSupported,
        "Push notifications are not offered.",
      );
    if (kind === "extended")
      return fail(
        id,
        A2A_ERRORS.extendedCardNotConfigured,
        "There is no extended card.",
      );
    const historyLength =
      typeof params.historyLength === "number" && params.historyLength >= 0
        ? Math.floor(params.historyLength)
        : undefined;
    if (kind === "send") {
      const message = params.message as Record<string, unknown> | undefined;
      const role = String(message?.role ?? "");
      if (!message || (role && role !== "ROLE_USER" && role !== "user"))
        return fail(
          id,
          A2A_ERRORS.invalidParams,
          "Send one message from the one asking (ROLE_USER).",
        );
      const text = messageText(message);
      if (!text)
        return fail(
          id,
          A2A_ERRORS.contentType,
          "A message needs text; files go as links.",
        );
      const contextId =
        typeof message.contextId === "string" && message.contextId
          ? message.contextId
          : typeof params.contextId === "string"
            ? params.contextId
            : undefined;
      // A client that goes on by its conversation alone (Hermes Agent does) goes on with the
      // request still open in it.
      const taskId =
        typeof message.taskId === "string" && message.taskId
          ? message.taskId
          : contextId
            ? (await relay.tasks(caller, 200)).find(
                (task) =>
                  task.contextId === contextId &&
                  task.metadata.from === caller.id &&
                  task.metadata.to === target.id &&
                  !FINAL.includes(task.status.state),
              )?.id
            : undefined;
      let task: Task;
      if (taskId) {
        // Going on with a request: answering what the clone asked back.
        const open = await between(relay, caller, target.id, taskId);
        if (!open || open.metadata.from !== caller.id)
          return fail(id, A2A_ERRORS.taskNotFound, `No task ${taskId}.`);
        if (FINAL.includes(open.status.state))
          return fail(
            id,
            A2A_ERRORS.unsupported,
            "That task is over; send a new message.",
          );
        task = await relay.update(caller, taskId, { text });
      } else task = await relay.send(caller, target.id, text, [], contextId);
      const configuration = (params.configuration ?? {}) as Record<
        string,
        unknown
      >;
      // Before 1.0, `blocking: false` asked not to wait.
      const now =
        configuration.returnImmediately === true ||
        configuration.blocking === false;
      if (!now)
        task = await relay.waitForTask(
          caller,
          task.id,
          settled,
          options.waitMs ?? WAIT_MS,
        );
      const shown = a2aTask(task, options.base, { historyLength });
      return ok(id, v1 ? { task: shown } : shown);
    }
    if (kind === "get") {
      const taskId = String(params.id ?? "");
      const task = taskId
        ? await between(relay, caller, target.id, taskId)
        : undefined;
      if (!task) return fail(id, A2A_ERRORS.taskNotFound, `No task ${taskId}.`);
      return ok(id, a2aTask(task, options.base, { historyLength }));
    }
    if (kind === "list") {
      const contextId =
        typeof params.contextId === "string" ? params.contextId : "";
      const state = typeof params.status === "string" ? params.status : "";
      const pageSize = Math.max(
        1,
        Math.min(Number(params.pageSize) || 50, 100),
      );
      const offset = Math.max(0, Number(params.pageToken) || 0);
      const all = (await relay.tasks(caller, 200)).filter((task) => {
        const other =
          task.metadata.from === caller.id
            ? task.metadata.to
            : task.metadata.from;
        return (
          other === target.id &&
          (!contextId || task.contextId === contextId) &&
          (!state || `${STATE_PREFIX}${task.status.state}` === state)
        );
      });
      const page = all.slice(offset, offset + pageSize);
      return ok(id, {
        tasks: page.map((task) =>
          a2aTask(task, options.base, {
            historyLength: historyLength ?? 0,
            artifacts: params.includeArtifacts === true,
          }),
        ),
        nextPageToken:
          offset + pageSize < all.length ? String(offset + pageSize) : "",
        pageSize,
        totalSize: all.length,
      });
    }
    // cancel: the one asking takes a request back.
    const taskId = String(params.id ?? "");
    const task = taskId
      ? await between(relay, caller, target.id, taskId)
      : undefined;
    if (!task || task.metadata.from !== caller.id)
      return fail(id, A2A_ERRORS.taskNotFound, `No task ${taskId}.`);
    if (FINAL.includes(task.status.state))
      return fail(
        id,
        A2A_ERRORS.taskNotCancelable,
        `Task ${taskId} is already ${task.status.state.toLowerCase()}.`,
      );
    return ok(
      id,
      a2aTask(
        await relay.update(caller, taskId, { state: "CANCELED" }),
        options.base,
      ),
    );
  } catch (error) {
    if (error instanceof RelayError)
      return fail(
        id,
        error.status === 404
          ? A2A_ERRORS.taskNotFound
          : error.status === 400 || error.status === 409
            ? A2A_ERRORS.invalidParams
            : A2A_ERRORS.internal,
        error.message,
      );
    return fail(id, A2A_ERRORS.internal, "The relay failed.");
  }
}
