// The people of an office's server and how they get in, after Paperclip (which signs its people in
// with Better Auth) and OpenClaw (which pairs a device by a setup link): someone opens their
// office's invite link and makes an account there, with their email and a password, or with their
// Google account where the server's admin set Google up (Better Auth keeps a password hashed, the
// session in a cookie, and the tokens Google gives encrypted). Their own page then gives them one
// line to run on their computer. The line carries a setup code that works once, for ten minutes;
// claiming it gives that computer's mini-me its own lasting token in the office, under their
// account. One person, one mini-me: connecting another computer moves it there.
//
// How people sign in is the server's admin's to set (the owners of the office the server was
// started with): email and password on or off, Google on or off with the OAuth client they
// registered, its secret sealed (lib/seal.ts) under the relay's key as team keys are. One way stays
// on always, and the admin keeps a way in themselves. A Google identity is never linked to an
// account by its email alone: an account made with a password connects Google from its own page,
// signed in, so nobody takes over an account by making it first with someone else's email.
//
// Node runs this file without a build, so no TypeScript-only syntax such as parameter properties.

import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type Auth, type BetterAuthOptions, betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { isSealed, openWith, sealWith } from "../../lib/seal.ts";
import type { Database } from "./db.ts";
import { PGliteDialect } from "./pglite-dialect.ts";
import { type Relay, RelayError } from "./relay.ts";

/** How long a computer's setup code works. */
export const SETUP_MS = 10 * 60 * 1000;
/** How long the link that makes the server's admin works. */
const ADMIN_LINK_MS = 24 * 60 * 60 * 1000;

/** Where Google sends people back to on this server (Better Auth's own route). */
export const GOOGLE_CALLBACK = "/api/auth/callback/google";

/** A Google OAuth client's id, as Google Cloud Console gives it. */
const GOOGLE_ID = /^[\w.-]{4,200}\.apps\.googleusercontent\.com$/;

export interface Person {
  id: string;
  name: string;
  email: string;
}

/** A person with an account in an office, as its owners see them. */
export interface OfficePerson {
  id: string;
  name: string;
  email: string;
  role: "owner" | "member";
  joined: string;
  /** Their computer's clone in the office, when one is connected. */
  clone?: { id: string; seen: string };
  /** Taking part on the web, with no computer connected. */
  web?: boolean;
}

/** A clone in the office that joined with the key, with no account behind it. */
export interface KeyedClone {
  id: string;
  name: string;
  role: string;
  seen: string;
}

const when = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value ?? "");

/** How long a reset link works. */
const RESET_HOURS = 1;

/** A reset link's token as kept here: its hash, never the token. */
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("base64url");

/** Something someone else did to a person's account, told on their own page. */
export interface AccountEvent {
  kind: string;
  by: string;
  at: string;
  /** A reset link: still works (until `until`), stopped by its person, or ended unused. */
  state: "open" | "stopped" | "ended";
  until: string;
}

export interface Place {
  office: string;
  key: string;
  name: string;
  role: "owner" | "member";
}

/** How people may sign in to this server, as kept (`server_settings` `sign-in`). */
interface SignInKept {
  /** Email and password; on unless the admin turned it off. */
  password?: boolean;
  google?: {
    on: boolean;
    clientId: string;
    /** The client secret, sealed. */
    secret: string;
    /** The address Google sends people back to, as the server was reached when it was set. */
    site: string;
    /** Who set it, and when. */
    by: string;
    at: string;
  };
}

/** The ways a sign-in page offers. */
export interface SignInMethods {
  password: boolean;
  google: boolean;
  /**
   * Passwords let in only the server's admins: they were turned off, and are on again only because
   * Google cannot be used just now, so the admin can mend it.
   */
  adminsOnly?: boolean;
}

/** The sign-in settings as the admin sees them: never the secret itself. */
export interface SignInSettings {
  password: boolean;
  google?: {
    on: boolean;
    clientId: string;
    by: string;
    at: string;
    site: string;
    /** Whether this server's key opens the secret kept. */
    readable: boolean;
  };
  /** Whether passwords are kept off, whatever lets them in for now. */
  passwordKeptOff: boolean;
  /** Whether a secret can be kept sealed here at all. */
  sealing: boolean;
  /** People who sign in only with a password, and only with Google. */
  passwordOnly: number;
  googleOnly: number;
  /** Whether the admin themself signs in with Google too. */
  mineLinked: boolean;
}

/** How one person signs in. */
export interface SignInWays {
  password: boolean;
  google: boolean;
}

/**
 * What Better Auth says when Google sends someone back unsigned, as the codes the pages read: an
 * account by that email that signs in with its password, no account for a sign-in that may not
 * make one, cancelled at Google, an identity another account holds, or a sign-in to start again.
 */
export function googleProblem(code: string): string {
  if (code === "account_not_linked") return "google-not-linked";
  if (code === "signup_disabled") return "google-no-account";
  if (code === "access_denied") return "google-cancelled";
  if (
    code === "email_does_not_match" ||
    code === "account_already_linked_to_different_user"
  )
    return "google-other";
  if (code === "email_not_verified") return "google-unverified";
  if (/state|expired|restart/.test(code)) return "google-again";
  return "google-failed";
}

const hash = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/**
 * The secret Better Auth signs sessions with: the one given, else one made once and kept, sealed
 * under the relay's key where there is one. One kept plain before is sealed in place; one that
 * key cannot open (the key was changed) gives way to a new one, which only signs everyone out;
 * one sealed, with no key given at all, stops the relay saying which key it needs.
 */
async function keptSecret(db: Database, key?: Buffer): Promise<string> {
  const read = async () =>
    (
      await db.query<{ value: string }>(
        "SELECT value FROM server_settings WHERE name = 'auth-secret'",
      )
    )[0]?.value;
  const store = (made: string) => (key ? sealWith(key, made) : made);
  let value = await read();
  if (value === undefined) {
    const made = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO server_settings (name, value) VALUES ('auth-secret', $1) ON CONFLICT (name) DO NOTHING",
      [store(made)],
    );
    value = (await read()) ?? store(made);
  }
  if (isSealed(value)) {
    if (!key)
      throw new Error(
        "The relay's sign-in secret is sealed: start it with the key it was sealed with (RELAY_ENCRYPTION_KEY, or the secret.key beside its data).",
      );
    try {
      return openWith(key, value);
    } catch {}
    const made = randomBytes(32).toString("base64url");
    console.warn(
      "The sign-in secret could not be opened with this relay's key: a new one is made, and everyone signs in again.",
    );
    await db.query(
      "UPDATE server_settings SET value = $1 WHERE name = 'auth-secret'",
      [store(made)],
    );
    return made;
  }
  if (key)
    await db.query(
      "UPDATE server_settings SET value = $1 WHERE name = 'auth-secret' AND value = $2",
      [sealWith(key, value), value],
    );
  return value;
}

