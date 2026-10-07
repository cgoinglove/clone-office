"use client";

// The first time with sub-office (/start), after Thursday's first run: it opens on what the app is,
// beside the office itself playing the app's one loop (demo.ts), then one thing a screen: what the
// clone thinks with, letting it learn how the person works, who they are and whether a team is in
// it, and their office, which they enter by its lobby. No step holds anyone: each can be passed
// and done later in Settings.

import {
  ArrowRight,
  Bookmark,
  Building2,
  Check,
  ChevronLeft,
  Clock,
  EyeOff,
  Link2,
  ScanSearch,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShinyText } from "@/components/ui/shiny-text";
import { Logo, LogoMark } from "@/features/brand/logo";
import { Bot } from "@/features/office";
import { OfficeRoom } from "@/features/office/room/office-room";
import { personTag, useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  BrainChooser,
  type BrainState,
  brainLabel,
  brainReady,
} from "../brain-panel";
import { type Folder, FolderList, type LeftOut } from "../folder-list";
import { useLearn } from "../home/use-learn";
import { HEADERS } from "../home/use-office";
import { LanguageSwitch } from "../language-switch";
import { parseInvite } from "../office/invite";
import { BringFromAnotherAi } from "../settings/clone-section";
import { type DemoWords, useDemoRoom } from "./demo";

const STEPS = ["brain", "learn", "you", "ready"] as const;
type Step = (typeof STEPS)[number];
type Team = "alone" | "join" | "open";

/** The column the words stand in, and the office beside it. */
const COLUMN = 600;

