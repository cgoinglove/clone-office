"use client";

// Settings › Office: the team the clone works with. In none yet: open one on this computer (teammates
// on the same network join by its invite link) or join a teammate's with theirs; a relay run by
// hand takes its address and key. In one: where it is, the invite link to copy, who is in it, and
// leaving it (or closing it, for the one open here).

import {
  Building2,
  Check,
  Copy,
  Link2,
  LogOut,
  Pencil,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot } from "@/features/office";
import type { BotShape } from "@/features/office/bot-shape";
import { looksOf } from "@/features/office/room/looks.mjs";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  HEADERS,
  type OfficeState,
  type Profile,
  statusText,
} from "../home/use-office";
import { parseInvite } from "../office/invite";
import { statusCode } from "../office/room-data";
import { Group, Groups, Rows } from "./parts";

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
          onJoin={(body) => office.post(body)}
        />
        {office.error && (
          <p className="text-destructive">{problemText(office.error)}</p>
        )}
      </Groups>
    );

  const members = data.members ?? [];
  return (
    <Groups>
      <Group
        title={tS("thisOffice")}
        hint={data.here ? tS("hereHint") : tS("joinedHint")}
      >
        {data.here ? <Here here={data.here} /> : <Invite busy={office.busy} />}
      </Group>

      <Group
        title={tS("people")}
        action={
          <span className="text-xs text-muted-foreground tabular-nums">
            {tS("count", { count: members.length })}
          </span>
        }
      >
        <Rows>
          {members.map((member, index) => {
            const mine = member.id === data.me?.id;
            const look = looksOf({ id: member.id, mine }, index);
            const status = statusCode(member.card.status);
            const off =
              status === "off" ||
              (!mine && Date.now() - Date.parse(member.seen) > 120_000);
            return (
              <li
                key={member.id}
                className="flex items-center gap-3 px-3.5 py-2.5"
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
                      {format.relativeTime(new Date(member.seen), now)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </Rows>
      </Group>

      {data.problem && (
        <p className="text-destructive">{problemText(data.problem)}</p>
      )}
      {office.error && (
        <p className="text-destructive">{problemText(office.error)}</p>
      )}

      <Leave
        here={Boolean(data.here)}
        busy={office.busy}
        onLeave={() => void office.post({ action: "leave" })}
      />
    </Groups>
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
  onJoin,
}: {
  lang: string;
  busy: boolean;
  profile: Profile;
  onJoin: (body: unknown) => Promise<boolean>;
}) {
  const t = useTranslations("office");
  const tS = useTranslations("settings.office");
  const [way, setWay] = useState<"here" | "join">("here");
  const [link, setLink] = useState("");
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
                variant="outline"
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

/** Copying the office's invite link, made ahead so a click copies it at once. */
function useInviteLink(skip = false) {
  const [url, setUrl] = useState<string>();
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (skip) return;
    let live = true;
    void fetch("/api/me/office", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ action: "invite" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!live) return;
        if (typeof data?.url === "string") setUrl(data.url);
        else setProblem(String(data?.error ?? "relay-unreachable"));
      })
      .catch(() => live && setProblem("relay-unreachable"));
    return () => {
      live = false;
    };
  }, [skip]);
  return { url, problem };
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
        variant={copied ? "outline" : "default"}
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
  const { url } = useInviteLink(Boolean(here.problem));
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
      {!here.problem && <CopyLink url={url} label={t("copyInvite")} />}
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

/** One link to bring a colleague in: the relay and the office's key, on the relay's invite page. */
function Invite({ busy }: { busy: boolean }) {
  const t = useTranslations("office");
  const problemText = useProblem();
  const { url, problem } = useInviteLink(busy);
  return (
    <div className="flex flex-col gap-2">
      <CopyLink url={url} label={t("copyInvite")} />
      <p className="text-xs text-muted-foreground">{t("inviteNote")}</p>
      {problem && (
        <p className="text-xs text-destructive">{problemText(problem)}</p>
      )}
    </div>
  );
}

/** Leaving the office; for the one open here, closing it, which teammates feel, so it asks once. */
function Leave({
  here,
  busy,
  onLeave,
}: {
  here: boolean;
  busy: boolean;
  onLeave: () => void;
}) {
  const t = useTranslations("office");
  const tS = useTranslations("settings.office");
  const [sure, setSure] = useState(false);
  return (
    <Group
      title={here ? t("close") : t("leave")}
      hint={here ? t("closeNote") : tS("leaveHint")}
      tone="danger"
    >
      {sure ? (
        <div className="flex gap-2">
          <Button
            variant="destructive"
            disabled={busy}
            loading={busy}
            onClick={onLeave}
          >
            {here ? t("close") : t("leave")}
          </Button>
          <Button variant="ghost" onClick={() => setSure(false)}>
            {t("keepOpen")}
          </Button>
        </div>
      ) : (
        <div>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => setSure(true)}
          >
            <LogOut />
            {here ? t("close") : t("leave")}
          </Button>
        </div>
      )}
    </Group>
  );
}