/** What Better Auth answered, as a code the relay's pages say in the reader's language. */
async function refusal(response: Response): Promise<string> {
  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { code?: string; message?: string };
  const code = String(body.code ?? "");
  if (/ALREADY_EXISTS/i.test(code)) return "account-exists";
  // its own check of the fields says which one: "[body.email] Invalid email address"
  if (/VALIDATION/i.test(code) && /body\.email/i.test(String(body.message)))
    return "email-wrong";
  if (/PASSWORD_TOO_SHORT/i.test(code)) return "password-short";
  if (/PASSWORD_TOO_LONG/i.test(code)) return "password-long";
  if (/INVALID_EMAIL\b/i.test(code)) return "email-wrong";
  if (/INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD|CREDENTIAL/i.test(code))
    return "sign-in-wrong";
  return "account-failed";
}

export class AccountError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export class Accounts {
  private current: Auth<BetterAuthOptions>;
  private db: Database;
  private relay: Relay;
  /** Better Auth's settings apart from the ways in, which the admin's settings add. */
  private base: BetterAuthOptions;
  private kept: SignInKept;
  private keptText: string;
  private sealKey: Buffer | undefined;
  private publicUrl: string | undefined;
  /** Reset tokens Better Auth just made, by account, for the admin to send on (no mail is sent). */
  private resets: Map<string, string>;
  /** Reset links made one at a time, so each reads back its own token. */
  private resetting: Promise<unknown> = Promise.resolve();
  /** Making the server's admin, one at a time. */
  private admitting: Promise<unknown> = Promise.resolve();
  /** The Google client the settings open, worked out once per settings. */
  private client: ReturnType<Accounts["opened"]>;

  private constructor(
    db: Database,
    relay: Relay,
    base: BetterAuthOptions,
    keptText: string,
    sealKey: Buffer | undefined,
    publicUrl: string | undefined,
    resets: Map<string, string>,
  ) {
    this.resets = resets;
    this.db = db;
    this.relay = relay;
    this.base = base;
    this.keptText = keptText;
    this.kept = parseKept(keptText);
    this.sealKey = sealKey;
    this.publicUrl = publicUrl;
    this.client = this.opened(this.kept);
    this.current = this.build();
  }

  /** Better Auth as the server's sign-in settings are now. */
  get auth(): Auth<BetterAuthOptions> {
    return this.current;
  }

