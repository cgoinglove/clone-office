import * as z from "zod";
import {
  chatGptAccount,
  chatGptModels,
  startSignIn as chatGptSignIn,
  signOut as chatGptSignOut,
} from "@/features/minime/brain/chatgpt";
import {
  BrainError,
  brainChoice,
  brainChosen,
  checkKey,
  keyedProviders,
  setBrainChoice,
  setProviderKey,
} from "@/features/minime/brain/choice";
import { probeBrain } from "@/features/minime/brain/probe";
import { PROVIDERS, provider } from "@/features/minime/brain/providers";
import { hasClaudeCode } from "@/features/minime/server/brain";
import { refuse } from "@/features/minime/server/guard";

/** Whether a model server answers on this computer at an address, without waiting long. */
async function answers(address: string): Promise<boolean> {
  try {
    return (await fetch(address, { signal: AbortSignal.timeout(400) })).ok;
  } catch {
    return false;
  }
}

// What the person's clone thinks with, and what this computer offers: Claude Code installed, a
// ChatGPT plan signed in to (and the models it lists), Ollama or LM Studio running. The keys never
// come back to the page; it hears only which vendors have one.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const [account, ollama, lmstudio] = await Promise.all([
    chatGptAccount(),
    answers("http://127.0.0.1:11434/v1/models"),
    answers("http://127.0.0.1:1234/v1/models"),
  ]);
  return Response.json({
    choice: await brainChoice(),
    chosen: await brainChosen(),
    claudeCode: hasClaudeCode(),
    keyed: await keyedProviders(),
    chatgpt: account
      ? {
          ...account,
          models: await chatGptModels().catch(() => []),
        }
      : null,
    local: { ollama, lmstudio },
  });
}

const ProviderId = z.enum(
  PROVIDERS.map((entry) => entry.id) as [string, ...string[]],
);
const Address = z.string().url().max(300);

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("claude-code"),
    // An alias Claude Code knows (haiku, sonnet, opus) or a full model name.
    model: z
      .string()
      .trim()
      .regex(/^[\w.-]{2,60}$/)
      .optional(),
  }),
  z.object({
    action: z.literal("use"),
    provider: ProviderId,
    model: z.string().trim().min(1).max(200),
    baseUrl: Address.optional(),
  }),
  z.object({
    action: z.literal("key"),
    provider: ProviderId,
    key: z.string().trim().max(500),
    baseUrl: Address.optional(),
  }),
  z.object({ action: z.literal("forget-key"), provider: ProviderId }),
  z.object({ action: z.literal("chatgpt-sign-in") }),
  /** Ask the picked brain one word, to see that it answers (`probe.ts`). */
  z.object({ action: z.literal("probe") }),
  z.object({ action: z.literal("chatgpt-sign-out") }),
]);

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const input = body.data;
  try {
    if (input.action === "probe") return Response.json(await probeBrain());
    if (input.action === "chatgpt-sign-in") {
      // OpenAI sends the person back to 127.0.0.1 on the port this app answers on.
      const port =
        Number(request.headers.get("host")?.split(":").at(-1)) ||
        Number(new URL(request.url).port) ||
        80;
      return Response.json({ authorize: await chatGptSignIn(port) });
    }
    if (input.action === "chatgpt-sign-out") {
      await chatGptSignOut();
      return Response.json({ ok: true });
    }
    if (input.action === "claude-code")
      await setBrainChoice({
        kind: "claude-code",
        ...(input.model ? { model: input.model } : {}),
      });
    else if (input.action === "key") {
      // A vendor's key is checked before it is kept; a model on this computer is asked whether it answers.
      if (input.provider !== "local" && input.key.length < 8)
        return Response.json({ error: "brain-key-wrong" }, { status: 400 });
      await checkKey(input.provider as never, input.key, input.baseUrl);
      await setProviderKey(input.provider as never, input.key || undefined);
    } else if (input.action === "forget-key")
      await setProviderKey(input.provider as never, undefined);
    else {
      const id = input.provider as Parameters<typeof provider>[0];
      if (id === "chatgpt" && !(await chatGptAccount()))
        return Response.json(
          { error: "brain-chatgpt-signed-out" },
          { status: 400 },
        );
      if (
        id !== "local" &&
        id !== "chatgpt" &&
        !(await keyedProviders()).includes(id as never)
      )
        return Response.json({ error: "brain-key-missing" }, { status: 400 });
      if (id === "local")
        await checkKey(
          "local",
          "",
          input.baseUrl ?? provider("local")?.baseUrl,
        );
      await setBrainChoice({
        kind: "api",
        provider: id as never,
        model: input.model,
        ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
      });
    }
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return Response.json(
      {
        error:
          error instanceof BrainError || typeof code === "string"
            ? String(code)
            : "brain-unreachable",
      },
      { status: 400 },
    );
  }
  return Response.json({
    choice: await brainChoice(),
    keyed: await keyedProviders(),
  });
}
