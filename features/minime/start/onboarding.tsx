"use client";

// The first time with Clone Office (/start), after Thursday's first run: it opens on what the app is,
// beside the office itself playing the app's one loop (demo.ts), then one thing a screen: what the
// clone thinks with, letting it learn the person's work, who they are and whether a team is in it,
// and their office. Someone invited to an office joins it first, so their team's models are there
// to pick. No step holds anyone: each can be passed and done later in Settings.
//
// Every step stands in one frame: the name and the language on top, the steps beneath, the title in
// the same place each time, and at the bottom one bar: back, the clone's own line about what to do
// (after Thursday's brand dot), and the step's button. A screen meant to be seen at once never
// grows because something was clicked: what is picked opens in a popover or a dialog at its field
// (`.claude/rules/taste.md`, No growing panes), and what is under way always shows it (Under way).

import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  CircleCheck,
  EyeOff,
  Folder as FolderIcon,
  Link2,
  Loader2,
  Monitor,
  ScanSearch,
  Search,
  Send,
  UserCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ShinyText } from "@/components/ui/shiny-text";
import { BrandMark, type MarkId } from "@/features/brand/brand-mark";
import { APP_NAME, LogoMark } from "@/features/brand/logo";
import { Bot } from "@/features/office";
import { OfficeRoom } from "@/features/office/room/office-room";
import { personTag, useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  BrainPicker,
  type BrainState,
  brainLabel,
  brainReady,
} from "../brain-panel";
import type { Folder, LeftOut } from "../folder-list";
import { useLearn } from "../home/use-learn";
import { HEADERS, splitList } from "../home/use-office";
import { LanguageSwitch } from "../language-switch";
import { parseInvite } from "../office/invite";
import { BringFromAnotherAi } from "../settings/clone-section";
import { type DemoWords, useDemoRoom } from "./demo";

type Step = "brain" | "learn" | "you" | "ready";
type Team = "alone" | "join" | "open";
type Autonomy = "ask" | "reads" | "auto";

/** The steps in order; someone invited joins their office first, so its models are there to pick. */
const ORDER: Step[] = ["brain", "learn", "you", "ready"];
const INVITED_ORDER: Step[] = ["you", "brain", "learn", "ready"];

/** The tools a person may already use, shown on the first screen: the clone keeps to them. */
const USED: [MarkId, string][] = [
  ["claude", "Claude Code"],
  ["openai", "ChatGPT"],
  ["codex", "Codex"],
  ["cursor", "Cursor"],
];

/** Each tool whose records the reading finds, by its own mark and name. */
const TOOL_MARKS: Record<string, [MarkId, string]> = {
  claude: ["claude", "Claude Code"],
  codex: ["codex", "Codex"],
  cursor: ["cursor", "Cursor"],
  hermes: ["hermes", "Hermes"],
};

/** What the reading reads, in the order it reads them (learn/learn.ts). */
const SOURCES = ["notes", "inputs", "commits", "work"] as const;

