// The people of an office's server and how they get in, after Paperclip (which signs its people in
// with Better Auth) and OpenClaw (which pairs a device by a setup link): someone opens their
// office's invite link and makes an account there (name, email, password; Better Auth keeps the
// password hashed and the session in a cookie). Their own page then gives them one line to run on
// their computer. The line carries a setup code that works once, for ten minutes; claiming it gives
// that computer's mini-me its own lasting token in the office, under their account. One person, one
// mini-me: connecting another computer moves it there.
//
// Node runs this file without a build, so no TypeScript-only syntax such as parameter properties.

import { createHash, randomBytes } from "node:crypto";
import { type Auth, type BetterAuthOptions, betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type { Database } from "./db.ts";
import { PGliteDialect } from "./pglite-dialect.ts";
import { type Relay, RelayError } from "./relay.ts";

/** How long a computer's setup code works. */
export const SETUP_MS = 10 * 60 * 1000;

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

export interface Place {
  office: string;
  key: string;
  name: string;
  role: "owner" | "member";
}

const hash = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/** The secret Better Auth signs sessions with: the one given, else one made once and kept. */
async function keptSecret(db: Database): Promise<string> {
  const [row] = await db.query<{ value: string }>(
    "SELECT value FROM server_settings WHERE name = 'auth-secret'",
  );
  if (row) return row.value;
  const made = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO server_settings (name, value) VALUES ('auth-secret', $1) ON CONFLICT (name) DO NOTHING",
    [made],
  );
  const [kept] = await db.query<{ value: string }>(
    "SELECT value FROM server_settings WHERE name = 'auth-secret'",
  );
  return kept?.value ?? made;
}

/** What Better Auth answered, as a code the relay's pages say in the reader's language. */
async function refusal(response: Response): Promise<string> {
  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { code?: string };
  const code = String(body.code ?? "");
  if (/ALREADY_EXISTS/i.test(code)) return "account-exists";
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
  readonly auth: Auth<BetterAuthOptions>;
  private db: Database;
  private relay: Relay;

  private constructor(
    auth: Auth<BetterAuthOptions>,
    db: Database,
    relay: Relay,
  ) {
    this.auth = auth;
    this.db = db;
    this.relay = relay;
  }

  /**
   * Sign-in over the relay's own database. `publicUrl` is the address people reach the server at
   * (https makes its cookies secure); without one it is taken from each request.
   */
  static async open(
    db: Database,
    relay: Relay,
    options: { secret?: string; publicUrl?: string } = {},
  ): Promise<Accounts> {
    const config: BetterAuthOptions = {
      appName: "Clone Office",
      secret:
        options.secret ||
        process.env.BETTER_AUTH_SECRET ||
        (await keptSecret(db)),
      ...(options.publicUrl ? { baseURL: options.publicUrl } : {}),
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
      },
      user: { modelName: "auth_users" },
      session: { modelName: "auth_sessions" },
      account: { modelName: "auth_accounts" },
      verification: { modelName: "auth_verifications" },
      advanced: {
        cookiePrefix: "sub-office",
        useSecureCookies: Boolean(options.publicUrl?.startsWith("https:")),
      },
      // The relay's pages check where a form came from, and limit tries from one address.
      rateLimit: { enabled: false },
      telemetry: { enabled: false },
      // Without a public address the origin comes from each request, as the relay's pages need.
      logger: { level: "error" },
    };
    const { runMigrations } = await getMigrations(config);
    await runMigrations();
    return new Accounts(betterAuth(config), db, relay);
  }

  /** The office an invite's key opens. */
  private async officeByKey(
    key: string,
  ): Promise<{ id: string; name: string } | undefined> {
    const [row] = await this.db.query<{ id: string; name: string }>(
      "SELECT id, name FROM offices WHERE key = $1",
      [key],
    );
    return row;
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
    const office = await this.officeByKey(key);
    if (!office) throw new AccountError("invite-wrong");
    const name = input.name.trim().slice(0, 80);
    if (!name) throw new AccountError("name-missing");
    const response = (await this.auth.api.signUpEmail({
      body: { name, email: input.email.trim(), password: input.password },
      asResponse: true,
    })) as Response;
    if (!response.ok) throw new AccountError(await refusal(response));
    const { user } = (await response.json()) as { user: Person };
    await this.place(office.id, user.id);
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
    const response = (await this.auth.api.signInEmail({
      body: { email: input.email.trim(), password: input.password },
      asResponse: true,
    })) as Response;
    if (!response.ok) throw new AccountError(await refusal(response));
    const { user } = (await response.json()) as { user: Person };
    if (key) {
      const office = await this.officeByKey(key);
      if (office) await this.place(office.id, user.id);
    }
    return {
      person: { id: user.id, name: user.name, email: user.email },
      cookies: response.headers.getSetCookie(),
    };
  }

  /** The person a browser's cookie signs in, if any. */
  async person(cookie: string | undefined): Promise<Person | undefined> {
    if (!cookie) return undefined;
    const found = (await this.auth.api
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
    const response = (await this.auth.api
      .signOut({ headers: new Headers({ cookie }), asResponse: true })
      .catch(() => undefined)) as Response | undefined;
    return response?.headers.getSetCookie() ?? [];
  }

  /** A signed-in person opening another invite: they join that office too. */
  async enter(key: string, user: string): Promise<boolean> {
    const office = await this.officeByKey(key);
    if (!office) return false;
    await this.place(office.id, user);
    return true;
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
    }>(
      "SELECT u.id, u.name, u.email, p.role, p.joined, m.id AS member, m.card, m.seen FROM office_people p JOIN auth_users u ON u.id = p.user_id LEFT JOIN members m ON m.office_id = p.office_id AND m.user_id = p.user_id WHERE p.office_id = $1 ORDER BY p.joined, u.name",
      [office],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role === "owner" ? "owner" : "member",
      joined: when(row.joined),
      ...(row.member
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
  async claim(code: string): Promise<{
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
