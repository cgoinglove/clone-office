import * as z from "zod";
import { CONNECTORS } from "@/features/minime/connectors/catalog";
import {
  ConnectorError,
  disconnect,
  isConnected,
  setToken,
  startConnect,
} from "@/features/minime/connectors/oauth";
import { loadKept } from "@/features/minime/connectors/store";
import {
  clientFor,
  forgetClient,
  saveClient,
} from "@/features/minime/connectors/team";
import { loadOffice, members } from "@/features/minime/office/client";
import { refuse } from "@/features/minime/server/guard";

// The services the mini-me can work in, as the person's page sees them: which are connected, and
// for a vendor that wants an OAuth client registered first, whether the team (or they) did.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const office = await loadOffice();
  const google = await clientFor("google").catch(() => undefined);
  // Who set the office's client, by their card's name.
  let by: string | undefined;
  if (office && google?.by) {
    const { members: everyone } = await members(office).catch(() => ({
      members: [],
    }));
    by = everyone.find((member) => member.id === google.by)?.card.name;
  }
  const connectors = [];
  for (const entry of CONNECTORS) {
    const kept = await loadKept(entry.id);
    connectors.push({
      id: entry.id,
      name: entry.name,
      kind: entry.auth.kind,
      docs: entry.docs,
      ...(entry.auth.kind === "token" ? { make: entry.auth.make } : {}),
      ...(entry.auth.kind === "team-oauth"
        ? { provider: entry.auth.provider }
        : {}),
      connected: isConnected(kept),
      ...(kept.connected ? { since: kept.connected } : {}),
    });
  }
  return Response.json({
    connectors,
    inOffice: Boolean(office),
    clients: {
      google: google ? { from: google.from, ...(by ? { by } : {}) } : null,
    },
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), id: z.string().max(40) }),
  z.object({
    action: z.literal("token"),
    id: z.string().max(40),
    token: z.string().max(500),
  }),
  z.object({ action: z.literal("disconnect"), id: z.string().max(40) }),
  z.object({
    action: z.literal("client"),
    provider: z.literal("google"),
    json: z.string().max(5000).optional(),
    clientId: z.string().max(300).optional(),
    clientSecret: z.string().max(300).optional(),
    team: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("forget-client"),
    provider: z.literal("google"),
    from: z.enum(["team", "own"]),
  }),
]);

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const input = body.data;
  try {
    if (input.action === "connect") {
      // The service sends the person back here, to this app by the name their browser used (the
      // Host it sent: the server may know itself by another, see guard.ts).
      const own = new URL(request.url);
      const host = request.headers.get("host") ?? own.host;
      if (!/^[a-z0-9.:[\]-]+$/i.test(host))
        return Response.json({ error: "bad-request" }, { status: 400 });
      const redirect = `${own.protocol}//${host}/api/me/connectors/callback`;
      const authorize = await startConnect(input.id, redirect, {
        team: async (provider) => (await clientFor(provider))?.client,
      });
      return Response.json({ authorize });
    }
    if (input.action === "token") await setToken(input.id, input.token);
    else if (input.action === "disconnect") await disconnect(input.id);
    else if (input.action === "client")
      return Response.json({
        saved: await saveClient(input.provider, input, input.team),
      });
    else await forgetClient(input.provider, input.from);
    return Response.json({ ok: true });
  } catch (error) {
    const code =
      error instanceof ConnectorError
        ? error.code
        : (error as Error).message?.startsWith("connector-")
          ? (error as Error).message
          : "connector-refused";
    return Response.json({ error: code }, { status: 400 });
  }
}