export function Onboarding() {
  const t = useTranslations("start");
  const problemText = useProblem();
  const router = useRouter();
  const [step, setStep] = useState<"hello" | Step>("hello");
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [lang, setLang] = useState("en");
  useEffect(() => setLang(personTag()), []);
  const learn = useLearn(lang);
  const folders = useFolders();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [owns, setOwns] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  // What the reading saw of their work fills in what they have not typed, for them to correct.
  const about = learn.about;
  useEffect(() => {
    if (!about) return;
    setRole((was) => was || about.role);
    setOwns((was) => was || about.owns.join(", "));
    setTools((was) => (was.length ? was : about.tools));
  }, [about]);
  const [team, setTeam] = useState<Team>("alone");
  const [invite, setInvite] = useState("");
  // Started with `clone-office join <link>`: the invite is kept, and joining it is the way in.
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
  const order = invited ? INVITED_ORDER : ORDER;
  const [office, setOffice] = useState<"alone" | "joined" | "opened">("alone");
  const [autonomy, setAutonomy] = useState<Autonomy>("ask");
  useEffect(() => {
    void fetch("/api/me/preferences", { headers: HEADERS })
      .then((response) => response.json())
      .then((data) => {
        if (["ask", "reads", "auto"].includes(data?.autonomy))
          setAutonomy(data.autonomy);
      })
      .catch(() => undefined);
  }, []);
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
  const at = step === "hello" ? -1 : order.indexOf(step);
  const next = order[at + 1] ?? "ready";

  // The brain picked is asked one word as soon as it is picked, so the step says at once whether it
  // answers, and what to do when it does not.
  const [probe, setProbe] = useState<{
    of: string;
    ok: boolean;
    seconds?: number;
    problem?: string;
    detail?: string;
  } | null>(null);
  const picked =
    brain?.chosen && brainReady(brain) ? JSON.stringify(brain.choice) : "";
  useEffect(() => {
    if (!picked) return;
    let gone = false;
    const started = Date.now();
    setProbe(null);
    void (async () => {
      const response = await fetch("/api/me/brain", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "probe" }),
      }).catch(() => undefined);
      const data = await response?.json().catch(() => undefined);
      if (gone) return;
      setProbe(
        response?.ok && data?.ok
          ? { of: picked, ok: true, seconds: (Date.now() - started) / 1000 }
          : {
              of: picked,
              ok: false,
              problem: data?.problem ?? data?.error ?? "brain-no-answer",
              detail: data?.detail,
            },
      );
    })();
    return () => {
      gone = true;
    };
  }, [picked]);
  const answered = probe?.of === picked ? probe : null;
  // Stable, as the picker reloads whenever it changes.
  const pickBrain = useCallback((next: BrainState) => setBrain(next), []);

  const go = (target: "hello" | Step) => {
    setProblem(null);
    setStep(target);
  };

  const card = () => ({
    name: name.trim(),
    description: role.trim(),
    owns: splitList(owns),
  });
  const saveProfile = () =>
    fetch("/api/me/profile", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        name: name.trim(),
        role: role.trim(),
        owns: splitList(owns),
        tools,
      }),
    }).catch(() => undefined);

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
      await saveProfile();
      if (team !== "alone" && office === "alone") {
        const response = await fetch("/api/me/office", {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify(
            found
              ? {
                  action: "join",
                  relay: found.relay,
                  key: found.key,
                  card: card(),
                }
              : { action: "open", card: card() },
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
      go(next);
    } finally {
      setBusy(false);
    }
  };

  const chooseAutonomy = (value: Autonomy) => {
    setAutonomy(value);
    void fetch("/api/me/preferences", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ autonomy: value }),
    }).catch(() => undefined);
  };

  const finish = async () => {
    setBusy(true);
    // What the reading filled in after they joined goes on their profile and their card too.
    await saveProfile();
    if (office !== "alone" && name.trim())
      await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "card", card: card() }),
      }).catch(() => undefined);
    await fetch("/api/me/onboarded", {
      method: "POST",
      headers: HEADERS,
    }).catch(() => undefined);
    router.push("/home");
  };

  const reading = learn.stage === "learning";
  const learned = learn.stage === "done" && learn.kept.length > 0;
  const nothingToRead =
    folders.list !== null &&
    folders.list.length === 0 &&
    folders.others.length === 0;
  const knows = learn.knows;
  const knowsCount = knows
    ? knows.user.length +
      knows.work.length +
      knows.projects.length +
      knows.people.length
    : learn.kept.length;

  const skip = (label = t("later")) => (
    <Ghost disabled={busy} onClick={() => go(next)}>
      {label}
    </Ghost>
  );

  let main: ReactNode = null;
  let bar: { guide: ReactNode; right: ReactNode } = {
    guide: null,
    right: null,
  };
  if (step === "hello") {
    main = <Hello />;
    bar = {
      guide: <Guide>{t("hello.fine")}</Guide>,
      right: (
        <Primary big onClick={() => go(order[0])}>
          {t("hello.go")}
        </Primary>
      ),
    };
  } else if (step === "brain") {
    main = (
      <>
        <Heading title={t("brain.title")} body={t("brain.body")} />
        <div className="mt-7 flex flex-col">
          <BrainPicker onChange={pickBrain} suggest />
          {brain?.chosen && (
            <Answered
              brain={brain}
              probe={answered}
              onAnyway={() => go(next)}
            />
          )}
          <BrainGuide />
        </div>
      </>
    );
    bar = {
      guide: !brain?.chosen ? (
        <Guide>{t("guide.brainPick")}</Guide>
      ) : !answered ? (
        <Guide busy>{`${t("brain.probing")}…`}</Guide>
      ) : answered.ok ? (
        <Guide>{t("guide.brainOk")}</Guide>
      ) : (
        <Guide>{t("guide.brainFailed")}</Guide>
      ),
      right: (
        <>
          {skip()}
          <Primary
            // Picked by the person, never a vendor on its own, and heard to answer.
            disabled={!answered?.ok}
            onClick={() => go(next)}
          >
            {t("next")}
          </Primary>
        </>
      ),
    };
  } else if (step === "learn") {
    main = (
      <>
        <Heading
          title={learned ? t("learn.doneTitle") : t("learn.title")}
          body={
            learned
              ? t("learn.doneBody", { count: knowsCount })
              : t("learn.body")
          }
        />
        <LearnStep
          learn={learn}
          lang={lang}
          folders={folders}
          nothingToRead={nothingToRead}
          count={knowsCount}
        />
      </>
    );
    bar = {
      guide: nothingToRead ? (
        <Guide>{t("guide.learnNone")}</Guide>
      ) : reading ? (
        <Guide busy>
          {t("guide.reading", { percent: learn.progress?.percent ?? 0 })}
        </Guide>
      ) : learned ? (
        <Guide>{t("guide.learned")}</Guide>
      ) : (
        <Guide>{t("guide.learn")}</Guide>
      ),
      right:
        reading || learned || nothingToRead ? (
          <Primary onClick={() => go(next)}>{t("next")}</Primary>
        ) : (
          <>
            {skip(t("learn.skip"))}
            <Primary
              disabled={folders.list === null}
              onClick={() => void learn.start()}
            >
              {t("learn.read")}
            </Primary>
          </>
        ),
    };
  } else if (step === "you") {
    main = (
      <>
        <Heading
          title={t("you.title")}
          // Invited, this step comes first: nothing has been read yet to check.
          body={
            invited && learn.stage !== "done"
              ? t("you.bodyFirst")
              : t("you.body")
          }
        />
        <YouStep
          name={name}
          setName={setName}
          role={role}
          setRole={setRole}
          owns={owns}
          setOwns={setOwns}
          tools={tools}
          setTools={setTools}
          fromRecords={Boolean(about)}
          team={team}
          setTeam={(value) => {
            setTeam(value);
            setProblem(null);
          }}
          invite={invite}
          setInvite={setInvite}
          invited={invited}
          joined={office !== "alone"}
        />
      </>
    );
    bar = {
      guide: busy ? (
        <Guide busy>{t("guide.you")}</Guide>
      ) : (
        <Guide>{t("guide.you")}</Guide>
      ),
      right: (
        <>
          {skip()}
          <Primary
            busy={busy}
            disabled={
              busy ||
              (team !== "alone" && office === "alone" && !name.trim()) ||
              (team === "join" && office === "alone" && !invite.trim())
            }
            onClick={() => void saveYou()}
          >
            {team === "join" && office === "alone"
              ? t("you.joinGo")
              : team === "open" && office === "alone"
                ? t("you.openGo")
                : t("next")}
          </Primary>
        </>
      ),
    };
  } else {
    main = (
      <>
        <Heading title={t("ready.title")} body={t("ready.body")} />
        <ReadyStep
          name={name}
          role={role}
          owns={splitList(owns)}
          autonomy={autonomy}
          onAutonomy={chooseAutonomy}
          rows={[
            {
              label: t("ready.brain"),
              value: brain ? (
                brainLabel(brain, t("ready.claudeCode"))
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
              done: brainReady(brain),
              change: () => go("brain"),
            },
            {
              label: t("ready.learned"),
              value:
                learn.stage === "learning" ? (
                  <ShinyText text={t("ready.reading")} />
                ) : knowsCount > 0 ? (
                  t("ready.knows", { count: knowsCount })
                ) : (
                  t("ready.later")
                ),
              done: knowsCount > 0,
              change: knowsCount > 0 ? undefined : () => go("learn"),
            },
            {
              label: t("ready.office"),
              value: t(`ready.${office}`),
              done: office !== "alone",
              change: office === "alone" ? () => go("you") : undefined,
            },
          ]}
        />
      </>
    );
    bar = {
      guide: <Guide>{t("guide.ready")}</Guide>,
      right: (
        <Primary big busy={busy} disabled={busy} onClick={() => void finish()}>
          {t("ready.go")}
        </Primary>
      ),
    };
  }

  return (
    <div className="flex h-full min-h-0 flex-1 bg-background">
      <div
        className={cn(
          "flex h-full min-h-0 flex-col px-14 max-sm:px-5",
          wide ? "w-140 shrink-0" : "w-full",
        )}
      >
        <header className="flex h-18 shrink-0 items-center justify-between">
          <span className="text-[15px] font-semibold tracking-[-0.01em]">
            {APP_NAME}
          </span>
          <LanguageSwitch />
        </header>

        <main
          // Each step fits at the size it was drawn for; a smaller window scrolls rather than cuts.
          className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-12"
        >
          {step !== "hello" && <Stepper order={order} at={at} />}
          <div
            key={step}
            className="flex flex-col animate-in duration-500 fade-in slide-in-from-bottom-1"
          >
            {main}
            {problem && (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {problem === "not-invite-link"
                  ? t("you.notLink")
                  : problemText(problem)}
              </p>
            )}
          </div>
        </main>

        <footer className="flex h-28 shrink-0 items-center gap-2.5 pb-1.5">
          {step !== "hello" && (
            <button
              type="button"
              aria-label={t("back")}
              title={t("back")}
              onClick={() => go(at > 0 ? order[at - 1] : "hello")}
              className="-ml-2.5 grid size-10 shrink-0 place-items-center rounded-[10px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ArrowLeft className="size-4.5" />
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center">{bar.guide}</div>
          <div className="flex shrink-0 items-center gap-1">{bar.right}</div>
        </footer>
      </div>

      {wide && <OfficePane room={demo.room} beat={demo.beat} />}
    </div>
  );
}

/** The office playing the app's loop, framed beside the steps, with what it shows in a line. */
function OfficePane({
  room,
  beat,
}: {
  room: Parameters<typeof OfficeRoom>[0]["data"];
  beat: number;
}) {
  const t = useTranslations("start");
  const line = beat <= 0 ? null : t(`demo.beats.${Math.min(beat, 6)}` as never);
  return (
    <section
      aria-label={t("demo.example")}
      className="relative my-4 mr-4 min-w-0 flex-1 overflow-hidden rounded-2xl border border-foreground/8 bg-background"
    >
      <OfficeRoom full data={room} className="of-demo" />
      <span className="pointer-events-none absolute top-4 left-5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-muted-foreground/70" />
        {t("demo.example")}
      </span>
      <div
        aria-live="polite"
        className="pointer-events-none absolute bottom-5 left-5 flex items-center gap-3 rounded-[10px] bg-background/95 py-2.5 pr-4 pl-3.5 shadow-[0_0_0_1px_var(--alpha-08),0_1px_2px_var(--alpha-05)] backdrop-blur"
      >
        <span className="flex gap-1" aria-hidden>
          {[1, 2, 3, 4, 5, 6].map((at) => (
            <span
              key={at}
              className={cn(
                "size-1.5 rounded-full transition-colors duration-300",
                at === beat ? "bg-foreground" : "bg-foreground/15",
              )}
            />
          ))}
        </span>
        {line && (
          <span
            key={beat}
            className="animate-in text-[13.5px] duration-500 fade-in"
          >
            {line}
          </span>
        )}
      </div>
    </section>
  );
}

/** The four steps by name: where the person is, what is done, what comes. */
function Stepper({ order, at }: { order: Step[]; at: number }) {
  const t = useTranslations("start");
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={t("title")}>
      {order.map((name, index) => (
        <li
          key={name}
          aria-current={index === at ? "step" : undefined}
          className="flex flex-col gap-2.5"
        >
          <span
            className={cn(
              "h-0.75 rounded-full transition-colors duration-300",
              index <= at ? "bg-foreground" : "bg-foreground/10",
            )}
          />
          <span
            className={cn(
              "flex items-center gap-1 text-[12.5px]",
              index === at
                ? "font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            {index < at && <Check className="size-3" strokeWidth={2.5} />}
            {t(`steps.${name}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="mt-7 text-[28px] leading-tight font-semibold tracking-[-0.022em] text-balance">
        {title}
      </h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </>
  );
}

/**
 * The clone's own line on the bar, after Thursday's: a brand dot that breathes, then what to do now.
 * While something runs, the words shine.
 */
function Guide({ children, busy }: { children: string; busy?: boolean }) {
  return (
    <p className="flex min-w-0 items-center gap-2.5 text-[13.5px] text-muted-foreground">
      <span className="relative flex size-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/45 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-brand" />
      </span>
      {busy ? (
        <ShinyText text={children} className="truncate" />
      ) : (
        <span className="truncate">{children}</span>
      )}
    </p>
  );
}

function Primary({
  children,
  onClick,
  disabled,
  busy,
  big,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  big?: boolean;
}) {
  return (
    <Button
      variant="brand"
      className={cn(
        "h-11 gap-2 rounded-[10px] pr-4 pl-5 text-[15px] font-semibold tracking-[-0.01em] shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_8px_18px_-8px_color-mix(in_oklab,var(--brand)_60%,transparent)] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
        big && "pl-5.5",
      )}
      disabled={disabled}
      loading={busy}
      onClick={onClick}
    >
      {children}
      {!busy && <ArrowRight className="size-4.5" />}
    </Button>
  );
}

function Ghost({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      className="h-11 rounded-[10px] px-3 text-sm font-normal text-muted-foreground"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** The first screen: what a clone is, what it does in three lines, and that it keeps to the AI already in use. */
function Hello() {
  const t = useTranslations("start.hello");
  const points = [
    ["learn", BookOpen],
    ["act", Send],
    ["ask", UserCheck],
  ] as const;
  return (
    <div className="flex flex-col pt-4">
      <h1 className="animate-in text-[40px] leading-[1.15] font-semibold tracking-[-0.03em] whitespace-pre-line duration-700 fade-in slide-in-from-bottom-2">
        {t("title")}
      </h1>
      <p className="mt-4 animate-in text-[15.5px] leading-relaxed text-muted-foreground delay-150 duration-700 fill-mode-backwards fade-in slide-in-from-bottom-2">
        {t("body")}
      </p>
      <ul className="mt-5 flex animate-in flex-col delay-300 duration-700 fill-mode-backwards fade-in">
        {points.map(([part, Icon], index) => (
          <li
            key={part}
            className={cn(
              "flex gap-3.5 py-3.5",
              index > 0 && "border-t border-border",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-[10px]",
                part === "ask"
                  ? "bg-waiting/8 text-waiting shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--waiting)_22%,transparent)]"
                  : "bg-muted",
              )}
            >
              <Icon className="size-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15.5px] font-semibold">
                {t(`points.${part}.title`)}
              </span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                {t(`points.${part}.body`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3.5 flex animate-in flex-col gap-2.5 rounded-xl bg-muted/50 p-3.5 delay-500 duration-700 fill-mode-backwards fade-in">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-sm font-semibold">{t("uses.title")}</span>
          <span className="text-xs text-muted-foreground">
            {t("uses.note")}
          </span>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {USED.map(([mark, label]) => (
            <li
              key={mark}
              className="flex h-7 items-center gap-1.5 rounded-[7px] bg-background px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--alpha-10)]"
            >
              <BrandMark id={mark} className="size-3.5" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Whether the brain just picked answers: checking, how fast it did, or what to do when it did not. */
function Answered({
  brain,
  probe,
  onAnyway,
}: {
  brain: BrainState;
  probe: {
    ok: boolean;
    seconds?: number;
    problem?: string;
    detail?: string;
  } | null;
  onAnyway: () => void;
}) {
  const t = useTranslations("start");
  const problemText = useProblem();
  const label = brainLabel(brain, t("ready.claudeCode"));
  if (!brainReady(brain)) return null;
  if (!probe)
    return (
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3">
        <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
        <span className="min-w-0">
          <ShinyText
            text={`${t("brain.probing")}…`}
            className="block text-sm font-medium"
          />
          <span className="block text-xs text-muted-foreground">
            {t("brain.probingNote")}
          </span>
        </span>
      </div>
    );
  if (probe.ok)
    return (
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3">
        <CircleCheck className="size-5 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {t("brain.answered")}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {t("brain.answeredIn", {
              model: label,
              seconds: (probe.seconds ?? 0).toFixed(1),
            })}
          </span>
        </span>
      </div>
    );
  return (
    <div
      role="alert"
      className="mt-3 flex flex-col gap-1.5 rounded-xl bg-waiting/6 px-4 py-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--waiting)_20%,transparent)]"
    >
      <p className="text-sm text-waiting">
        {problemText(probe.problem ?? "brain-no-answer")}
      </p>
      {probe.detail && (
        <p className="text-xs wrap-break-word text-muted-foreground">
          {probe.detail}
        </p>
      )}
      <button
        type="button"
        onClick={onAnyway}
        className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {t("brain.anyway")}
      </button>
    </div>
  );
}

/** What each way of paying for a model means, for someone who has never had to pick one. */
function BrainGuide() {
  const t = useTranslations("start.brain.guide");
  return (
    <div className="mt-8 flex flex-col gap-2.5">
      <span className="text-[13px] font-medium">{t("title")}</span>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13.5px] leading-snug">
        {(["plan", "key", "team", "local"] as const).map((kind) => (
          <div key={kind} className="contents">
            <dt className="font-medium">{t(`${kind}.title`)}</dt>
            <dd className="text-muted-foreground">{t(`${kind}.body`)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The folders the person worked in lately and what else they keep out, read once for the step. */
function useFolders() {
  const [list, setList] = useState<Folder[] | null>(null);
  const [others, setOthers] = useState<LeftOut[]>([]);
  const [excludes, setExcludes] = useState<string[]>([]);
  const load = useCallback(async () => {
    const data = await fetch("/api/me/sources", { headers: HEADERS })
      .then((r) => r.json())
      .catch(() => null);
    setList(data?.folders ?? []);
    setExcludes(data?.exclude ?? []);
    setOthers(data?.others ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (next: string[]) => {
    const response = await fetch("/api/me/sources", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ exclude: next }),
    }).catch(() => undefined);
    if (!response?.ok) return;
    setExcludes(next);
    await load();
  };
  return { list, others, excludes, save };
}

/** Letting it read: what it reads, keeps and never keeps, the folders to leave out, and the reading. */
function LearnStep({
  learn,
  lang,
  folders,
  nothingToRead,
  count,
}: {
  learn: ReturnType<typeof useLearn>;
  lang: string;
  folders: ReturnType<typeof useFolders>;
  nothingToRead: boolean;
  count: number;
}) {
  const t = useTranslations("start");
  const tRun = useTranslations("firstRun");
  const problemText = useProblem();
  const [bringing, setBringing] = useState(false);
  const reading = learn.stage === "learning";
  const done = learn.stage === "done" && learn.kept.length > 0;
  const plan = [
    ["read", ScanSearch],
    ["keep", Bookmark],
    ["skip", EyeOff],
  ] as const;
  // The tools whose records are on this computer, from the folders they worked in with each.
  const found = [
    ...new Set((folders.list ?? []).flatMap((folder) => folder.tools ?? [])),
  ].filter((tool) => TOOL_MARKS[tool]);

  const bring = (
    <Dialog open={bringing} onOpenChange={setBringing}>
      <DialogContent className="max-h-[min(44rem,calc(100vh-3rem))] gap-3 overflow-y-auto p-6 sm:max-w-xl">
        <DialogTitle className="text-lg font-semibold">
          {t("learn.bringTitle")}
        </DialogTitle>
        <BringFromAnotherAi lang={lang} onDone={() => setBringing(false)} />
      </DialogContent>
    </Dialog>
  );

  if (nothingToRead && !reading && !done)
    return (
      <div className="mt-6 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("learn.none")}</p>
        <BringFromAnotherAi lang={lang} onDone={() => {}} />
      </div>
    );

  if (reading)
    return (
      <>
        <div className="mt-7 flex flex-col gap-3.5 rounded-xl bg-muted/50 p-4">
          <div className="flex items-center gap-3">
            <Bot size={34} mood="working" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                <ShinyText
                  text={
                    learn.progress
                      ? learn.progress.phase === "read" &&
                        learn.progress.source &&
                        tRun.has(`source.${learn.progress.source}` as never)
                        ? tRun(`source.${learn.progress.source}` as never)
                        : tRun(`phase.${learn.progress.phase}`)
                      : tRun("phase.index")
                  }
                />
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("learn.reading")}
              </span>
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {learn.progress?.percent ?? 0}%
            </span>
          </div>
          <span className="block h-1 overflow-hidden rounded-full bg-foreground/10">
            <span
              className="block h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${learn.progress?.percent ?? 0}%` }}
            />
          </span>
        </div>
        <ReadingList progress={learn.progress} />
        {learn.kept.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1 pl-1">
            {learn.kept.slice(-4).map((line) => (
              <li
                key={line}
                className="flex animate-in items-baseline gap-2.5 text-[13.5px] text-muted-foreground duration-500 fade-in"
              >
                <span className="size-1 shrink-0 -translate-y-0.5 rounded-full bg-foreground/40" />
                {line}
              </li>
            ))}
          </ul>
        )}
      </>
    );

  if (done)
    return (
      <>
        <Knowledge learn={learn} count={count} />
        {learn.example && (
          <div className="mt-7 flex animate-in flex-col gap-3 duration-500 fade-in">
            <div className="flex max-w-[86%] items-start gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted">
                <UserRound className="size-3.5 text-muted-foreground" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">
                  {t("learn.example")}
                </span>
                <span className="mt-0.5 block text-[14.5px] leading-relaxed">
                  {learn.example.question}
                </span>
              </span>
            </div>
            <div className="flex max-w-[86%] flex-col items-end gap-1 self-end">
              <span className="text-xs text-muted-foreground">
                {t("learn.exampleAnswer")}
              </span>
              <span className="rounded-[14px] rounded-br-[4px] bg-muted px-3.5 py-2.5 text-[14.5px] leading-relaxed">
                {learn.example.answer}
              </span>
            </div>
          </div>
        )}
        {learn.problem && (
          <p className="mt-4 text-sm text-destructive">
            {problemText(learn.problem)}
          </p>
        )}
      </>
    );

  return (
    <>
      <ul className="mt-5 flex flex-col">
        {plan.map(([part, Icon], index) => (
          <li
            key={part}
            className={cn(
              "flex gap-3 py-3",
              index > 0 && "border-t border-border",
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span className="w-28 shrink-0 text-sm font-medium">
              {tRun(`plan.${part}.title`)}
            </span>
            <span className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
              {tRun(`plan.${part}.body`)}
            </span>
          </li>
        ))}
      </ul>
      {found.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[12.5px] text-muted-foreground">
            {t("learn.found")}
          </span>
          {found.map((tool) => (
            <span
              key={tool}
              className="flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 text-xs"
            >
              <BrandMark id={TOOL_MARKS[tool][0]} className="size-3" />
              {TOOL_MARKS[tool][1]}
            </span>
          ))}
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium">{t("learn.folders")}</span>
          {folders.list && (
            <span className="text-xs text-muted-foreground">
              {t("learn.foldersRecent", { count: folders.list.length })}
            </span>
          )}
        </span>
        <FolderPicker folders={folders} />
        <button
          type="button"
          onClick={() => setBringing(true)}
          className="mt-1 self-start text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("learn.bring")}
        </button>
      </div>
      {bring}
      {learn.problem && (
        <p className="mt-4 text-sm text-destructive">
          {problemText(learn.problem)}
        </p>
      )}
    </>
  );
}

/** What the reading goes through, each part ticked as it is read and the one being read turning. */
function ReadingList({
  progress,
}: {
  progress: ReturnType<typeof useLearn>["progress"];
}) {
  const t = useTranslations("start.learn.sources");
  const rows = [...SOURCES, "learn"] as const;
  const current =
    progress?.phase === "learn"
      ? rows.length - 1
      : progress?.phase === "read" && progress.source
        ? SOURCES.indexOf(progress.source as (typeof SOURCES)[number])
        : -1;
  return (
    <ul className="mt-4 flex flex-col pl-1">
      {rows.map((row, index) => (
        <li key={row} className="flex h-7.5 items-center gap-2.5 text-sm">
          {index < current ? (
            <Check className="size-4 shrink-0" strokeWidth={2.25} />
          ) : index === current ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <span className="grid size-4 shrink-0 place-items-center">
              <span className="size-1.5 rounded-full bg-foreground/20" />
            </span>
          )}
          {index === current ? (
            <ShinyText text={t(row)} />
          ) : (
            <span className={index < current ? "" : "text-muted-foreground"}>
              {t(row)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Everything the reading learned, by where it went: their work, what they are on, how they work. */
function Knowledge({
  learn,
  count,
}: {
  learn: ReturnType<typeof useLearn>;
  count: number;
}) {
  const t = useTranslations("start.learn");
  const knows = learn.knows;
  const more = (left: number) =>
    left > 0 ? (
      <span className="text-[13px] text-muted-foreground">
        {t("knows.more", { count: left })}
      </span>
    ) : null;
  const rows: { label: string; body: ReactNode }[] = [];
  if (learn.about?.role)
    rows.push({
      label: t("knows.role"),
      body: (
        <span className="text-[14px]">
          {learn.about.role}
          {learn.about.owns.length > 0 && (
            <span className="text-muted-foreground">
              {" · "}
              {learn.about.owns.join(", ")}
            </span>
          )}
        </span>
      ),
    });
  if (knows?.projects.length)
    rows.push({
      label: t("knows.projects"),
      body: (
        <ul className="flex flex-col gap-1.5">
          {knows.projects.slice(0, 4).map((project) => (
            <li key={project.path} className="text-[14px] leading-snug">
              <span className="font-medium">{project.name}</span>
              {project.summary && (
                <span className="text-muted-foreground">
                  {" · "}
                  {project.summary}
                </span>
              )}
              {project.now && (
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  {project.now}
                </span>
              )}
            </li>
          ))}
          {more(knows.projects.length - 4)}
        </ul>
      ),
    });
  if (knows?.people.length)
    rows.push({
      label: t("knows.people"),
      body: (
        <ul className="flex flex-col gap-1">
          {knows.people.slice(0, 4).map((person) => (
            <li key={person.path} className="text-[14px] leading-snug">
              <span className="font-medium">{person.name}</span>
              {person.summary && (
                <span className="text-muted-foreground">
                  {" · "}
                  {person.summary}
                </span>
              )}
            </li>
          ))}
          {more(knows.people.length - 4)}
        </ul>
      ),
    });
  if (knows?.work.length)
    rows.push({
      label: t("knows.work"),
      body: <Lines lines={knows.work} more={more} />,
    });
  for (const kind of ["work", "decide", "voice"] as const) {
    const lines = (knows?.user ?? [])
      .filter((trait) => trait.kind === kind)
      .map((trait) => trait.text);
    if (lines.length)
      rows.push({
        label: t(`knows.traits.${kind}`),
        body: <Lines lines={lines} more={more} />,
      });
  }
  // A reading from before it learned this broadly kept only lines about them.
  if (!knows)
    rows.push({
      label: t("knows.traits.work"),
      body: <Lines lines={learn.kept} more={more} />,
    });

  return (
    <div className="mt-6 flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium">{t("understood")}</span>
        <span className="text-xs text-muted-foreground">
          {t("knows.saved", { count })}
        </span>
      </span>
      <div className="flex flex-col">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={cn(
              "flex animate-in gap-4 py-2.5 duration-500 fade-in",
              index > 0 && "border-t border-border",
            )}
          >
            <span className="w-24 shrink-0 pt-px text-[13px] text-muted-foreground">
              {row.label}
            </span>
            <div className="min-w-0 flex-1">{row.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Lines({
  lines,
  more,
}: {
  lines: string[];
  more: (left: number) => ReactNode;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {lines.slice(0, 4).map((line) => (
        <li
          key={line}
          className="flex items-baseline gap-2 text-[14px] leading-relaxed"
        >
          <span className="size-1 shrink-0 -translate-y-0.5 rounded-full bg-foreground" />
          {line}
        </li>
      ))}
      {more(lines.length - 4)}
    </ul>
  );
}

/** The folders to leave out as one field; pressing it opens them all in a dialog, with a search. */
function FolderPicker({ folders }: { folders: ReturnType<typeof useFolders> }) {
  const t = useTranslations("start.learn");
  const tRun = useTranslations("firstRun");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [path, setPath] = useState("");
  const { list, others, excludes, save } = folders;
  const out = [
    ...(list ?? []).filter((folder) => folder.excluded).map((f) => f.name),
    ...others.map((other) => other.name),
  ];
  const needle = query.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (folder) =>
      !needle ||
      folder.name.toLowerCase().includes(needle) ||
      folder.path.toLowerCase().includes(needle),
  );
  const toggle = (folder: Folder) =>
    void save(
      folder.excluded
        ? excludes.filter((p) => p !== folder.path)
        : [...excludes, folder.path],
    );

  return (
    <>
      <button
        type="button"
        disabled={list === null}
        onClick={() => setOpen(true)}
        className="flex h-11 w-full min-w-0 items-center gap-2.5 rounded-[10px] bg-background px-3.5 text-left text-[14.5px] ring-1 ring-foreground/15 outline-none ring-inset transition-shadow hover:ring-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
        {out.length === 0 ? (
          <span className="flex-1 text-muted-foreground">
            {t("foldersNone")}
          </span>
        ) : (
          <>
            <span className="shrink-0 font-medium">
              {t("foldersSome", { count: out.length })}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {out.join(", ")}
            </span>
          </>
        )}
        <span className="shrink-0 text-[13px] text-muted-foreground">
          {t("pick")}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="flex flex-col gap-1 px-6 pt-5.5 pb-3.5">
            <DialogTitle className="text-lg font-semibold tracking-[-0.01em]">
              {t("folders")}
            </DialogTitle>
            <DialogDescription className="pr-6 text-[13.5px] leading-relaxed">
              {t("foldersNote")}
            </DialogDescription>
          </div>
          <div className="relative px-6 pb-2.5">
            <Search className="pointer-events-none absolute top-1/2 left-9 size-4 -translate-y-[calc(50%+5px)] text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              spellCheck={false}
              aria-label={t("foldersSearch")}
              placeholder={t("foldersSearch")}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 pl-9"
            />
          </div>
          <ul className="flex max-h-[min(24rem,50vh)] flex-col gap-0.5 overflow-y-auto px-3 pb-3">
            {shown.map((folder) => {
              // Kept out by a name pattern rather than by itself: the pattern's row brings it back.
              const byPattern =
                folder.excluded && !excludes.includes(folder.path);
              return (
                <li key={folder.path}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={folder.excluded}
                    disabled={byPattern}
                    onClick={() => toggle(folder)}
                    className={cn(
                      "flex w-full items-center gap-3.5 rounded-[10px] px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:opacity-60",
                      folder.excluded && "bg-muted/50",
                    )}
                  >
                    <Tick on={folder.excluded} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">
                        {folder.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {folder.path}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {(folder.tools ?? [])
                        .filter((tool) => TOOL_MARKS[tool])
                        .map((tool) => (
                          <BrandMark
                            key={tool}
                            id={TOOL_MARKS[tool][0]}
                            className="size-3.5"
                          />
                        ))}
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {tRun("sessions", { count: folder.sessions })}
                    </span>
                  </button>
                </li>
              );
            })}
            {!needle &&
              others.map((other) => (
                <li key={other.pattern}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked
                    title={other.pattern}
                    onClick={() =>
                      void save(excludes.filter((p) => p !== other.pattern))
                    }
                    className="flex w-full items-center gap-3.5 rounded-[10px] bg-muted/50 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                  >
                    <Tick on />
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                      {other.pattern}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          <form
            className="flex items-center gap-2.5 border-t border-border bg-muted/40 px-6 py-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              const pattern = path.trim();
              if (!pattern || excludes.includes(pattern)) return;
              void save([...excludes, pattern]).then(() => setPath(""));
            }}
          >
            <Input
              value={path}
              spellCheck={false}
              aria-label={t("foldersPath")}
              placeholder={t("foldersPath")}
              onChange={(event) => setPath(event.target.value)}
              className="h-10 flex-1 bg-background"
            />
            {path.trim() ? (
              <Button type="submit" variant="outline" className="h-10 px-3.5">
                {tRun("leaveOut")}
              </Button>
            ) : (
              <DialogClose
                render={
                  <Button variant="brand" className="h-10 px-4.5">
                    {t("foldersDone")}
                  </Button>
                }
              />
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4.5 shrink-0 place-items-center rounded-[5px]",
        on
          ? "bg-foreground text-background"
          : "shadow-[inset_0_0_0_1.5px_var(--alpha-20)]",
      )}
    >
      {on && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

/** Who they are, filled in from the reading for them to correct, and the team. */
function YouStep({
  name,
  setName,
  role,
  setRole,
  owns,
  setOwns,
  tools,
  setTools,
  fromRecords,
  team,
  setTeam,
  invite,
  setInvite,
  invited,
  joined,
}: {
  name: string;
  setName: (value: string) => void;
  role: string;
  setRole: (value: string) => void;
  owns: string;
  setOwns: (value: string) => void;
  tools: string[];
  setTools: (value: string[]) => void;
  fromRecords: boolean;
  team: Team;
  setTeam: (value: Team) => void;
  invite: string;
  setInvite: (value: string) => void;
  invited: { from?: string } | null;
  joined: boolean;
}) {
  const t = useTranslations("start.you");
  const tOffice = useTranslations("office");
  const field = "flex min-w-0 flex-col gap-1.5";
  const caption = "flex items-baseline justify-between gap-3 text-[13px]";
  // Invited, the office they were asked to comes first and is picked already.
  const options: [Team, typeof Link2][] = invited
    ? [
        ["join", Users],
        ["alone", UserRound],
        ["open", Monitor],
      ]
    : [
        ["alone", UserRound],
        ["join", Link2],
        ["open", Monitor],
      ];
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-3 max-sm:grid-cols-1">
        <label className={field}>
          <span className={caption}>{t("name")}</span>
          <Input
            autoFocus
            value={name}
            maxLength={80}
            autoComplete="name"
            className="h-10"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={field}>
          <span className={caption}>{t("role")}</span>
          <Input
            value={role}
            maxLength={200}
            placeholder={t("rolePlaceholder")}
            className="h-10"
            onChange={(event) => setRole(event.target.value)}
          />
        </label>
        <label className={cn(field, "col-span-full")}>
          <span className={caption}>
            {tOffice("owns")}
            {fromRecords && (
              <span className="text-xs text-muted-foreground">
                {t("fromRecords")}
              </span>
            )}
          </span>
          <Input
            value={owns}
            maxLength={400}
            placeholder={tOffice("ownsPlaceholder")}
            className="h-10"
            onChange={(event) => setOwns(event.target.value)}
          />
        </label>
        <div className={cn(field, "col-span-full")}>
          <span className={caption}>{tOffice("tools")}</span>
          <Chips
            values={tools}
            onChange={setTools}
            label={tOffice("tools")}
            placeholder={
              tools.length ? t("toolsMore") : tOffice("toolsPlaceholder")
            }
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <span className="text-[13px] font-medium">{t("team")}</span>
        <div
          role="radiogroup"
          aria-label={t("team")}
          className="flex flex-col overflow-hidden rounded-xl ring-1 ring-foreground/12 ring-inset"
        >
          {options.map(([value, Icon], index) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={team === value}
              disabled={joined && team !== value}
              onClick={() => setTeam(value)}
              className={cn(
                "flex min-h-11 items-center gap-3 px-3.5 py-2.5 text-left text-sm outline-none transition-colors focus-visible:bg-muted disabled:opacity-50",
                index > 0 && "border-t border-border",
                team === value
                  ? "bg-muted/60 font-medium"
                  : "hover:bg-muted/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-4 shrink-0 rounded-full",
                  team === value
                    ? "border-[5px] border-foreground"
                    : "border-[1.5px] border-foreground/25",
                )}
              />
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              {value === "join" && invited ? (
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate">
                    {invited.from
                      ? t("invitedOffice", { from: invited.from })
                      : t("invitedOfficeNobody")}
                  </span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    {t("invitedTag")}
                  </span>
                </span>
              ) : (
                t(value === "open" ? "open" : value)
              )}
            </button>
          ))}
        </div>
        {/* One place below for what the choice needs, the same height whatever is picked. */}
        <div className="flex min-h-16 flex-col justify-center gap-1.5">
          {team === "join" && !invited ? (
            <>
              <div className="relative">
                <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  spellCheck={false}
                  value={invite}
                  placeholder={t("link")}
                  aria-label={t("link")}
                  className="h-10 pl-9 font-mono text-[13px]"
                  onChange={(event) => setInvite(event.target.value)}
                />
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {t("joinNote")}
              </p>
            </>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {team === "join" && invited
                ? invited.from
                  ? t("invited", { from: invited.from })
                  : t("invitedNobody")
                : t(`${team}Note`)}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** A short list typed as chips: Enter or a comma adds one, × or Backspace takes one back. */
function Chips({
  values,
  onChange,
  label,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  label: string;
  placeholder: string;
}) {
  const [typed, setTyped] = useState("");
  const add = (text: string) => {
    const next = splitList(text).filter((item) => !values.includes(item));
    if (next.length) onChange([...values, ...next].slice(0, 20));
    setTyped("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[10px] px-2 py-1.5 ring-1 ring-input ring-inset focus-within:ring-3 focus-within:ring-ring/50">
      {values.map((value) => (
        <span
          key={value}
          className="flex h-6.5 items-center gap-1 rounded-[7px] bg-muted pr-1 pl-2 text-[13px]"
        >
          {value}
          <button
            type="button"
            aria-label={`${value} ×`}
            onClick={() => onChange(values.filter((item) => item !== value))}
            className="grid size-4 place-items-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={typed}
        aria-label={label}
        placeholder={placeholder}
        maxLength={80}
        onChange={(event) => {
          const text = event.target.value;
          if (/[,，、]/.test(text)) add(text);
          else setTyped(text);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(typed);
          } else if (event.key === "Backspace" && !typed && values.length)
            onChange(values.slice(0, -1));
        }}
        onBlur={() => typed.trim() && add(typed)}
        className="h-6.5 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

/** Done: the card colleagues will see, how much it may do alone, and each part with a way back. */
function ReadyStep({
  name,
  role,
  owns,
  autonomy,
  onAutonomy,
  rows,
}: {
  name: string;
  role: string;
  owns: string[];
  autonomy: Autonomy;
  onAutonomy: (value: Autonomy) => void;
  rows: {
    label: string;
    value: ReactNode;
    done: boolean;
    change?: () => void;
  }[];
}) {
  const t = useTranslations("start");
  const tModes = useTranslations("settings.preferences.modes");
  return (
    <>
      <div className="mt-6 flex flex-col gap-3.5 rounded-[14px] p-4.5 shadow-[inset_0_0_0_1px_var(--alpha-12),0_1px_2px_var(--alpha-05)]">
        <div className="flex items-center gap-3.5">
          <LogoMark className="size-10" />
          <span className="min-w-0">
            <span
              className={cn(
                "block truncate text-base font-semibold tracking-[-0.01em]",
                !name.trim() && "text-muted-foreground",
              )}
            >
              {name.trim() || t("you.name")}
            </span>
            {role.trim() && (
              <span className="block truncate text-[13.5px] text-muted-foreground">
                {role}
              </span>
            )}
          </span>
        </div>
        {owns.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {owns.map((item) => (
              <span
                key={item}
                className="flex h-6.5 items-center rounded-[7px] px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--alpha-12)]"
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium">{t("ready.mode")}</span>
          <span className="text-xs text-muted-foreground">
            {t("ready.modeNote")}
          </span>
        </span>
        <Segmented<Autonomy>
          aria-label={t("ready.mode")}
          className="w-full *:flex-1"
          value={autonomy}
          onChange={onAutonomy}
          options={(["ask", "reads", "auto"] as const).map((value) => ({
            value,
            label: tModes(`${value}.title`),
          }))}
        />
        <p className="min-h-11 px-0.5 text-[13px] leading-relaxed text-muted-foreground">
          {tModes(`${autonomy}.body`)}
        </p>
      </div>

      <ul className="mt-3 flex flex-col">
        {rows.map((row, index) => (
          <li
            key={row.label}
            className={cn(
              "flex h-11 items-center gap-3",
              index > 0 && "border-t border-border",
            )}
          >
            {row.done ? (
              <Check className="size-4 shrink-0" strokeWidth={2.25} />
            ) : (
              <span className="grid size-4 shrink-0 place-items-center">
                <span className="size-1.5 rounded-full bg-foreground/25" />
              </span>
            )}
            <span className="w-24 shrink-0 text-[13.5px] text-muted-foreground">
              {row.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{row.value}</span>
            {row.change && (
              <button
                type="button"
                onClick={row.change}
                className="shrink-0 text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t("ready.change")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