export function Onboarding() {
  const t = useTranslations("start");
  const problemText = useProblem();
  const router = useRouter();
  const [step, setStep] = useState<"hello" | Step>("hello");
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [lang, setLang] = useState("en");
  useEffect(() => setLang(personTag()), []);
  const learn = useLearn(lang);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState<Team>("alone");
  const [invite, setInvite] = useState("");
  // Started with `sub-office join <link>`: the invite is kept, and joining it is the way in.
  const [invited, setInvited] = useState<{ from?: string } | null>(null);
  useEffect(() => {
    void fetch("/api/me/office", { headers: HEADERS })
      .then((response) => response.json())
      .then((data) => {
        if (typeof data?.invite?.link !== "string") return;
        setTeam("join");
        setInvite(data.invite.link);
        setInvited({ from: data.invite.from });
      })
      .catch(() => undefined);
  }, []);
  const [office, setOffice] = useState<"alone" | "joined" | "opened">("alone");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 960px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const words = useMemo<DemoWords>(
    () => ({
      you: t("demo.you"),
      people: (["a", "b", "c"] as const).map((id) => ({
        id,
        name: t(`demo.people.${id}.name`),
        role: t(`demo.people.${id}.role`),
      })),
      ask: t("demo.ask"),
      answer: t("demo.answer"),
      decide: t("demo.decide"),
      question: t("demo.question"),
      decided: t("demo.decided"),
    }),
    [t],
  );
  const demo = useDemoRoom(words, wide);
  const at = step === "hello" ? -1 : STEPS.indexOf(step);

  const go = (next: "hello" | Step) => {
    setProblem(null);
    setStep(next);
  };

  /** Keeps who they are, and brings the clone to the team they picked. */
  const saveYou = async () => {
    setProblem(null);
    const found = team === "join" ? parseInvite(invite) : undefined;
    if (team === "join" && !found) {
      setProblem("not-invite-link");
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/me/profile", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ name: name.trim(), role: role.trim() }),
      }).catch(() => undefined);
      if (team !== "alone") {
        const card = { name: name.trim(), description: role.trim() };
        const response = await fetch("/api/me/office", {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify(
            found
              ? { action: "join", relay: found.relay, key: found.key, card }
              : { action: "open", card },
          ),
        }).catch(() => undefined);
        const data = await response?.json().catch(() => ({}));
        if (!response?.ok) {
          setProblem(
            String(data?.error ?? response?.status ?? "relay-unreachable"),
          );
          return;
        }
        setOffice(found ? "joined" : "opened");
      }
      go("ready");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    await fetch("/api/me/onboarded", {
      method: "POST",
      headers: HEADERS,
    }).catch(() => undefined);
    router.push("/home");
  };

  return (
    <div className="relative h-full min-h-0 flex-1 overflow-hidden bg-background">
      {wide && (
        <>
          <OfficeRoom
            full
            data={demo.room}
            insetLeft={COLUMN - 40}
            className="absolute inset-0"
          />
          {/* The words' column fades into the office beside it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 bg-linear-to-r from-background from-75% to-transparent"
            style={{ width: COLUMN + 160 }}
          />
        </>
      )}

      <header className="absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between px-8 max-sm:px-5">
        <Logo />
        <LanguageSwitch />
      </header>

      <div
        // A long step scrolls from its top, and fades out under the bar above and the steps below.
        className="relative z-10 h-full overflow-y-auto mask-[linear-gradient(to_bottom,transparent,black_5.5rem,black_calc(100%-6rem),transparent)]"
        style={{ width: wide ? COLUMN : "100%" }}
      >
        <div className="flex min-h-full flex-col px-14 pt-24 pb-28 max-sm:px-5">
          {step === "hello" ? (
            <Hello onStart={() => go("brain")} />
          ) : (
            <div
              key={step}
              className="my-auto flex flex-col gap-7 animate-in duration-500 fade-in slide-in-from-bottom-2"
            >
              <div className="space-y-2.5">
                <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                  {t("stepOf", { at: at + 1, count: STEPS.length })}
                </span>
                <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.02em] text-balance">
                  {t(`${step}.title`)}
                </h1>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  {t(`${step}.body`)}
                </p>
              </div>

              {step === "brain" && (
                <>
                  <BrainChooser onChange={setBrain} />
                  <Next
                    // Picked by the person, never a vendor on its own.
                    disabled={!brainReady(brain) || !brain?.chosen}
                    onClick={() => go("learn")}
                    hint={!brain?.chosen ? t("brain.pick") : undefined}
                  />
                </>
              )}

              {step === "learn" && (
                <LearnStep learn={learn} lang={lang} onNext={() => go("you")} />
              )}

              {step === "you" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {t("you.name")}
                      </span>
                      <Input
                        autoFocus
                        value={name}
                        maxLength={80}
                        autoComplete="name"
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {t("you.role")}
                      </span>
                      <Input
                        value={role}
                        maxLength={200}
                        placeholder={t("you.rolePlaceholder")}
                        onChange={(event) => setRole(event.target.value)}
                      />
                    </label>
                  </div>
                  <div
                    className="flex flex-col gap-2"
                    role="radiogroup"
                    aria-label={t("you.team")}
                  >
                    <span className="text-sm font-medium">{t("you.team")}</span>
                    {invited && team === "join" && (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {invited.from
                          ? t("you.invited", { from: invited.from })
                          : t("you.invitedNobody")}
                      </p>
                    )}
                    {(
                      [
                        ["alone", UserRound],
                        ["join", Link2],
                        ["open", Building2],
                      ] as const
                    ).map(([value, Icon]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={team === value}
                        onClick={() => {
                          setTeam(value);
                          setProblem(null);
                        }}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border border-border bg-background px-3.5 py-3 text-left transition-[border-color,box-shadow,background-color] hover:bg-muted/50",
                          team === value &&
                            "border-foreground/70 shadow-[0_0_0_1px_var(--foreground)] hover:bg-background",
                        )}
                      >
                        <Icon className="mt-0.5 size-4.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {t(`you.${value}`)}
                          </span>
                          <span className="block text-xs leading-relaxed text-muted-foreground">
                            {t(`you.${value}Note`)}
                          </span>
                        </span>
                      </button>
                    ))}
                    {team === "join" && (
                      <Input
                        spellCheck={false}
                        value={invite}
                        placeholder={t("you.link")}
                        aria-label={t("you.link")}
                        onChange={(event) => setInvite(event.target.value)}
                      />
                    )}
                  </div>
                  <Next
                    busy={busy}
                    disabled={
                      busy ||
                      (team !== "alone" && !name.trim()) ||
                      (team === "join" && !invite.trim())
                    }
                    onClick={() => void saveYou()}
                    label={
                      team === "join"
                        ? t("you.joinGo")
                        : team === "open"
                          ? t("you.openGo")
                          : undefined
                    }
                  />
                </>
              )}

              {step === "ready" && (
                <>
                  <ul className="flex flex-col overflow-hidden rounded-xl border border-border">
                    <ReadyRow
                      done={brainReady(brain)}
                      label={t("ready.brain")}
                      value={
                        brain ? brainLabel(brain, t("ready.claudeCode")) : "—"
                      }
                    />
                    <ReadyRow
                      done={learn.stage === "done" || learn.kept.length > 0}
                      busy={learn.stage === "learning"}
                      label={t("ready.learned")}
                      value={
                        learn.stage === "learning"
                          ? t("ready.reading")
                          : learn.kept.length > 0
                            ? t("ready.lines", { count: learn.kept.length })
                            : t("ready.later")
                      }
                    />
                    <ReadyRow
                      done
                      label={t("ready.office")}
                      value={t(`ready.${office}`)}
                    />
                  </ul>
                  <p className="text-[15px] leading-relaxed text-muted-foreground">
                    {t("ready.try")}
                  </p>
                  <Next
                    busy={busy}
                    disabled={busy}
                    onClick={() => void finish()}
                    label={t("ready.go")}
                  />
                </>
              )}

              {problem && (
                <p className="text-sm text-destructive" role="alert">
                  {problem === "not-invite-link"
                    ? t("you.notLink")
                    : problemText(problem)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {step === "hello" ? (
        wide && <Caption beat={demo.beat} />
      ) : (
        <nav
          aria-label={t("title")}
          className="absolute bottom-0 left-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 bg-linear-to-t from-background from-60% to-transparent px-14 pt-10 pb-7 font-mono text-[11px] text-muted-foreground max-sm:px-5"
          style={{ width: wide ? COLUMN : "100%" }}
        >
          <button
            type="button"
            onClick={() => go(at > 0 ? STEPS[at - 1] : "hello")}
            className="flex items-center gap-1 justify-self-start rounded-md outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft className="size-3" />
            {t("back")}
          </button>
          <span className="flex items-center gap-1.5" aria-hidden>
            {STEPS.map((name, index) => (
              <span
                key={name}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  index === at ? "w-5 bg-foreground" : "w-1.5",
                  index < at && "bg-foreground/40",
                  index > at && "bg-border",
                )}
              />
            ))}
          </span>
          {step === "ready" ? (
            <span />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish()}
              className="justify-self-end rounded-md outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("later")}
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

/** The first screen: what a clone is, in a few words, and the way in. */
function Hello({ onStart }: { onStart: () => void }) {
  const t = useTranslations("start");
  const points = ["work", "team", "calls"] as const;
  return (
    <div className="my-auto flex flex-col gap-8">
      <LogoMark className="size-14 animate-in duration-700 zoom-in-50 fade-in" />
      <div className="space-y-4">
        <h1 className="animate-in text-[52px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance delay-150 duration-700 fill-mode-backwards fade-in slide-in-from-bottom-2">
          {t("hello.title")}
        </h1>
        <p className="max-w-[28rem] animate-in text-[17px] leading-relaxed text-muted-foreground delay-300 duration-700 fill-mode-backwards fade-in slide-in-from-bottom-2">
          {t("hello.body")}
        </p>
      </div>
      <ul className="flex animate-in flex-col gap-2.5 delay-500 duration-700 fill-mode-backwards fade-in">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-[15px]">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-foreground text-background">
              <Check className="size-3" />
            </span>
            {t(`hello.${point}`)}
          </li>
        ))}
      </ul>
      <div className="flex animate-in flex-col items-start gap-3 delay-700 duration-700 fill-mode-backwards fade-in slide-in-from-bottom-2">
        <Button
          variant="brand"
          className="h-11 gap-2 px-5 text-[15px]"
          onClick={onStart}
        >
          {t("hello.go")}
          <ArrowRight />
        </Button>
        <p className="font-mono text-[11px] text-muted-foreground">
          {t("hello.fine")}
        </p>
      </div>
    </div>
  );
}

/** What the office beside the first screen is showing, one beat at a time. */
function Caption({ beat }: { beat: number }) {
  const t = useTranslations("start");
  const line = beat <= 0 ? null : t(`demo.beats.${Math.min(beat, 6)}` as never);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute right-8 bottom-8 z-20 max-w-sm text-right"
    >
      {line && (
        <p
          key={beat}
          className="inline-block animate-in rounded-xl bg-background/90 px-3.5 py-2 text-sm shadow-[0_0_0_1px_var(--alpha-10),0_8px_24px_var(--alpha-08)] backdrop-blur duration-500 fade-in slide-in-from-bottom-1"
        >
          {line}
        </p>
      )}
    </div>
  );
}

