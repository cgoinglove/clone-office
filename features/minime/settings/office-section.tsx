"use client";

// Settings › Office: the team the clone works with. In none yet: open one on this computer (teammates
// on the same network join by its invite link) or join a teammate's with theirs; a relay run by
// hand takes its address and key. In one: where it is, the invite link to copy, who is in it, asking
// colleagues from the AI apps the person works in (ai-apps.tsx), and leaving it (or closing it, for
// the one open here).

import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  LogOut,
  Pencil,
  UserPlus,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Bot } from "@/features/office";
import type { BotShape } from "@/features/office/bot-shape";
import { looksOf } from "@/features/office/room/looks.mjs";
import { useProblem } from "@/i18n/client";
import { cn, notAfter } from "@/lib/utils";
import { TeamKeys } from "../brain-panel";
import {
  HEADERS,
  type OfficeState,
  type Profile,
  statusText,
} from "../home/use-office";
import { parseInvite } from "../office/invite";
import { statusCode } from "../office/room-data";
import { useApp } from "../shell/app-state";
import { AiApps } from "./ai-apps";
import { Group, Groups } from "./parts";
import { Toggle } from "./preferences-section";

export function OfficeSection({
  lang,
  office,
  profile,
}: {
  lang: string;
  office: OfficeState;
  profile: Profile;
}) {
  const t = useTranslations("office");
  const tS = useTranslations("settings.office");
  const problemText = useProblem();
  const format = useFormatter();
  // Relative times read against a clock that moves on its own each minute.
  const now = useNow({ updateInterval: 60_000 });
  const data = office.office;
  if (!data) return null;

  if (!data.joined)
    return (
      <Groups>
        <Join
          lang={lang}
          busy={office.busy}
          profile={profile}
          invite={data.invite?.link}
          onJoin={(body) => office.post(body)}
        />
        {office.error && (
          <p className="text-destructive">{problemText(office.error)}</p>
        )}
      </Groups>
    );

  const members = data.members ?? [];
  const server = Boolean(data.relay && /^https?:\/\//.test(data.relay));
  return (
    <Groups>
      {/* inviting, and the team server's own pages, side by side (10-19 redesign) */}
      <div className={cn("grid gap-2.5", server && "sm:grid-cols-2")}>
        <Card
          icon={<UserPlus className="size-4" />}
          title={data.here ? tS("thisOffice") : tS("inviteTitle")}
          hint={data.here ? tS("hereHint") : tS("joinedHint")}
        >
          {data.here ? (
            <Here here={data.here} />
          ) : (
            <Invite busy={office.busy} />
          )}
        </Card>
        {server && (
          // The team server's own pages: one's account, the people, and, for whoever looks after
          // the server (for an office open here, this computer's person), how people sign in.
          <Card
            icon={<Globe className="size-4" />}
            title={tS("server")}
            hint={tS("serverHint")}
          >
            <ServerLink />
          </Card>
        )}
      </div>

      <Group
        title={tS("people")}
        action={
          <span className="text-xs text-muted-foreground tabular-nums">
            {tS("count", { count: members.length })}
          </span>
        }
      >
        <ul className="flex flex-col gap-0.5 rounded-[14px] p-1.5 shadow-[0_0_0_1px_var(--alpha-10)]">
          {members.map((member, index) => {
            const mine = member.id === data.me?.id;
            const look = looksOf({ id: member.id, mine }, index);
            const status = statusCode(member.card.status);
            // On the web: no clone to have gone quiet, so never off.
            const off =
              status === "off" ||
              (!mine &&
                status !== "web" &&
                Date.now() - Date.parse(member.seen) > 120_000);
            return (
              <li
                key={member.id}
                className="flex items-center gap-3 rounded-[10px] px-2.5 py-2"
              >
                <Bot
                  size={30}
                  shape={look.shape as BotShape}
                  color={mine ? undefined : look.color}
                  mood={off ? "sleep" : "idle"}
                  still
                  className={cn("shrink-0", off && "opacity-50")}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">
                      {member.card.name}
                    </span>
                    {mine && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {tS("you")}
                      </span>
                    )}
                  </span>
                  {member.card.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {member.card.description}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {off
                    ? tS("off")
                    : statusText(t, member.card.status) || tS("in")}
                  {!mine && (
                    <span className="block text-[11px]">
                      {format.relativeTime(notAfter(member.seen, now), now)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Group>

      <AiApps />

      <TeamKeys />

      <WebChat
        browsers={data.webKeys ?? 0}
        busy={office.busy}
        onForget={() => void office.post({ action: "forget-browsers" })}
      />

      {data.problem && (
        <p className="text-destructive">{problemText(data.problem)}</p>
      )}
      {office.error && (
        <p className="text-destructive">{problemText(office.error)}</p>
      )}

      <Leave
        here={Boolean(data.here)}
        busy={office.busy}
        error={office.error}
        onLeave={() => void office.post({ action: "leave" })}
      />
    </Groups>
  );
}

/** One part of the office's settings as a card: its mark and name, a line on what it is for. */
function Card({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-[14px] bg-background p-4 shadow-[0_0_0_1px_var(--alpha-10)]">
      <h3 className="flex items-center gap-2 text-[14px] font-semibold">
        {icon}
        {title}
      </h3>
      {hint && (
        <p className="-mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="mt-1">{children}</div>
    </section>
  );
}

/**
 * The way into an office: open one on this computer, which teammates on the same network join by
 * its invite link, or join a teammate's with theirs. The relay's address and key stay folded away
 * for a relay run by hand.
 */
function Join({
  lang,
  busy,
  profile,
  invite: kept,
  onJoin,
}: {
  lang: string;
  busy: boolean;
  profile: Profile;
  /** The invite the launcher kept, ready to join with. */
  invite?: string;
  onJoin: (body: unknown) => Promise<boolean>;
}) {
  const t = useTranslations("office");
  const tS = useTranslations("settings.office");
  const [way, setWay] = useState<"here" | "join">(kept ? "join" : "here");
  const [link, setLink] = useState(kept ?? "");
  const [byHand, setByHand] = useState(false);
  const [relay, setRelay] = useState("http://127.0.0.1:3200");
  const [key, setKey] = useState("");
  const [name, setName] = useState(profile.name ?? "");
  const [role, setRole] = useState(profile.role ?? "");
  const [drafting, setDrafting] = useState(false);
  useEffect(() => {
    setName((was) => was || profile.name || "");
    setRole((was) => was || profile.role || "");
  }, [profile.name, profile.role]);
  const invite = parseInvite(link);
  const target = byHand ? { relay, key } : invite;
  // The clone drafts the line from what it knows; the person corrects it before joining.
  const draft = async () => {
    setDrafting(true);
    try {
      const response = await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "draft", locale: lang }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && typeof data.description === "string")
        setRole(data.description);
    } finally {
      setDrafting(false);
    }
  };
  const ways = [
    {
      value: "here" as const,
      icon: Building2,
      title: t("openHere"),
      body: t("openHereNote"),
    },
    {
      value: "join" as const,
      icon: Link2,
      title: t("joinByLink"),
      body: t("joinByLinkNote"),
    },
  ];
  return (
    <Group title={tS("startTitle")} hint={t("intro")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const card = { name: name.trim(), description: role.trim() };
          if (way === "here") void onJoin({ action: "open", card });
          else if (target) void onJoin({ action: "join", ...target, card });
        }}
      >
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("title")}
        >
          {ways.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={way === option.value}
              onClick={() => setWay(option.value)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border border-border p-3.5 text-left transition-[border-color,box-shadow,background-color] hover:bg-muted/50",
                way === option.value &&
                  "border-foreground/70 shadow-[0_0_0_1px_var(--foreground)] hover:bg-background",
              )}
            >
              <option.icon className="size-4.5" />
              <span className="font-medium">{option.title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {option.body}
              </span>
            </button>
          ))}
        </div>

        {way === "join" && !byHand && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("inviteLink")}
            </span>
            <Input
              value={link}
              placeholder={t("inviteLinkPlaceholder")}
              aria-invalid={Boolean(link.trim()) && !invite}
              onChange={(e) => setLink(e.target.value)}
            />
            {link.trim() && !invite && (
              <span className="text-xs text-destructive">
                {t("notInviteLink")}
              </span>
            )}
          </label>
        )}
        {way === "join" && byHand && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("relay")}
              </span>
              <Input
                value={relay}
                placeholder={t("relayPlaceholder")}
                onChange={(e) => {
                  // An invite link fills in both the relay and the key.
                  const pasted = parseInvite(e.target.value);
                  setRelay(pasted ? pasted.relay : e.target.value);
                  if (pasted) setKey(pasted.key);
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t("key")}</span>
              <Input value={key} onChange={(e) => setKey(e.target.value)} />
            </label>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("name")}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("role")}</span>
            <div className="flex gap-2">
              <Input
                value={role}
                className="min-w-0 flex-1"
                placeholder={drafting ? t("drafting") : t("rolePlaceholder")}
                disabled={drafting}
                onChange={(e) => setRole(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={drafting}
                loading={drafting}
                onClick={() => void draft()}
              >
                {!drafting && <Pencil />}
                {t("draft")}
              </Button>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="brand"
            disabled={
              busy ||
              !name.trim() ||
              (way === "join" && !(target?.relay.trim() && target.key.trim()))
            }
            loading={busy}
          >
            {way === "here" ? t("open") : t("join")}
          </Button>
          {way === "join" && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => setByHand((was) => !was)}
            >
              {byHand ? t("byLinkInstead") : t("byHand")}
            </button>
          )}
        </div>
      </form>
    </Group>
  );
}

/**
 * An invite link, made when the person asks for one: each is for one person, so none is made
 * ahead of a click.
 */
function useInvite() {
  const [url, setUrl] = useState<string>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const make = () => {
    setBusy(true);
    setProblem(null);
    void fetch("/api/me/office", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ action: "invite" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (typeof data?.url === "string") setUrl(data.url);
        else setProblem(String(data?.error ?? "relay-unreachable"));
      })
      .catch(() => setProblem("relay-unreachable"))
      .finally(() => setBusy(false));
  };
  return { url, problem, busy, make };
}

