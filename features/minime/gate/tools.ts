// The gate's two tools in the mini-me's tool server, present only in a conversation with the person
// (the app passes MINIME_GATE_URL, MINIME_GATE_SECRET and MINIME_CHAT_ID):
// - ask_me: the mini-me asks its person something only they can decide, as a card on their screen
//   (Claude Code's AskUserQuestion, for a session that runs without a terminal);
// - permission_prompt: Claude Code asks through it before a tool the person has not let the
//   mini-me use alone (--permission-prompt-tool), so the card decides, not the model.
// Both wait for the answer; a question nobody answers in ten minutes is reported as unanswered.

const GATE = {
  url: process.env.MINIME_GATE_URL,
  secret: process.env.MINIME_GATE_SECRET ?? "",
  chat: process.env.MINIME_CHAT_ID,
};

export const gateOpen = Boolean(GATE.url);

/** In a conversation with the person (not while answering a colleague): the office's two tools. */
export const colleaguesOpen = gateOpen && process.env.MINIME_COLLEAGUES === "1";

export const COLLEAGUES_TOOL = {
  name: "colleagues",
  description:
    "Who is in your person's office: each colleague's mini-me, by name, with what they do, how they like to be worked with (follow it when asking them), and whether they are around. Look here before asking someone.",
  inputSchema: { type: "object", properties: {} },
};

export const ASK_COLLEAGUE_TOOL = {
  name: "ask_colleague",
  description:
    "Send a request to a colleague's mini-me on your person's behalf, when your person asks you to: a question, a check, or a piece of work that is the colleague's. Write it as your person would, short and complete (what, by when, why). Your person is asked before it goes. The answer comes later and is put into this conversation; tell your person it was sent. Promises, decisions and anything about relationships stay your person's.",
  inputSchema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "The colleague's name or id, from colleagues",
      },
      request: { type: "string" },
    },
    required: ["to", "request"],
  },
};

export const ASK_TOOL = {
  name: "ask_me",
  description:
    "Ask your person something only they can decide, when you cannot go on well without it: a choice between options, a confirmation, or a fact only they know. It shows as a card on their screen and waits for their answer (up to ten minutes). Ask one short question, in their language, with up to four short choices when there are choices; they can also write their own answer. Do not ask what you can look up or decide yourself, and do not ask for permission to use a tool: the app asks for you when it is needed.",
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string" },
      choices: { type: "array", items: { type: "string" }, maxItems: 4 },
    },
    required: ["question"],
  },
};

export const PERMISSION_TOOL = {
  name: "permission_prompt",
  description:
    "Used by the app, not by you: asks your person before a tool runs that they have not let you use alone.",
  inputSchema: {
    type: "object",
    properties: {
      tool_name: { type: "string" },
      input: { type: "object" },
      tool_use_id: { type: "string" },
    },
    required: ["tool_name", "input"],
  },
};

type Answer =
  | { answered: true; answer: string; always?: boolean }
  | { answered: false };

async function post(
  body: unknown,
  path?: string,
): Promise<Record<string, unknown>> {
  const url = path ? new URL(path, GATE.url).toString() : (GATE.url as string);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sub-office": "1",
      "x-minime-gate": GATE.secret,
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `The app answered ${response.status}.`,
    );
  return data;
}

/** Put the question to the person and wait, asking again while the app says it is still waiting. */
async function ask(ask: Record<string, unknown>): Promise<Answer> {
  let reply = await post({ chat: GATE.chat, ask });
  while (reply.waiting) reply = await post({ id: reply.id });
  return reply.answered
    ? {
        answered: true,
        answer: String(reply.answer ?? ""),
        always: Boolean(reply.always),
      }
    : { answered: false };
}

export async function callGateTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: string; isError: boolean }> {
  if (!gateOpen)
    return {
      result:
        name === PERMISSION_TOOL.name
          ? JSON.stringify({
              behavior: "deny",
              message: "Nobody can be asked now.",
            })
          : "Your person cannot be asked now. Go on without it, and say what you would need from them.",
      isError: name !== PERMISSION_TOOL.name,
    };
  try {
    if (name === COLLEAGUES_TOOL.name) {
      const { members } = await post(
        { action: "members" },
        "/api/me/office/mcp",
      );
      return { result: JSON.stringify(members), isError: false };
    }
    if (name === ASK_COLLEAGUE_TOOL.name) {
      const { sent } = await post(
        {
          action: "send",
          to: String(args.to ?? ""),
          text: String(args.request ?? ""),
          chat: GATE.chat,
        },
        "/api/me/office/mcp",
      );
      return {
        result: `Sent to ${(sent as { to?: string })?.to ?? args.to}. The answer will be put into this conversation when it comes.`,
        isError: false,
      };
    }
    if (name === ASK_TOOL.name) {
      const choices = Array.isArray(args.choices)
        ? args.choices.map(String).slice(0, 4)
        : undefined;
      const answer = await ask({
        kind: "question",
        question: String(args.question ?? ""),
        ...(choices?.length ? { choices } : {}),
      });
      return {
        result: answer.answered
          ? `They answered: ${answer.answer}`
          : GATE.chat?.startsWith("office-request-")
            ? "They have not answered yet; they will answer later, and you will go on then. Do not assume an answer: set waiting_on_person."
            : "They did not answer within ten minutes. Do not assume an answer; say what you need from them.",
        isError: false,
      };
    }
    const input = (args.input ?? {}) as Record<string, unknown>;
    const answer = await ask({
      kind: "permission",
      tool: String(args.tool_name ?? ""),
      input,
    });
    return {
      result: JSON.stringify(
        answer.answered && answer.answer === "allow"
          ? { behavior: "allow", updatedInput: input }
          : {
              behavior: "deny",
              message: answer.answered
                ? "Your person said no. Do not try another way to do the same thing; tell them what you could not do."
                : "Your person did not answer in time. Tell them what you wanted to do and why.",
            },
      ),
      isError: false,
    };
  } catch (error) {
    return {
      result:
        name === PERMISSION_TOOL.name
          ? JSON.stringify({
              behavior: "deny",
              message: `The app could not ask: ${(error as Error).message}`,
            })
          : `The app could not ask: ${(error as Error).message}`,
      isError: name !== PERMISSION_TOOL.name,
    };
  }
}