function Next({
  onClick,
  disabled,
  busy,
  label,
  hint,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  hint?: string;
}) {
  const t = useTranslations("start");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="brand"
        className="h-11 gap-2 px-5 text-[15px]"
        disabled={disabled}
        loading={busy}
        onClick={onClick}
      >
        {label ?? t("next")}
        {!busy && <ArrowRight />}
      </Button>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function ReadyRow({
  done,
  busy,
  label,
  value,
}: {
  done: boolean;
  busy?: boolean;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md",
          done
            ? "bg-foreground text-background"
            : "bg-muted text-muted-foreground",
        )}
      >
        {done && <Check className="size-3" />}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right text-sm font-medium">
        {busy ? <ShinyText text={value} /> : value}
      </span>
    </li>
  );
}

/** Letting it read: what it reads, keeps and skips, the folders to leave out, and the reading. */
function LearnStep({
  learn,
  lang,
  onNext,
}: {
  learn: ReturnType<typeof useLearn>;
  lang: string;
  onNext: () => void;
}) {
  const t = useTranslations("start");
  const tRun = useTranslations("firstRun");
  const problemText = useProblem();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [others, setOthers] = useState<LeftOut[]>([]);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [showFolders, setShowFolders] = useState(false);

  useEffect(() => {
    if (folders) return;
    void fetch("/api/me/sources", { headers: HEADERS })
      .then((r) => r.json())
      .then(
        (data: {
          folders: Folder[];
          exclude: string[];
          others?: LeftOut[];
        }) => {
          setFolders(data.folders ?? []);
          setExcludes(data.exclude ?? []);
          setOthers(data.others ?? []);
        },
      )
      .catch(() => setFolders([]));
  }, [folders]);

  const saveExcludes = async (next: string[]) => {
    const response = await fetch("/api/me/sources", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ exclude: next }),
    }).catch(() => undefined);
    if (!response?.ok) return;
    setExcludes(next);
    setFolders(null);
  };

  const reading = learn.stage === "learning";
  const done = learn.stage === "done" && learn.kept.length > 0;
  const nothingToRead =
    folders !== null && folders.length === 0 && others.length === 0;
  const label = learn.progress
    ? learn.progress.phase === "read" &&
      learn.progress.source &&
      tRun.has(`source.${learn.progress.source}` as never)
      ? tRun(`source.${learn.progress.source}` as never)
      : tRun(`phase.${learn.progress.phase}`)
    : "";
  const plan = [
    ["read", ScanSearch],
    ["keep", Bookmark],
    ["skip", EyeOff],
    ["time", Clock],
  ] as const;

  return (
    <>
      {!reading && !done && (
        <ul className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          {plan.map(([part, Icon]) => (
            <li key={part} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-4 text-muted-foreground" />
                {tRun(`plan.${part}.title`)}
              </span>
              <span className="text-[13px] leading-snug text-muted-foreground">
                {tRun(`plan.${part}.body`)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {nothingToRead && !reading && !done && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("learn.none")}</p>
          <BringFromAnotherAi lang={lang} onDone={() => {}} />
        </div>
      )}

      {!nothingToRead && folders && !reading && !done && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={showFolders}
            onClick={() => setShowFolders((was) => !was)}
            className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t("learn.leaveOut", { count: folders.length })}
          </button>
          {showFolders && (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-border p-3">
              <FolderList
                folders={folders}
                others={others}
                excludes={excludes}
                onToggle={(folder) =>
                  void saveExcludes(
                    folder.excluded
                      ? excludes.filter((p) => p !== folder.path)
                      : [...excludes, folder.path],
                  )
                }
                onBringBack={(pattern) =>
                  void saveExcludes(excludes.filter((p) => p !== pattern))
                }
              />
            </div>
          )}
        </div>
      )}

      {(reading || done) && (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <Bot size={40} mood={reading ? "working" : "happy"} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {reading ? <ShinyText text={label} /> : t("learn.done")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {reading ? t("learn.reading") : t("learn.doneHint")}
              </span>
            </span>
            {reading && learn.progress && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {learn.progress.percent}%
              </span>
            )}
          </div>
          {reading && learn.progress && (
            <span className="block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-brand transition-[width] duration-500"
                style={{ width: `${learn.progress.percent}%` }}
              />
            </span>
          )}
          {learn.kept.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {learn.kept.map((line) => (
                <li
                  key={line}
                  className="flex animate-in items-start gap-2 text-sm duration-500 fade-in slide-in-from-bottom-1"
                >
                  <Check className="mt-0.5 size-3.5 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {learn.problem && (
        <p className="text-sm text-destructive">{problemText(learn.problem)}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!reading && !done && !nothingToRead && (
          <Button
            variant="brand"
            className="h-11 gap-2 px-5 text-[15px]"
            disabled={folders === null}
            onClick={() => void learn.start()}
          >
            {t("learn.read")}
            <ArrowRight />
          </Button>
        )}
        {(reading || done || nothingToRead) && (
          <Button
            variant="brand"
            className="h-11 gap-2 px-5 text-[15px]"
            onClick={onNext}
          >
            {t("next")}
            <ArrowRight />
          </Button>
        )}
        {!reading && !done && !nothingToRead && (
          <Button variant="ghost" className="h-11 text-[15px]" onClick={onNext}>
            {t("learn.skip")}
          </Button>
        )}
      </div>
    </>
  );
}