/**
 * The team server's own pages, opened at its sign-in with the office's invite: someone signed in
 * there goes on to their page, someone with no account there is shown how to make one with it.
 */
function ServerLink() {
  const tS = useTranslations("settings.office");
  const problemText = useProblem();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            // The tab opens with the click, then goes where the office says: the link that makes
            // the server's admin, one to make this person's account, or the sign-in.
            const tab = window.open("about:blank", "_blank");
            if (tab) tab.opener = null;
            setProblem(null);
            void fetch("/api/me/office", {
              method: "POST",
              headers: HEADERS,
              body: JSON.stringify({ action: "server-link" }),
            })
              .then((r) => r.json())
              .then((data) => {
                // only a web page goes into the tab, never a script or another kind of link
                if (
                  typeof data?.url !== "string" ||
                  !/^https?:$/.test(new URL(data.url).protocol)
                )
                  throw new Error(String(data?.error ?? "relay-unreachable"));
                if (tab) tab.location.href = data.url;
                else window.open(data.url, "_blank", "noopener");
              })
              .catch((error: Error) => {
                tab?.close();
                setProblem(error.message || "relay-unreachable");
              });
          }}
        >
          {tS("serverOpen")}
          <ExternalLink />
        </Button>
      </div>
      {problem && (
        <p className="text-xs text-destructive">{problemText(problem)}</p>
      )}
    </div>
  );
}

