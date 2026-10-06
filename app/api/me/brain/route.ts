import * as z from "zod";
import {
  BrainError,
  brainChoice,
  checkKey,
  keyedProviders,
  setBrainChoice,
  setProviderKey,
} from "@/features/minime/brain/choice";
import { PROVIDERS, provider } from "@/features/minime/brain/providers";
import { hasClaudeCode } from "@/features/minime/server/brain";
import { refuse } from "@/features/minime/server/guard";

// What the person's mini-me thinks with: their own Claude Code, or a model reached with their key
// (or on this computer). The keys never come back to the page; it hears only which vendors have one.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json({
    choice: await brainChoice(),
    claudeCode: hasClaudeCode(),
    keyed: await keyedProviders(),
  });
}

const ProviderId = z.enum(
  PROVIDERS.map((entry) => entry.id) as [string, ...string[]],
);
const Address = z.string().url().max(300);

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claude-code") }),
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
]);

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const input = body.data;
  try {
    if (input.action === "claude-code")
      await setBrainChoice({ kind: "claude-code" });
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
      if (id !== "local" && !(await keyedProviders()).includes(id as never))
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
    return Response.json(
      { error: error instanceof BrainError ? error.code : "brain-unreachable" },
      { status: 400 },
    );
  }
  return Response.json({
    choice: await brainChoice(),
    keyed: await keyedProviders(),
  });
}
