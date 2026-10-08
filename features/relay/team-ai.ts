// Team billing: an office keeps one API key per AI vendor, and its members' clones think with it
// through the relay, which puts the key on each call and passes the answer back as it streams.
// The key never reaches a member's computer: leaving the office ends its use at once, and the
// office sees how many calls each member made. Conversations pass through and are never kept.
//
// The key is sealed before it is stored (lib/seal.ts, after Thursday's lib/secret.ts), with a key
// never kept in the same store as the database: RELAY_ENCRYPTION_KEY, or for an office kept in a
// folder (PGlite), that folder's own secret.key. A relay on a Postgres URL without
// RELAY_ENCRYPTION_KEY keeps no team key and says what to set.
//
// Only API keys come here. A Claude or ChatGPT subscription is its person's own and goes through
// their own computer, as the vendors' terms ask.

import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";
import { keyFrom, newKeyText, openWith, sealWith } from "../../lib/seal.ts";
import { type Caller, type Relay, RelayError } from "./relay.ts";

/** Where each vendor's API is, and the header its SDK carries the key in. */
export const TEAM_AI = {
  openai: {
    base: "https://api.openai.com/v1",
    header: "authorization",
    bearer: true,
    check: "/models",
  },
  anthropic: {
    base: "https://api.anthropic.com/v1",
    header: "x-api-key",
    bearer: false,
    check: "/models",
  },
  google: {
    base: "https://generativelanguage.googleapis.com/v1beta",
    header: "x-goog-api-key",
    bearer: false,
    check: "/models",
  },
  openrouter: {
    base: "https://openrouter.ai/api/v1",
    header: "authorization",
    bearer: true,
    check: "/key",
  },
} as const;

export type TeamProvider = keyof typeof TEAM_AI;
export const TEAM_PROVIDERS = Object.keys(TEAM_AI) as TeamProvider[];
export const isTeamProvider = (value: string): value is TeamProvider =>
  Object.hasOwn(TEAM_AI, value);

/** Headers a call keeps on its way: what the vendors read, never cookies or the member's token. */
const PASSED = [
  "content-type",
  "accept",
  "anthropic-version",
  "anthropic-beta",
  "openai-beta",
  "http-referer",
  "x-title",
];

/** The most one call carries: a long conversation with a few images, not a file store. */
const CALL_BYTES = 32 * 1024 * 1024;

/**
 * The relay's sealing key: RELAY_ENCRYPTION_KEY (32 bytes in base64), else the database folder's
 * own secret.key, made once. Undefined for a Postgres URL without the variable.
 */