/** Making an invite link, then copying it, with what it is for. */
function InviteMaker({ busy: away }: { busy: boolean }) {
  const t = useTranslations("office");
  const problemText = useProblem();
  const { url, problem, busy, make } = useInvite();
  return (
    <div className="flex flex-col gap-2">
      {url ? (
        <CopyLink url={url} label={t("copyInvite")} />
      ) : (
        <div>
          <Button variant="brand" disabled={busy || away} onClick={make}>
            {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {t("makeInvite")}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t("inviteNote")}
        {url && (
          <>
            {" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              disabled={busy}
              onClick={make}
            >
              {t("anotherInvite")}
            </button>
          </>
        )}
      </p>
      {problem && (
        <p className="text-xs text-destructive">{problemText(problem)}</p>
      )}
    </div>
  );
}

function CopyLink({ url, label }: { url?: string; label: string }) {
  const t = useTranslations("office");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-muted/40 py-1.5 pr-1.5 pl-3">
      <Link2 className="size-4 shrink-0 text-muted-foreground" />
      <code className="min-w-0 flex-1 truncate text-xs">{url ?? "…"}</code>
      <Button
        size="sm"
        variant={copied ? "secondary" : "default"}
        disabled={!url}
        onClick={() => {
          if (!url) return;
          void navigator.clipboard
            ?.writeText(url)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {});
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? t("copied") : label}
      </Button>
    </div>
  );
}

/** The office open on this computer: where teammates reach it, its invite link, and that it rests while this computer sleeps. */
function Here({
  here,
}: {
  here: { relay: string; network: boolean; problem?: string };
}) {
  const t = useTranslations("office");
  const problemText = useProblem();
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-sm">
        {here.problem ? (
          <WifiOff className="size-4 text-muted-foreground" />
        ) : (
          <Wifi className="size-4 text-brand" />
        )}
        <span className="font-medium">{t("openHereNow")}</span>
        <code className="truncate text-xs text-muted-foreground">
          {here.relay.replace(/^https?:\/\//, "")}
        </code>
      </div>
      {!here.problem && <InviteMaker busy={false} />}
      <p
        className={cn(
          "text-xs",
          here.problem ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {here.problem
          ? problemText(here.problem)
          : here.network
            ? t("openHereRest")
            : t("openHereNoNetwork")}
      </p>
    </div>
  );
}

/** Bringing a colleague in: a link for one person, on the relay's invite page. */
function Invite({ busy }: { busy: boolean }) {
  return <InviteMaker busy={busy} />;
}

/** Leaving the office; for the one open here, closing it, which teammates feel, so it asks once. */
function Leave({
  here,
  busy,
  error,
  onLeave,
}: {
  here: boolean;
  busy: boolean;
  /** Why the last step failed, said in the confirm while it is open. */
  error: string | null;
  onLeave: () => void;
}) {
  const t = useTranslations("office");
  const problemText = useProblem();
  const tS = useTranslations("settings.office");
  const tCommon = useTranslations("common");
  const [sure, setSure] = useState(false);
  return (
    <Group
      title={here ? t("close") : t("leave")}
      hint={here ? t("closeNote") : tS("leaveHint")}
      tone="danger"
    >
      <div>
        <Button
          variant="secondary"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={() => setSure(true)}
        >
          <LogOut />
          {here ? t("close") : t("leave")}
        </Button>
      </div>
      <ConfirmDialog
        open={sure}
        onOpenChange={setSure}
        title={here ? t("closeTitle") : t("leaveTitle")}
        description={here ? t("closeNote") : tS("leaveHint")}
        cancel={here ? t("keepOpen") : tCommon("cancel")}
        confirm={here ? t("close") : t("leave")}
        destructive
        busy={busy}
        error={error ? problemText(error) : undefined}
        onConfirm={onLeave}
      />
    </Group>
  );
}

/**
 * Talking to this clone from the team server's page, away from this computer: off until the person
 * turns it on (preferences `webChat`; office/own-chat.ts).
 */
function WebChat({
  browsers,
  busy,
  onForget,
}: {
  browsers: number;
  busy: boolean;
  onForget: () => void;
}) {
  const t = useTranslations("settings.office.webChat");
  const app = useApp();
  const on = Boolean(app.preferences?.webChat);
  return (
    <Group title={t("title")} hint={t("hint")}>
      <Toggle
        title={t("take")}
        body={t("takeHint")}
        checked={on}
        onChange={(webChat) => void app.changePreferences({ webChat })}
      />
      {/* The browsers paired on the team server's page; each must be paired again once let go. */}
      {(on || browsers > 0) && (
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <span>{t("browsers", { count: browsers })}</span>
          {browsers > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={onForget}
            >
              {t("forget")}
            </Button>
          )}
        </div>
      )}
    </Group>
  );
}