  /**
   * Sign-in over the relay's own database. `publicUrl` is the address people reach the server at
   * (https makes its cookies secure); without one it is taken from each request. `sealKey` is the
   * relay's key (team-ai.ts `relaySealKey`): without one, no Google secret can be kept.
   */
  static async open(
    db: Database,
    relay: Relay,
    options: { secret?: string; publicUrl?: string; sealKey?: Buffer } = {},
  ): Promise<Accounts> {
    const resets = new Map<string, string>();
    const base: BetterAuthOptions = {
      appName: "Clone Office",
      secret:
        options.secret ||
        process.env.BETTER_AUTH_SECRET ||
        (await keptSecret(db, options.sealKey)),
      // Postgres through pg's pool; PGlite through its dialect, without Kysely's own transactions,
      // which would interleave with the relay's queries on the one connection.
      database: (db.kind === "postgres"
        ? db.raw
        : {
            dialect: new PGliteDialect(db.raw as never),
            type: "postgres",
            transaction: false,
          }) as BetterAuthOptions["database"],
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        autoSignIn: true,
        // A forgotten password: the admin makes a link that works once, for an hour, and hands
        // it on themselves; using it ends the person's sessions everywhere.
        resetPasswordTokenExpiresIn: RESET_HOURS * 60 * 60,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, token }) => {
          resets.set(user.id, token);
        },
      },
      user: { modelName: "auth_users" },
      session: { modelName: "auth_sessions" },
      account: {
        modelName: "auth_accounts",
        // What Google gives is never needed after signing in: it is not kept at all (below), and
        // encrypted should it ever be.
        encryptOAuthTokens: true,
        // A Google identity joins an account only when its person, signed in, connects it.
        accountLinking: { enabled: true, disableImplicitLinking: true },
        // The way back from Google is bound by an encrypted cookie, so starting a sign-in writes
        // nothing to the database, however often it is started.
        storeStateStrategy: "cookie",
      },
      databaseHooks: {
        user: {
          create: {
            // An account made through Google only with an email Google has checked: none made
            // with an email someone merely claims.
            before: async (user, context) => {
              if (context?.path?.startsWith("/callback") && !user.emailVerified)
                throw new APIError("FORBIDDEN", {
                  code: "email_not_verified",
                  message: "Google has not checked this email.",
                });
            },
          },
        },
        account: {
          create: {
            before: async (account) => ({ data: withoutTokens(account) }),
          },
          update: {
            before: async (account) => ({ data: withoutTokens(account) }),
          },
        },
      },
      // A reset link's token is kept only as its hash.
      verification: {
        modelName: "auth_verifications",
        storeIdentifier: "hashed",
      },
      // The tables are made at open (getMigrations), so Better Auth's own look at them, which it
      // starts in the background each time it is made, is left out: it would outlive a change.
      advanced: {
        cookiePrefix: "sub-office",
        database: { validateSchema: false },
      },
      // The relay's pages check where a form came from, and limit tries from one address.
      rateLimit: { enabled: false },
      telemetry: { enabled: false },
      logger: { level: "error" },
      // A sign-in Better Auth cannot finish goes back to the sign-in page, which says why (its
      // own error page is not served).
      onAPIError: { errorURL: "/login" },
    };
    const { runMigrations } = await getMigrations(base);
    await runMigrations();
    const [row] = await db.query<{ value: string }>(
      "SELECT value FROM server_settings WHERE name = 'sign-in'",
    );
    const accounts = new Accounts(
      db,
      relay,
      base,
      row?.value ?? "",
      options.sealKey,
      options.publicUrl,
      resets,
    );
    await accounts.current.$context;
    if (accounts.kept.google?.on && !accounts.google())
      console.warn(
        "Google sign-in is on, but its secret cannot be opened with this relay's key: email and password stays on until the admin saves it again.",
      );
    return accounts;
  }

  /** A Google client as kept, opened, while it is on; none when off or unreadable. */
  private opened(
    kept: SignInKept,
  ): { clientId: string; clientSecret: string; site: string } | undefined {
    const google = kept.google;
    if (!google?.on || !this.sealKey || !isSealed(google.secret))
      return undefined;
    try {
      return {
        clientId: google.clientId,
        clientSecret: openWith(this.sealKey, google.secret),
        site: google.site,
      };
    } catch {
      return undefined;
    }
  }

  private google() {
    return this.client;
  }

  /**
   * The one address Google sends people back to: the public one, else the one it was set up at.
   * A sign-in with Google starts there, so its way back finds the cookie that binds it.
   */
  googleSite(): string | undefined {
    return this.publicUrl?.replace(/\/+$/, "") ?? this.google()?.site;
  }

  /** Better Auth with the ways in the settings allow. */
  private build(): Auth<BetterAuthOptions> {
    const google = this.google();
    // Google sends people back to one fixed address: the public one, else the one it was set up at.
    const site = this.publicUrl ?? google?.site;
    const options: BetterAuthOptions = {
      ...this.base,
      ...(site ? { baseURL: site } : {}),
      advanced: {
        ...this.base.advanced,
        // Secure, and named so, as the public address says, never as Google's way back does:
        // turning Google on must neither rename the cookies, signing everyone out, nor mark them
        // secure where the server is also reached over plain http (its own network), where
        // browsers would drop them. A server reached over https sets RELAY_PUBLIC_URL.
        useSecureCookies: Boolean(this.publicUrl?.startsWith("https:")),
      },
      ...(google
        ? {
            socialProviders: {
              google: {
                clientId: google.clientId,
                clientSecret: google.clientSecret,
                // A new account needs an invite: a sign-in from the sign-in page makes none.
                disableImplicitSignUp: true,
                prompt: "select_account" as const,
              },
            },
          }
        : {}),
    };
    return betterAuth(options);
  }

  /**
   * Reads the sign-in settings again, as another of the server's processes may have changed them;
   * Better Auth is made again only when they did.
   */
  async refresh(): Promise<void> {
    const [row] = await this.db.query<{ value: string }>(
      "SELECT value FROM server_settings WHERE name = 'sign-in'",
    );
    await this.take(row?.value ?? "");
  }

  private async take(text: string): Promise<void> {
    if (text === this.keptText) return;
    this.keptText = text;
    this.kept = parseKept(text);
    this.client = this.opened(this.kept);
    this.current = this.build();
    await this.current.$context;
  }

  /**
   * The ways a sign-in page offers now. Email and password stays on whenever Google cannot
   * actually be used (its secret unreadable once the key changed), and whenever the server's
   * operator says so (RELAY_PASSWORD_SIGNIN=1): a setting never leaves everyone locked out.
   */
  methods(): SignInMethods {
    return this.ways_(this.kept, this.google());
  }

  /** The ways settings let people in, given the Google client they open. */
  private ways_(
    kept: SignInKept,
    client: ReturnType<Accounts["opened"]>,
  ): SignInMethods {
    const google = Boolean(client);
    const forced = process.env.RELAY_PASSWORD_SIGNIN === "1";
    // Off, but back on because Google cannot be used: for the admin alone, to mend it.
    const adminsOnly = kept.password === false && !google && !forced;
    return {
      password: kept.password !== false || !google || forced,
      google,
      ...(adminsOnly ? { adminsOnly } : {}),
    };
  }

  /**
   * Changes the sign-in settings as one step: under a lock, on the settings as they are in the
   * database (another admin, or another process, may have just changed them), `change` checks its
   * rules and says what they become. A way turned off ends the sessions of those who signed in
   * only that way, as they could not sign in again.
   */
  private async update(
    change: (kept: SignInKept) => SignInKept,
  ): Promise<void> {
    const text = await this.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(4174005)");
      const [row] = await tx.query<{ value: string }>(
        "SELECT value FROM server_settings WHERE name = 'sign-in'",
      );
      const before = parseKept(row?.value ?? "");
      const next = change(before);
      const written = JSON.stringify(next);
      await tx.query(
        "INSERT INTO server_settings (name, value) VALUES ('sign-in', $1) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value",
        [written],
      );
      const only = (way: "credential" | "google") =>
        tx.query(
          `DELETE FROM auth_sessions WHERE "userId" IN (SELECT "userId" FROM auth_accounts GROUP BY "userId" HAVING bool_or("providerId" = $1) AND NOT bool_or("providerId" <> $1))`,
          [way],
        );
      // as the ways actually work before and after, the operator's word and Google's state
      // included: nobody is signed out of a way that still lets them in
      const was = this.ways_(before, this.opened(before));
      const now = this.ways_(next, this.opened(next));
      if (was.password && !now.password) await only("credential");
      if (was.google && !now.google) await only("google");
      return written;
    });
    await this.take(text);
  }

  /** Whether a person is the server's admin: an owner of the office it was started with. */
  async isAdmin(user: string): Promise<boolean> {
    const [row] = await this.db.query(
      "SELECT 1 FROM office_people WHERE user_id = $1 AND role = 'owner' AND office_id = (SELECT id FROM offices ORDER BY created, id LIMIT 1)",
      [user],
    );
    return Boolean(row);
  }

  private async mustAdmin(user: string): Promise<void> {
    if (!(await this.isAdmin(user))) throw new AccountError("not-admin");
  }

  /** Whether the server has its admin yet. */
  async hasAdmin(): Promise<boolean> {
    const [row] = await this.db.query(
      "SELECT 1 FROM office_people WHERE role = 'owner' AND office_id = (SELECT id FROM offices ORDER BY created, id LIMIT 1) LIMIT 1",
    );
    return Boolean(row);
  }

  /**
   * The link that makes the server's admin while it has none, for whoever runs it (its log at
   * start, or the app that opened the office on its computer): a new one each time it is asked,
   * the one before then ending; it works for a day and is kept only as its hash.
   */
  async adminLink(): Promise<string | undefined> {
    if (await this.hasAdmin()) return undefined;
    const token = randomBytes(18).toString("base64url");
    const value = JSON.stringify({
      hash: hash(token),
      until: new Date(Date.now() + ADMIN_LINK_MS).toISOString(),
    });
    await this.db.query(
      "INSERT INTO server_settings (name, value) VALUES ('admin-link', $1) ON CONFLICT (name) DO UPDATE SET value = excluded.value",
      [value],
    );
    return token;
  }

  /** Whether a link still makes the server's admin. */
  async adminLinkWorks(token: string): Promise<boolean> {
    if (await this.hasAdmin()) return false;
    const [row] = await this.db.query<{ value: string }>(
      "SELECT value FROM server_settings WHERE name = 'admin-link'",
    );
    if (!row) return false;
    try {
      const kept = JSON.parse(row.value) as { hash?: string; until?: string };
      return (
        kept.hash === hash(token) &&
        new Date(String(kept.until)).getTime() > Date.now()
      );
    } catch {
      return false;
    }
  }

  /**
   * Makes the server's admin with its link: their account, an owner of the office the server was
   * started with. Once, one at a time: the link ends as it is used.
   */
  async makeAdmin(
    token: string,
    input: { name: string; email: string; password: string },
  ): Promise<{ person: Person; cookies: string[] }> {
    const made = this.admitting.then(async () => {
      if (!(await this.adminLinkWorks(token)))
        throw new AccountError("admin-link-ended");
      const name = input.name.trim().slice(0, 80);
      if (!name) throw new AccountError("name-missing");
      // The link is taken in the database before the account is made, so two processes (or a
      // form sent twice) never both make an admin with it; given back should the account fail.
      const [taken] = await this.db.query<{ value: string }>(
        "DELETE FROM server_settings WHERE name = 'admin-link' AND (value::jsonb ->> 'hash') = $1 AND (value::jsonb ->> 'until')::timestamptz > now() RETURNING value",
        [hash(token)],
      );
      if (!taken) throw new AccountError("admin-link-ended");
      const giveBack = () =>
        this.db
          .query(
            "INSERT INTO server_settings (name, value) VALUES ('admin-link', $1) ON CONFLICT (name) DO NOTHING",
            [taken.value],
          )
          .catch(() => undefined);
      let response: Response;
      try {
        response = (await this.current.api.signUpEmail({
          body: { name, email: input.email.trim(), password: input.password },
          asResponse: true,
        })) as Response;
      } catch (error) {
        await giveBack();
        throw error;
      }
      if (!response.ok) {
        await giveBack();
        throw new AccountError(await refusal(response));
      }
      const { user } = (await response.json()) as { user: Person };
      await this.db.query(
        "INSERT INTO office_people (office_id, user_id, role, joined) SELECT id, $1, 'owner', now() FROM offices ORDER BY created, id LIMIT 1 ON CONFLICT (office_id, user_id) DO UPDATE SET role = 'owner'",
        [user.id],
      );
      return {
        person: { id: user.id, name: user.name, email: user.email },
        cookies: response.headers.getSetCookie(),
      };
    });
    this.admitting = made.catch(() => undefined);
    return made;
  }

  /** How a person signs in: with a password, with Google, or both. */
  async ways(user: string): Promise<SignInWays> {
    const rows = await this.db.query<{ provider: string }>(
      'SELECT DISTINCT "providerId" AS provider FROM auth_accounts WHERE "userId" = $1',
      [user],
    );
    const providers = new Set(rows.map((row) => row.provider));
    return {
      password: providers.has("credential"),
      google: providers.has("google"),
    };
  }

  /** The sign-in settings, for the admin's page. */
  async settings(user: string): Promise<SignInSettings> {
    await this.mustAdmin(user);
    const google = this.kept.google;
    const readable = Boolean(
      google && this.opened({ google: { ...google, on: true } }),
    );
    const [counts] = await this.db.query<{
      password_only: string | number;
      google_only: string | number;
    }>(
      `SELECT
        count(*) FILTER (WHERE p AND NOT g) AS password_only,
        count(*) FILTER (WHERE g AND NOT p) AS google_only
      FROM (SELECT "userId",
        bool_or("providerId" = 'credential') AS p,
        bool_or("providerId" = 'google') AS g
        FROM auth_accounts GROUP BY "userId") AS ways`,
    );
    return {
      password: this.methods().password,
      ...(google
        ? {
            google: {
              on: google.on,
              clientId: google.clientId,
              by: google.by,
              at: google.at,
              site: google.site,
              readable,
            },
          }
        : {}),
      passwordKeptOff: this.kept.password === false,
      sealing: Boolean(this.sealKey),
      passwordOnly: Number(counts?.password_only ?? 0),
      googleOnly: Number(counts?.google_only ?? 0),
      mineLinked: (await this.ways(user)).google,
    };
  }

  /**
   * Email and password on or off. Off only while Google works and the admin signs in with it
   * themselves, so nobody is left without a way in, the admin least of all.
   */
  async setPassword(user: string, on: boolean): Promise<void> {
    await this.mustAdmin(user);
    if (!on && !(await this.ways(user)).google)
      throw new AccountError("link-google-first");
    await this.update((kept) => {
      if (!on && !this.opened(kept)) throw new AccountError("google-first");
      return { ...kept, password: on };
    });
  }

  /**
   * Keeps the Google client the admin registered, its secret sealed, and turns Google on. An empty
   * secret keeps the one kept for the same client. `site` is where the server is reached, which
   * Google sends people back to. Not while passwords are off: a client that turns out wrong would
   * leave nobody a way in.
   */
  async saveGoogle(
    user: string,
    input: { clientId: string; secret: string; site: string; by: string },
  ): Promise<{ passwordBack: boolean }> {
    await this.mustAdmin(user);
    const key = this.sealKey;
    if (!key) throw new AccountError("sealing-off");
    const clientId = input.clientId.trim();
    if (!GOOGLE_ID.test(clientId)) throw new AccountError("google-id-wrong");
    const secret = input.secret.trim();
    if (secret && (secret.length > 200 || /\s/.test(secret)))
      throw new AccountError("google-secret-wrong");
    const site = siteOf(input.site);
    // Over https, cookies are marked secure only by the public address: without it they would
    // not be, so Google waits for it.
    if (site.startsWith("https:") && !this.publicUrl?.startsWith("https:"))
      throw new AccountError("public-url-needed");
    const sealed = secret ? sealWith(key, secret) : undefined;
    let passwordBack = false;
    await this.update((kept) => {
      // While Google works and passwords are off, its client is not changed: a wrong one would
      // leave nobody a way in. While it does not work, the admin mends it, with passwords back on.
      if (!this.ways_(kept, this.opened(kept)).password)
        throw new AccountError("password-first");
      const before = kept.google;
      const sealedSecret =
        sealed ?? (before?.clientId === clientId ? before.secret : undefined);
      if (!sealedSecret) throw new AccountError("google-secret-missing");
      passwordBack = kept.password === false;
      const next: SignInKept = {
        ...kept,
        ...(kept.password === false ? { password: true } : {}),
        google: {
          on: true,
          clientId,
          secret: sealedSecret,
          site,
          by: input.by.slice(0, 80),
          at: new Date().toISOString(),
        },
      };
      if (!this.opened(next)) throw new AccountError("google-unreadable");
      return next;
    });
    return { passwordBack };
  }

  /**
   * Google on or off, its settings kept. Off only while email and password is on; turning it off
   * while passwords were kept off for everyone but the admin turns them back on for all, which
   * `passwordBack` says so the admin is told.
   */
  async setGoogle(
    user: string,
    on: boolean,
  ): Promise<{ passwordBack: boolean }> {
    await this.mustAdmin(user);
    let passwordBack = false;
    await this.update((kept) => {
      const google = kept.google;
      if (!google) throw new AccountError("google-not-set");
      if (!on && !this.ways_(kept, this.opened(kept)).password)
        throw new AccountError("password-first");
      passwordBack = !on && kept.password === false;
      const next: SignInKept = {
        ...kept,
        ...(passwordBack ? { password: true } : {}),
        google: { ...google, on },
      };
      if (on && !this.opened(next)) throw new AccountError("google-unreadable");
      return next;
    });
    return { passwordBack };
  }

  /** Takes the Google client and its sealed secret off the server. Only while email and password is on. */
  async removeGoogle(user: string): Promise<{ passwordBack: boolean }> {
    await this.mustAdmin(user);
    let passwordBack = false;
    await this.update((kept) => {
      if (!this.ways_(kept, this.opened(kept)).password)
        throw new AccountError("password-first");
      passwordBack = kept.password === false;
      const { google: _gone, ...rest } = kept;
      return { ...rest, password: true };
    });
    return { passwordBack };
  }

  /**
   * The accounts an admin may act on: those in no office but ones the admin owns (or in none at
   * all). Someone in another office is that office's owners' to look after, not the server's admin.
   */
  private readonly REACH =
    `NOT EXISTS (SELECT 1 FROM office_people p WHERE p.user_id = u.id AND p.office_id NOT IN (SELECT office_id FROM office_people WHERE user_id = $1 AND role = 'owner'))`;

  private async mustReach(admin: string, user: string): Promise<void> {
    const [row] = await this.db.query(
      `SELECT 1 FROM auth_users u WHERE u.id = $2 AND ${this.REACH}`,
      [admin, user],
    );
    if (!row) throw new AccountError("not-yours");
  }

  /**
   * What someone else did to a person's account lately, for their own page: a reset link made,
   * and how it stands (`open` while it still works, until `until`; `stopped`; `ended` unused).
   * One they used themselves is not told again.
   */
  async events(user: string): Promise<AccountEvent[]> {
    const rows = await this.db.query<{
      kind: string;
      by_name: string;
      at: unknown;
      done: string | null;
      open: boolean;
      until: unknown;
    }>(
      `SELECT kind, by_name, at, done, until, done IS NULL AND token_hash IS NOT NULL AND until > now() AS open
      FROM (SELECT *, at + interval '${RESET_HOURS} hour' AS until FROM account_events WHERE user_id = $1 AND at > now() - interval '30 days') e
      ORDER BY at DESC LIMIT 5`,
      [user],
    );
    return rows
      .filter((row) => row.done !== "used")
      .map((row) => ({
        kind: row.kind,
        by: row.by_name,
        at: when(row.at),
        state: row.open ? "open" : row.done === "stopped" ? "stopped" : "ended",
        until: when(row.until),
      }));
  }

  /** A person stops the reset links made for them that still work: none can be used after. */
  async stopResets(user: string): Promise<number> {
    const rows = await this.db.query(
      `UPDATE account_events SET done = 'stopped', done_at = now() WHERE user_id = $1 AND kind = 'reset-link' AND done IS NULL AND at > now() - interval '${RESET_HOURS} hour' RETURNING 1`,
      [user],
    );
    return rows.length;
  }

  /**
   * Removes someone's account from the server, for its admin: they can no longer sign in, their
   * clone's place goes from every office here, and what they asked and answered stays. They may
   * make a new account from an invite. This is how an account made with someone else's email (no
   * email is checked) gives way to its real person.
   */
  async removeAccount(admin: string, user: string): Promise<void> {
    await this.mustAdmin(admin);
    if (admin === user) throw new AccountError("not-yourself");
    await this.mustReach(admin, user);
    await this.db.transaction(async (tx) => {
      // never an office's only owner: someone must still decide who is in it
      const [alone] = await tx.query(
        "SELECT 1 FROM office_people p WHERE p.user_id = $1 AND p.role = 'owner' AND NOT EXISTS (SELECT 1 FROM office_people q WHERE q.office_id = p.office_id AND q.role = 'owner' AND q.user_id <> $1)",
        [user],
      );
      if (alone) throw new AccountError("last-owner");
      await tx.query("DELETE FROM members WHERE user_id = $1", [user]);
      await tx.query("DELETE FROM setup_codes WHERE user_id = $1", [user]);
      await tx.query("DELETE FROM office_people WHERE user_id = $1", [user]);
      await tx.query('DELETE FROM auth_sessions WHERE "userId" = $1', [user]);
      await tx.query('DELETE FROM auth_accounts WHERE "userId" = $1', [user]);
      await tx.query("DELETE FROM auth_users WHERE id = $1", [user]);
    });
  }

  /** Everyone with an account on the server and how each signs in, for the admin's page. */
  async serverPeople(user: string): Promise<
    {
      id: string;
      name: string;
      email: string;
      password: boolean;
      google: boolean;
    }[]
  > {
    await this.mustAdmin(user);
    const rows = await this.db.query<{
      id: string;
      name: string;
      email: string;
      p: boolean | null;
      g: boolean | null;
    }>(
      `SELECT u.id, u.name, u.email,
        bool_or(a."providerId" = 'credential') AS p,
        bool_or(a."providerId" = 'google') AS g
      FROM auth_users u LEFT JOIN auth_accounts a ON a."userId" = u.id
      WHERE ${this.REACH}
      GROUP BY u.id, u.name, u.email ORDER BY lower(u.name), u.email LIMIT 500`,
      [user],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      password: Boolean(row.p),
      google: Boolean(row.g),
    }));
  }

  /**
   * A link for someone who forgot their password, which the admin hands on themselves: it works
   * once, for an hour. Only for an account that has a password, while passwords are on.
   */
  async resetLink(
    admin: string,
    user: string,
  ): Promise<{ token: string; name: string }> {
    await this.resetAllowed(admin, user);
    const [person] = await this.db.query<{ name: string; email: string }>(
      "SELECT name, email FROM auth_users WHERE id = $1",
      [user],
    );
    if (!person) throw new AccountError("account-failed");
    const [by] = await this.db.query<{ name: string }>(
      "SELECT name FROM auth_users WHERE id = $1",
      [admin],
    );
    const made = this.resetting.then(async () => {
      this.resets.delete(user);
      await this.current.api.requestPasswordReset({
        body: { email: person.email },
      });
      const token = this.resets.get(user);
      this.resets.delete(user);
      return token;
    });
    this.resetting = made.catch(() => undefined);
    const token = await made;
    if (!token) throw new AccountError("account-failed");
    // Told on the person's own page, so a link they did not ask for never goes unseen; kept with
    // who made it and its token's hash, so it is checked again when used (`resetPassword`).
    await this.db.query(
      "INSERT INTO account_events (user_id, kind, by_name, at, by_user, token_hash) VALUES ($1, 'reset-link', $2, now(), $3, $4)",
      [user, by?.name ?? "", admin, tokenHash(token)],
    );
    return { token, name: person.name };
  }

  /**
   * Whether an admin may give someone a reset link: passwords on for everyone, the account theirs
   * to look after, with a password; never one who can sign in with Google (they sign in with it)
   * nor an office's owner (not the admin's to take). Asked when the link is made and again when
   * it is used, as the account may have changed in between.
   */
  private async resetAllowed(admin: string, user: string): Promise<void> {
    await this.mustAdmin(admin);
    const ways = this.methods();
    if (!ways.password || ways.adminsOnly)
      throw new AccountError("password-off");
    await this.mustReach(admin, user);
    const has = await this.ways(user);
    if (!has.password) throw new AccountError("no-password");
    if (has.google) throw new AccountError("has-google");
    const [owner] = await this.db.query(
      "SELECT 1 FROM office_people WHERE user_id = $1 AND role = 'owner'",
      [user],
    );
    if (owner) throw new AccountError("owner-reset");
  }

  /** A reset link that still works by its record here: whose it is and who made it. */
  private async resetRecord(
    token: string,
  ): Promise<{ user: string; admin: string } | undefined> {
    const [row] = await this.db.query<{ user_id: string; by_user: string }>(
      `SELECT user_id, by_user FROM account_events WHERE token_hash = $1 AND kind = 'reset-link' AND done IS NULL AND at > now() - interval '${RESET_HOURS} hour'`,
      [tokenHash(token)],
    );
    return row ? { user: row.user_id, admin: row.by_user } : undefined;
  }

  /** Whose password a reset link changes, while it still works; none once used, stopped or expired. */
  async resetFor(token: string): Promise<string | undefined> {
    const record = await this.resetRecord(token);
    if (!record) return undefined;
    const context = await this.current.$context;
    const found = await context.internalAdapter.findVerificationValue(
      `reset-password:${token}`,
    );
    if (
      !found ||
      found.value !== record.user ||
      new Date(found.expiresAt) <= new Date()
    )
      return undefined;
    const fine = await this.resetAllowed(record.admin, record.user).then(
      () => true,
      () => false,
    );
    if (!fine) return undefined;
    const [row] = await this.db.query<{ name: string }>(
      "SELECT name FROM auth_users WHERE id = $1",
      [record.user],
    );
    return row?.name;
  }

  /**
   * A new password from a reset link; the link ends with it, and so do the person's sessions. The
   * link is taken first, so it is used once, and the admin's leave is checked again: one who has
   * since become an owner, connected Google or joined another office is no longer theirs to reset.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const ways = this.methods();
    if (!ways.password || ways.adminsOnly)
      throw new AccountError("password-off");
    const hash = tokenHash(token);
    const [taken] = await this.db.query<{ user_id: string; by_user: string }>(
      `UPDATE account_events SET done = 'using' WHERE token_hash = $1 AND kind = 'reset-link' AND done IS NULL AND at > now() - interval '${RESET_HOURS} hour' RETURNING user_id, by_user`,
      [hash],
    );
    if (!taken) throw new AccountError("reset-expired");
    const settle = (done: string | null) =>
      this.db.query(
        "UPDATE account_events SET done = $2, done_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE token_hash = $1",
        [hash, done],
      );
    try {
      await this.resetAllowed(taken.by_user, taken.user_id);
    } catch (error) {
      await settle("refused");
      const context = await this.current.$context;
      await context.internalAdapter
        .deleteVerificationByIdentifier(`reset-password:${token}`)
        .catch(() => undefined);
      throw error instanceof AccountError &&
        ["password-off", "no-password"].includes(error.code)
        ? error
        : new AccountError("reset-expired");
    }
    const response = (await this.current.api.resetPassword({
      body: { newPassword: password, token },
      asResponse: true,
    })) as Response;
    if (response.ok) {
      await settle("used");
      return;
    }
    // not used after all (a password refused): the link still works, once
    await settle(null);
    const body = (await response
      .clone()
      .json()
      .catch(() => ({}))) as { code?: string };
    if (/INVALID_TOKEN/i.test(String(body.code ?? ""))) {
      await settle("ended");
      throw new AccountError("reset-expired");
    }
    throw new AccountError(await refusal(response));
  }

  /**
   * Starts signing in with Google: where to send the browser, with the cookie that binds its way
   * back to this one. `signUp` lets it make an account (an invite's page); `back` is where it lands
   * signed in, `failed` where it lands with `error` when it did not.
   */
  async googleStart(input: {
    back: string;
    failed: string;
    signUp: boolean;
  }): Promise<{ url: string; cookies: string[] }> {
    if (!this.methods().google) throw new AccountError("google-off");
    const response = (await this.current.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: input.back,
        errorCallbackURL: input.failed,
        requestSignUp: input.signUp,
        disableRedirect: true,
      },
      asResponse: true,
    })) as Response;
    return started(response);
  }

  /** Starts connecting Google to the signed-in person's account, from their own page. */
  async googleLink(
    cookie: string | undefined,
  ): Promise<{ url: string; cookies: string[] }> {
    if (!this.methods().google) throw new AccountError("google-off");
    const response = (await this.current.api.linkSocialAccount({
      body: {
        provider: "google",
        callbackURL: "/home",
        errorCallbackURL: "/home",
        disableRedirect: true,
      },
      headers: new Headers({ cookie: cookie ?? "" }),
      asResponse: true,
    })) as Response;
    return started(response);
  }

  /**
   * Google's way back (`GOOGLE_CALLBACK`), which Better Auth itself answers. It is handed exactly
   * that route at the server's own address, whatever the request's host says, so no other of
   * Better Auth's routes is ever reached through it.
   */
  async callback(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const site = this.publicUrl?.replace(/\/+$/, "") ?? this.google()?.site;
    if (!site) {
      response.writeHead(303, {
        location: "/login?error=google-off",
        "cache-control": "no-store",
      });
      response.end();
      return;
    }
    const search = new URL(request.url ?? "/", "http://relay").search;
    const headers = new Headers();
    for (const name of ["cookie", "user-agent", "accept-language"]) {
      const value = request.headers[name];
      if (typeof value === "string") headers.set(name, value);
    }
    const answer = await this.current.handler(
      new Request(`${site}${GOOGLE_CALLBACK}${search}`, {
        method: "GET",
        headers,
      }),
    );
    const out: Record<string, string | string[]> = {
      "cache-control": "no-store",
    };
    const location = answer.headers.get("location");
    if (location) out.location = location;
    const cookies = answer.headers.getSetCookie();
    if (cookies.length) out["set-cookie"] = cookies;
    const type = answer.headers.get("content-type");
    if (type) out["content-type"] = type;
    response.writeHead(answer.status, out);
    response.end(Buffer.from(await answer.arrayBuffer()));
  }

  /** The office an invite's key opens, by its name. */
  async officeOf(
    key: string,
  ): Promise<{ id: string; name: string } | undefined> {
    return this.officeByKey(key);
  }

  /**
   * The office a link's key opens: the office's own key (its operator's), or an invite to it that
   * still works, `invite` then saying so.
   */
  private async officeByKey(
    key: string,
  ): Promise<{ id: string; name: string; invite?: true } | undefined> {
    const [row] = await this.db.query<{ id: string; name: string }>(
      "SELECT id, name FROM offices WHERE key = $1",
      [key],
    );
    if (row) return row;
    const invite = await this.relay.invite(key);
    if (!invite) return undefined;
    const [office] = await this.db.query<{ id: string; name: string }>(
      "SELECT id, name FROM offices WHERE id = $1",
      [invite.office],
    );
    return office ? { ...office, invite: true } : undefined;
  }

  /**
   * Puts a person in the office a link opens: with the office's key, as `place` does; with an
   * invite, only while it has not made an account yet, which it then has (their clone, joined with
   * the same link, becomes this account's).
   */
  private async enterWith(key: string, user: string): Promise<boolean> {
    const office = await this.officeByKey(key);
    if (!office) return false;
    if (!office.invite) {
      await this.place(office.id, user);
      return true;
    }
    const taken = await this.relay.takeInviteForAccount(key);
    if (!taken) return false;
    await this.place(taken.office, user);
    await taken.settle(user);
    return true;
  }

  /**
   * Puts a person in an office: its owner when nobody was in it before them, neither an account
   * nor a mini-me (an office opened on someone's computer is theirs), else a member.
   */
  private async place(office: string, user: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(4174003)");
      const [first] = await tx.query(
        "SELECT 1 FROM office_people WHERE office_id = $1 UNION ALL SELECT 1 FROM members WHERE office_id = $1 LIMIT 1",
        [office],
      );
      await tx.query(
        "INSERT INTO office_people (office_id, user_id, role, joined) VALUES ($1, $2, $3, now()) ON CONFLICT (office_id, user_id) DO NOTHING",
        [office, user, first ? "member" : "owner"],
      );
    });
  }

  /**
   * Makes an account through an office's invite and signs it in. The answer carries Better Auth's
   * session cookie, to pass on to the browser.
   */
  async signUp(
    key: string,
    input: { name: string; email: string; password: string },
  ): Promise<{ person: Person; cookies: string[] }> {
    const ways = this.methods();
    if (!ways.password || ways.adminsOnly)
      throw new AccountError("password-off");
    const office = await this.officeByKey(key);
    if (!office) throw new AccountError("invite-wrong");
    const name = input.name.trim().slice(0, 80);
    if (!name) throw new AccountError("name-missing");
    // An invite makes one account: taken first, given back should this one not be made.
    const taken = office.invite
      ? await this.relay.takeInviteForAccount(key)
      : undefined;
    if (office.invite && !taken) throw new AccountError("invite-used");
    let made: Response;
    try {
      made = (await this.current.api.signUpEmail({
        body: { name, email: input.email.trim(), password: input.password },
        asResponse: true,
      })) as Response;
    } catch (error) {
      await taken?.undo();
      throw error;
    }
    if (!made.ok) {
      await taken?.undo();
      throw new AccountError(await refusal(made));
    }
    const response = made;
    const { user } = (await response.json()) as { user: Person };
    await this.place(office.id, user.id);
    await taken?.settle(user.id);
    return {
      person: { id: user.id, name: user.name, email: user.email },
      cookies: response.headers.getSetCookie(),
    };
  }

  /** Signs a person in; with an invite's key, puts them in that office too. */
  async signIn(
    input: { email: string; password: string },
    key?: string,
  ): Promise<{ person: Person; cookies: string[] }> {
    const ways = this.methods();
    if (!ways.password) throw new AccountError("password-off");
    const response = (await this.current.api.signInEmail({
      body: { email: input.email.trim(), password: input.password },
      asResponse: true,
    })) as Response;
    if (!response.ok) throw new AccountError(await refusal(response));
    const { user } = (await response.json()) as { user: Person };
    // While only the admin may (Google to mend), anyone else is told so only once their password
    // is right: a wrong one answers alike for all, so it never tells who the admin is.
    if (ways.adminsOnly && !(await this.isAdmin(user.id))) {
      await this.signOut(
        response.headers
          .getSetCookie()
          .map((one) => one.split(";")[0])
          .join("; "),
      );
      throw new AccountError("password-off");
    }
    if (key) await this.enterWith(key, user.id);
    return {
      person: { id: user.id, name: user.name, email: user.email },
      cookies: response.headers.getSetCookie(),
    };
  }

  /** The person a browser's cookie signs in, if any. */
  async person(cookie: string | undefined): Promise<Person | undefined> {
    if (!cookie) return undefined;
    const found = (await this.current.api
      .getSession({ headers: new Headers({ cookie }) })
      .catch(() => null)) as { user?: Person } | null;
    return found?.user
      ? {
          id: found.user.id,
          name: found.user.name,
          email: found.user.email,
        }
      : undefined;
  }

  /** Ends the browser's session; the answer's cookies clear it. */
  async signOut(cookie: string | undefined): Promise<string[]> {
    if (!cookie) return [];
    const response = (await this.current.api
      .signOut({ headers: new Headers({ cookie }), asResponse: true })
      .catch(() => undefined)) as Response | undefined;
    return response?.headers.getSetCookie() ?? [];
  }

  /** A signed-in person opening another invite: they join that office too. */
  async enter(key: string, user: string): Promise<boolean> {
    return this.enterWith(key, user);
  }

  /** The offices a person is in, the first they joined first. */
  async places(user: string): Promise<Place[]> {
    return this.db.query<Place>(
      "SELECT o.id AS office, o.key, o.name, p.role FROM office_people p JOIN offices o ON o.id = p.office_id WHERE p.user_id = $1 ORDER BY p.joined",
      [user],
    );
  }

  /** Everyone with an account in an office, with their role and the clone their computer runs there. */
  async people(office: string): Promise<OfficePerson[]> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      email: string;
      role: "owner" | "member";
      joined: unknown;
      member: string | null;
      card: { name?: string } | null;
      seen: unknown;
      on_web: boolean | null;
    }>(
      "SELECT u.id, u.name, u.email, p.role, p.joined, m.id AS member, m.card, m.seen, m.on_web FROM office_people p JOIN auth_users u ON u.id = p.user_id LEFT JOIN members m ON m.office_id = p.office_id AND m.user_id = p.user_id WHERE p.office_id = $1 ORDER BY p.joined, u.name",
      [office],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role === "owner" ? "owner" : "member",
      joined: when(row.joined),
      ...(row.member && row.on_web ? { web: true } : {}),
      ...(row.member && !row.on_web
        ? { clone: { id: row.member, seen: when(row.seen) } }
        : {}),
    }));
  }

  /** Clones that joined with the office's key from someone's app, with no account behind them. */
  async keyedClones(office: string): Promise<KeyedClone[]> {
    const rows = await this.db.query<{
      id: string;
      card: { name?: string; description?: string } | null;
      seen: unknown;
    }>(
      "SELECT id, card, seen FROM members WHERE office_id = $1 AND user_id IS NULL ORDER BY joined",
      [office],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.card?.name ?? "",
      role: row.card?.description ?? "",
      seen: when(row.seen),
    }));
  }

  /** Throws unless the person owns the office: only an owner changes who is in it, its name or its link. */
  private async mustOwn(user: string, office: string): Promise<void> {
    const [row] = await this.db.query<{ role: string }>(
      "SELECT role FROM office_people WHERE office_id = $1 AND user_id = $2",
      [office, user],
    );
    if (row?.role !== "owner") throw new AccountError("not-owner");
  }

  /**
   * Takes a person out of an office: their account leaves it and their clone's place there goes,
   * so its token stops working at once. What they asked and answered stays in the office's past.
   */
  async removePerson(
    owner: string,
    office: string,
    user: string,
  ): Promise<void> {
    await this.mustOwn(owner, office);
    if (owner === user) throw new AccountError("not-yourself");
    await this.db.transaction(async (tx) => {
      await tx.query(
        "DELETE FROM office_people WHERE office_id = $1 AND user_id = $2",
        [office, user],
      );
      await tx.query(
        "DELETE FROM members WHERE office_id = $1 AND user_id = $2",
        [office, user],
      );
      await tx.query(
        "DELETE FROM setup_codes WHERE office_id = $1 AND user_id = $2",
        [office, user],
      );
    });
  }

  /** Takes a clone that joined with the key out of the office; its token stops working at once. */
  async removeClone(
    owner: string,
    office: string,
    member: string,
  ): Promise<void> {
    await this.mustOwn(owner, office);
    await this.db.query(
      "DELETE FROM members WHERE office_id = $1 AND id = $2 AND user_id IS NULL",
      [office, member],
    );
  }

  /** Makes another person in the office an owner too, so the office never rests on one person. */
  async makeOwner(owner: string, office: string, user: string): Promise<void> {
    await this.mustOwn(owner, office);
    await this.db.query(
      "UPDATE office_people SET role = 'owner' WHERE office_id = $1 AND user_id = $2",
      [office, user],
    );
  }

  /**
   * A new invite link: the office's key changes, so links sent before stop working. Everyone already
   * in stays, since a clone uses its own token after joining.
   */
  async newInvite(owner: string, office: string): Promise<string> {
    await this.mustOwn(owner, office);
    const key = randomBytes(9).toString("base64url");
    await this.db.query("UPDATE offices SET key = $1 WHERE id = $2", [
      key,
      office,
    ]);
    return key;
  }

  /** Names the office, as its people see it on their pages and their clones' lobby. */
  async renameOffice(
    owner: string,
    office: string,
    name: string,
  ): Promise<void> {
    await this.mustOwn(owner, office);
    await this.db.query("UPDATE offices SET name = $1 WHERE id = $2", [
      name.trim().slice(0, 80),
      office,
    ]);
  }

  /** A setup code for one of the person's computers: it works once, for ten minutes. */
  async setupCode(
    user: string,
    office: string,
  ): Promise<{ code: string; expires: string }> {
    const [inside] = await this.db.query(
      "SELECT 1 FROM office_people WHERE office_id = $1 AND user_id = $2",
      [office, user],
    );
    if (!inside) throw new AccountError("not-in-office");
    const code = randomBytes(18).toString("base64url");
    const expires = new Date(Date.now() + SETUP_MS).toISOString();
    await this.db.query(
      "INSERT INTO setup_codes (code_hash, office_id, user_id, expires) VALUES ($1, $2, $3, $4)",
      [hash(code), office, user, expires],
    );
    // Codes past their time are let go as new ones are made.
    await this.db.query(
      "DELETE FROM setup_codes WHERE expires < now() - interval '1 day'",
    );
    return { code, expires };
  }

  /**
   * A computer claims a setup code: its mini-me becomes the person's in that office, with a token
   * of its own (the computer's lasting credential, apart from the code that admitted it).
   */
  async claim(
    code: string,
    /** The token this computer's clone already holds, to be made the account's (`joinAs`). */
    adopt?: string,
  ): Promise<{
    office: { id: string; name: string };
    member: string;
    token: string;
    name: string;
    moved: boolean;
  }> {
    const [taken] = await this.db.query<{ office_id: string; user_id: string }>(
      "UPDATE setup_codes SET used = now() WHERE code_hash = $1 AND used IS NULL AND expires > now() RETURNING office_id, user_id",
      [hash(code)],
    );
    if (!taken)
      throw new RelayError(
        404,
        "That setup code is used or expired.",
        "setup-expired",
      );
    const [person] = await this.db.query<{ name: string }>(
      "SELECT name FROM auth_users WHERE id = $1",
      [taken.user_id],
    );
    const [office] = await this.db.query<{ id: string; name: string }>(
      "SELECT id, name FROM offices WHERE id = $1",
      [taken.office_id],
    );
    if (!person || !office)
      throw new RelayError(
        404,
        "That setup code is used or expired.",
        "setup-expired",
      );
    const joined = await this.relay.joinAs(
      office.id,
      taken.user_id,
      person.name,
      adopt,
    );
    return {
      office,
      member: joined.id,
      token: joined.token,
      name: person.name,
      moved: joined.moved,
    };
  }
}

/** An account's row without what Google gave to call it with, which is never needed here. */
function withoutTokens<T extends Record<string, unknown>>(account: T): T {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
  };
}

/** Sign-in settings as kept; anything unreadable reads as none. */
function parseKept(text: string): SignInKept {
  if (!text) return {};
  try {
    const kept = JSON.parse(text) as SignInKept;
    return kept && typeof kept === "object" ? kept : {};
  } catch {
    return {};
  }
}

/** A server's address as Google is told it: scheme and host, nothing after. */
function siteOf(address: string): string {
  const url = new URL(address);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new AccountError("account-failed");
  return url.origin;
}

/** Better Auth's answer to a start: the address at Google and the cookies binding the way back. */
async function started(
  response: Response,
): Promise<{ url: string; cookies: string[] }> {
  const { url } = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { url?: string };
  if (!response.ok || !url?.startsWith("https://accounts.google.com/"))
    throw new AccountError("google-failed");
  return { url, cookies: response.headers.getSetCookie() };
}