export async function relaySealKey(
  folder: string | undefined,
  env = process.env.RELAY_ENCRYPTION_KEY,
): Promise<Buffer | undefined> {
  if (env?.trim()) {
    const key = keyFrom(env);
    if (!key)
      throw new Error(
        "RELAY_ENCRYPTION_KEY is not a key: 32 bytes in base64, as `openssl rand -base64 32` prints them.",
      );
    return key;
  }
  if (!folder || folder === "memory") return undefined;
  const path = join(folder, "secret.key");
  try {
    await writeFile(path, `${newKeyText()}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const key = keyFrom(await readFile(path, "utf8"));
  if (!key)
    throw new Error(
      `${path} is not a key the relay made. Put back the one it had: without it the team keys cannot be read.`,
    );
  return key;
}

interface Kept {
  sealed: string;
  /** The key's last four characters, for people to tell keys apart. */
  hint: string;
}

// Fields written out, not as constructor parameters: the relay runs as Node strips TypeScript
// (`node features/relay/server.ts`), which takes only syntax it can erase.
/** A member's calls with one vendor's team key a day, unless the server says otherwise. */
export const DAILY_CALLS = 1000;

export class TeamAi {
  private relay: Relay;
  private key: Buffer | undefined;
  /** Stands in for the vendors in tests. */
  private bases: Partial<Record<TeamProvider, string>>;
  private ask: typeof fetch;
  /** Calls one member may make with one vendor's key a day; 0 for no limit. */
  private daily: number;

  constructor(
    relay: Relay,
    key: Buffer | undefined,
    bases: Partial<Record<TeamProvider, string>> = {},
    ask: typeof fetch = fetch,
    daily = DAILY_CALLS,
  ) {
    this.relay = relay;
    this.key = key;
    this.bases = bases;
    this.ask = ask;
    this.daily = daily;
  }

  private base(provider: TeamProvider): string {
    return this.bases[provider] ?? TEAM_AI[provider].base;
  }

  private auth(provider: TeamProvider, key: string): Record<string, string> {
    const { header, bearer } = TEAM_AI[provider];
    return { [header]: bearer ? `Bearer ${key}` : key };
  }

  /** The office's team keys as its members see them: which vendors, a hint, who set each. */
  async list(me: Caller) {
    const keys = [];
    for (const provider of TEAM_PROVIDERS) {
      const kept = await this.relay.officeSecret(me.office, `ai:${provider}`);
      if (kept)
        keys.push({
          provider,
          hint: (kept.value as Kept).hint,
          by: kept.by,
          updated: kept.updated,
        });
    }
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return {
      keys,
      // Whether this relay can keep one at all.
      sealing: Boolean(this.key),
      calls: await this.relay.aiCalls(me.office, since),
    };
  }

  /**
   * Keeps a key for the office after asking its vendor whether it works, or forgets it (null).
   * Anyone in the office may add one where there is none; one already there is changed or removed
   * only by whoever added it, an owner of the office, or anyone once its adder has left, since every
   * clone's conversations would then go through the new key's account.
   */
  async set(me: Caller, provider: TeamProvider, key: string | null) {
    const kept = await this.relay.officeSecret(me.office, `ai:${provider}`);
    if (
      kept &&
      kept.by !== me.id &&
      (await this.relay.isMember(me.office, kept.by)) &&
      !(await this.relay.ownsOffice(me))
    )
      throw new RelayError(
        403,
        "Only whoever added the team key, or an owner of the office, changes it.",
        "team-key-not-yours",
      );
    if (key === null) {
      await this.relay.setOfficeSecret(me, `ai:${provider}`, null);
      return;
    }
    if (!this.key)
      throw new RelayError(
        409,
        "This relay keeps no team key until RELAY_ENCRYPTION_KEY is set (32 bytes in base64, `openssl rand -base64 32`).",
        "team-key-unsealed",
      );
    const trimmed = key.trim();
    if (trimmed.length < 8 || trimmed.length > 400 || /\s/.test(trimmed))
      throw new RelayError(400, "Not a key.", "brain-key-wrong");
    const checked = await this.ask(
      `${this.base(provider)}${TEAM_AI[provider].check}`,
      {
        headers: {
          ...this.auth(provider, trimmed),
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(15_000),
      },
    ).catch(() => undefined);
    if (!checked)
      throw new RelayError(
        502,
        "The vendor did not answer.",
        "brain-unreachable",
      );
    if (!checked.ok)
      throw new RelayError(
        400,
        "The vendor refused the key.",
        "brain-key-wrong",
      );
    await this.relay.setOfficeSecret(me, `ai:${provider}`, {
      sealed: sealWith(this.key, trimmed),
      hint: trimmed.slice(-4),
    } satisfies Kept);
  }

  /** The member a call comes from, by the token its SDK put where the vendor's key goes. */
  async caller(
    request: IncomingMessage,
    provider: TeamProvider,
  ): Promise<Caller> {
    const raw = String(request.headers[TEAM_AI[provider].header] ?? "");
    return this.relay.memberByToken(raw.replace(/^Bearer\s+/i, ""));
  }

  /** One call to the vendor with the office's key, its answer passed back as it comes. */
  async pass(
    request: IncomingMessage,
    response: ServerResponse,
    provider: TeamProvider,
    rest: string,
    search: string,
  ): Promise<void> {
    const me = await this.caller(request, provider);
    if (!this.key)
      throw new RelayError(409, "No team keys here.", "team-key-unsealed");
    const kept = await this.relay.officeSecret(me.office, `ai:${provider}`);
    if (!kept)
      throw new RelayError(
        404,
        "The office has no key for this.",
        "no-team-key",
      );
    if (request.method !== "GET" && request.method !== "POST")
      throw new RelayError(405, "Only GET and POST.", "bad-request");
    // A clone caught in a loop must not spend the team's money for the rest of the day (after
    // Paperclip's budgets): a day's calls per member, which a server sets (RELAY_TEAM_AI_DAILY).
    // Refused as 403, which no clone retries.
    if (
      request.method === "POST" &&
      this.daily > 0 &&
      (await this.relay.aiCallsToday(me, provider)) >= this.daily
    )
      throw new RelayError(
        403,
        "Today's calls with the office's key are used up for you.",
        "team-key-limit",
      );
    // Only under the vendor's own API.
    const base = this.base(provider);
    const target = new URL(`${base}${rest}${search}`);
    if (
      !`${target.origin}${target.pathname}`.startsWith(`${base}/`) ||
      rest.includes("..")
    )
      throw new RelayError(400, "Not a path of this API.", "bad-request");

    const headers: Record<string, string> = {};
    for (const name of PASSED) {
      const value = request.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    Object.assign(
      headers,
      this.auth(provider, openWith(this.key, (kept.value as Kept).sealed)),
    );

    let body: Buffer | undefined;
    if (request.method === "POST") {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += (chunk as Buffer).length;
        if (size > CALL_BYTES)
          throw new RelayError(413, "Too large.", "bad-request");
        chunks.push(chunk as Buffer);
      }
      body = Buffer.concat(chunks);
    }

    // The member's clone gone (it stopped, or was stopped): the vendor's call ends too.
    const stop = new AbortController();
    response.on("close", () => stop.abort());
    const answer = await this.ask(target, {
      method: request.method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
      signal: AbortSignal.any([stop.signal, AbortSignal.timeout(15 * 60_000)]),
    }).catch(() => undefined);
    if (!answer)
      throw new RelayError(
        502,
        "The vendor did not answer.",
        "brain-unreachable",
      );
    if (request.method === "POST")
      await this.relay.countAiCall(me, provider).catch(() => {});
    response.writeHead(answer.status, {
      "content-type": answer.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    });
    if (!answer.body) {
      response.end();
      return;
    }
    await new Promise<void>((done) => {
      const flowing = Readable.fromWeb(
        answer.body as import("node:stream/web").ReadableStream,
      );
      flowing.on("error", () => {
        response.end();
        done();
      });
      flowing.on("end", done);
      flowing.pipe(response);
    });
  }
}
