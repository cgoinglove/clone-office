// Where the OAuth client a vendor wants registered first comes from: the office's, set once by
// anyone on the team for everyone, else the person's own (someone using sub-office alone).

import { loadOffice, setTeamSetting, teamSetting } from "../office/client.ts";
import { ownClient, saveOwnClient, type TeamClient } from "./store.ts";

const settingName = (provider: string) => `connector:${provider}`;

function asClient(value: unknown): TeamClient | undefined {
  const client = value as Partial<TeamClient> | null | undefined;
  return typeof client?.client_id === "string" && client.client_id
    ? {
        client_id: client.client_id,
        ...(typeof client.client_secret === "string"
          ? { client_secret: client.client_secret }
          : {}),
      }
    : undefined;
}

/** The client to use for a vendor, and whose it is. */
export async function clientFor(
  provider: string,
): Promise<
  { client: TeamClient; from: "team" | "own"; by?: string } | undefined
> {
  const office = await loadOffice();
  if (office) {
    const kept = await teamSetting(office, settingName(provider)).catch(
      () => undefined,
    );
    const client = asClient(kept?.value);
    if (client) return { client, from: "team", by: kept?.by };
  }
  const own = await ownClient(provider);
  return own ? { client: own, from: "own" } : undefined;
}

/**
 * The client someone registered at the vendor: for the whole office when `team` (and the person is
 * in one), else for themselves. Pasted as the vendor's JSON file or as its two values.
 */
export async function saveClient(
  provider: string,
  given: { json?: string; clientId?: string; clientSecret?: string },
  team: boolean,
): Promise<"team" | "own"> {
  let client: TeamClient | undefined;
  if (given.json) {
    try {
      // Google's file: {"installed": {...}} for a desktop client, {"web": {...}} for a web one.
      const parsed = JSON.parse(given.json) as Record<string, unknown>;
      client = asClient(parsed.installed ?? parsed.web ?? parsed);
    } catch {
      client = undefined;
    }
  } else if (given.clientId?.trim())
    client = {
      client_id: given.clientId.trim(),
      ...(given.clientSecret?.trim()
        ? { client_secret: given.clientSecret.trim() }
        : {}),
    };
  if (!client) throw new Error("connector-client-wrong");
  const office = team ? await loadOffice() : undefined;
  if (office) {
    await setTeamSetting(office, settingName(provider), client);
    return "team";
  }
  await saveOwnClient(provider, client);
  return "own";
}

export async function forgetClient(
  provider: string,
  from: "team" | "own",
): Promise<void> {
  const office = from === "team" ? await loadOffice() : undefined;
  if (office) await setTeamSetting(office, settingName(provider), null);
  else await saveOwnClient(provider, undefined);
}
