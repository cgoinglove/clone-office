"use client";

// The first time with Clone Office (/start), after Thursday's first run: it opens on what the app is,
// beside the office itself playing the app's one loop (demo.ts), then one thing a screen: what the
// clone thinks with, letting it learn the person's work, who they are and whether a team is in it,
// and their office. Someone invited to an office joins it first, so their team's models are there
// to pick. No step holds anyone: each can be passed and done later in Settings.
//
// The steps take one half of the window and what stands beside them the other: the office playing
// the app's loop, what the reading understood once it has (KnowledgePane), and the card colleagues
// will see while it is written. Every step stands in one frame: the name (with the clone's dot,
// after Thursday's brand dot) and the language on top, the steps beneath, the title in the same
// place each time, and at the bottom only Back and the step's button. A screen meant to be seen at
// once never grows because something was clicked: what is picked opens in a popover or a dialog at
// its field (`.claude/rules/taste.md`, No growing panes), and what is under way always shows it.

import {
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  EyeOff,
  Link2,
  Loader2,
  Monitor,
  ScanSearch,
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
import { ChoiceList } from "@/components/ui/choice-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  FolderField,
  type Folders,
  TOOL_MARKS,
  useFolders,
} from "../folder-list";
import { useLearn } from "../home/use-learn";
import { HEADERS } from "../home/use-office";
import { LanguageSwitch } from "../language-switch";
import type { Known } from "../learn/known";
import { ListField } from "../list-field";
import { parseInvite } from "../office/invite";
import { PROFILE_LIMITS } from "../profile-limits";
import { BringFromAnotherAi } from "../settings/clone-section";
import { AutonomyChoice } from "../settings/preferences-section";
import { type DemoWords, useDemoRoom } from "./demo";

type Step = "brain" | "learn" | "you" | "ready";
type Team = "alone" | "join" | "open";
type Autonomy = "ask" | "auto";

/** The steps in order; someone invited joins their office first, so its models are there to pick. */
const ORDER: Step[] = ["brain", "learn", "you", "ready"];
const INVITED_ORDER: Step[] = ["you", "brain", "learn", "ready"];

/**
 * The AI a person may already use, shown on the first screen: the clone thinks with their plan or
 * key (Claude Code, ChatGPT) and learns from the conversations kept on this computer (Claude Code,
 * Codex, Cursor, Hermes Agent).
 */
const USED: [MarkId, string][] = [
  ["claude", "Claude Code"],
  ["openai", "ChatGPT"],
  ["codex", "Codex"],
  ["cursor", "Cursor"],
  ["hermes", "Hermes"],
];

/** What the reading reads, in the order it reads them (learn/gather.ts SOURCE_ORDER). */
const SOURCES = ["notes", "places", "inputs", "commits", "work"] as const;

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
  // Kept as items: one may hold a comma ("Clone Office (the app, its repository)").
  const [owns, setOwns] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  // What the reading saw of their work fills in what they have not typed, for them to correct.
  const about = learn.about;
  useEffect(() => {
    if (!about) return;
    setName((was) => was || about.name || "");
    setRole((was) => was || about.role);
    setOwns((was) => (was.length ? was : about.owns));
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
        if (data?.autonomy === "auto") setAutonomy("auto");
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

  // While they write their card, and on the last step, the office stands still with their own clone
  // named after them.
  const calm = step === "you" || step === "ready";
  const yourName = calm ? name.trim() : "";
  const words = useMemo<DemoWords>(
    () => ({
      you: yourName || t("demo.you"),
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
    [t, yourName],
  );
  const demo = useDemoRoom(words, wide, calm);
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
    owns,
  });
  const saveProfile = () =>
    fetch("/api/me/profile", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        name: name.trim(),
        role: role.trim(),
        owns,
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
  // Everything it kept, as the cards beside the steps list it: the places on the map too.
  const knowsCount = knows
    ? knows.user.length +
      knows.work.length +
      knows.projects.length +
      knows.people.length +
      (knows.places?.length ?? 0)
    : learn.kept.length;

  const skip = (label = t("later")) => (
    <Ghost disabled={busy} onClick={() => go(next)}>
      {label}
    </Ghost>
  );

  // The card colleagues will see, as it stands: beside the steps while it is being written and
  // checked, else on the last step itself.
  const cardPreview = (
    <CardPreview name={name} role={role} owns={owns} tools={tools} />
  );

  let main: ReactNode = null;
  let right: ReactNode = null;
  // What Enter in one of the step's fields does: the step's own button, when it may be pressed.
  let submit: (() => void) | undefined;
  if (step === "hello") {
    main = <Hello />;
    submit = () => go(order[0]);
    right = (
      <Primary big onClick={() => go(order[0])}>
        {t("hello.go")}
      </Primary>
    );
  } else if (step === "brain") {
    main = (
      <>
        <Heading title={t("brain.title")} body={t("brain.body")} />
        <div className="mt-6 flex flex-col">
          <BrainPicker onChange={pickBrain} suggest />
          {brain?.chosen && (
            <Answered
              brain={brain}
              probe={answered}
              onAnyway={() => go(next)}
            />
          )}
        </div>
      </>
    );
    if (answered?.ok) submit = () => go(next);
    right = (
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
    );
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
          // Beside the steps, what it understood fills the office's place (KnowledgePane).
          listed={!wide}
        />
      </>
    );
    right =
      reading || learned || nothingToRead ? (
        <Primary onClick={() => go(next)}>{t("next")}</Primary>
      ) : (
        <>
          {skip()}
          <Primary
            disabled={folders.list === null}
            onClick={() => void learn.start()}
          >
            {t("learn.read")}
          </Primary>
        </>
      );
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
    const held =
      busy ||
      (team !== "alone" && office === "alone" && !name.trim()) ||
      (team === "join" && office === "alone" && !invite.trim());
    if (!held) submit = () => void saveYou();
    right = (
      <>
        {skip()}
        <Primary busy={busy} disabled={held} onClick={() => void saveYou()}>
          {team === "join" && office === "alone"
            ? t("you.joinGo")
            : team === "open" && office === "alone"
              ? t("you.openGo")
              : t("next")}
        </Primary>
      </>
    );
  } else {
    main = (
      <>
        <Heading title={t("ready.title")} body={t("ready.body")} />
        <ReadyStep
          card={
            wide ? null : (
              <CardPreview
                name={name}
                role={role}
                owns={owns}
                tools={tools}
                floating={false}
              />
            )
          }
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
    if (!busy) submit = () => void finish();
    right = (
      <Primary big busy={busy} disabled={busy} onClick={() => void finish()}>
        {t("ready.go")}
      </Primary>
    );
  }

  // What stands beside the steps: the office playing the app's loop, what the reading understood
  // once it has, and the card colleagues will see while it is written and checked.
  // The office stays drawn under what the reading understood, so coming back never draws it anew.
  const knowing = step === "learn" && learned;
  const pane = (
    <div className="relative my-4 mr-4 flex min-w-0 flex-1">
      <OfficePane
        hidden={knowing}
        room={demo.room}
        beat={demo.beat}
        card={calm ? cardPreview : null}
      />
      {knowing && <KnowledgePane learn={learn} count={knowsCount} />}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 bg-background">
      <div
        className={cn(
          "flex h-full min-h-0 flex-col",
          wide ? "w-1/2 shrink-0" : "w-full",
        )}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[34rem] flex-col px-8 max-sm:px-5">
          <header className="flex h-16 shrink-0 items-center justify-between">
            {/* The app's name with the clone's own dot beside it, after Thursday's brand dot: it
                pulses in place and never grows past itself. */}
            <span className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
              <span
                aria-hidden
                className="size-2 shrink-0 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
              />
              {APP_NAME}
            </span>
            <LanguageSwitch />
          </header>

          <main
            // Each step fits at the size it was drawn for; a smaller window scrolls rather than cuts.
            className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-5"
            onKeyDown={(event) => {
              // Enter in a field of the step itself (never in a popover over it, nor mid-composition
              // in a language typed through an input method) presses the step's button.
              if (
                event.key !== "Enter" ||
                event.defaultPrevented ||
                event.nativeEvent.isComposing ||
                !(event.target instanceof HTMLInputElement) ||
                !event.currentTarget.contains(event.target) ||
                !submit
              )
                return;
              event.preventDefault();
              submit();
            }}
          >
            {step !== "hello" && <Stepper order={order} at={at} />}
            <div
              key={step}
              // As tall as the room left, so the first screen can stand in its middle.
              className="flex flex-1 flex-col animate-in duration-500 fade-in slide-in-from-bottom-1"
            >
              {main}
              {problem && (
                <p
                  ref={(node) => node?.scrollIntoView({ block: "nearest" })}
                  className="mt-4 text-sm text-destructive"
                  role="alert"
                >
                  {problem === "not-invite-link"
                    ? t("you.notLink")
                    : problemText(problem)}
                </p>
              )}
            </div>
          </main>

          <footer className="flex h-19 shrink-0 items-center gap-1">
            {step !== "hello" && (
              <Ghost
                onClick={() => go(at > 0 ? order[at - 1] : "hello")}
                className="-ml-3 gap-1 pr-3.5 pl-2"
              >
                <ChevronLeft className="size-4.5" />
                {t("back")}
              </Ghost>
            )}
            <div className="flex flex-1 items-center justify-end gap-1">
              {right}
            </div>
          </footer>
        </div>
      </div>

      {wide && pane}
    </div>
  );
}

/** The office playing the app's loop, framed beside the steps, with what it shows in a line. */
function OfficePane({
  room,
  beat,
  card,
  hidden,
}: {
  room: Parameters<typeof OfficeRoom>[0]["data"];
  beat: number;
  /** Laid under another pane: kept, not drawn. */
  hidden: boolean;
  /** The person's own card, laid over the office in the place of the loop's caption. */
  card: ReactNode | null;
}) {
  const t = useTranslations("start");
  const line = beat <= 0 ? null : t(`demo.beats.${Math.min(beat, 6)}` as never);
  return (
    <section
      aria-label={t("demo.example")}
      hidden={hidden}
      // An example to watch: nothing in it takes the keyboard or a click.
      inert
      className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-foreground/8 bg-background"
    >
      {/* Still behind the card (their own clone named after them), it opens anew rather than
          finishing the loop's walks; an example opens with everyone already seated. */}
      <OfficeRoom
        key={card ? "still" : "playing"}
        full
        example
        data={room}
        className="of-demo"
      />
      <span className="pointer-events-none absolute top-3 left-3.5 flex items-center gap-2 rounded-md bg-background/90 px-1.5 py-0.5 text-xs text-muted-foreground backdrop-blur">
        <span className="size-1.5 rounded-full bg-muted-foreground/70" />
        {t("demo.example")}
      </span>
      {card ? (
        <div className="pointer-events-none absolute bottom-5 left-5 flex w-[min(22rem,calc(100%-2.5rem))] animate-in flex-col gap-2 duration-500 fade-in slide-in-from-bottom-1">
          <span className="self-start rounded-md bg-background/90 px-1.5 py-0.5 text-xs text-muted-foreground backdrop-blur">
            {t("you.cardSeen")}
          </span>
          {card}
        </div>
      ) : (
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
      )}
    </section>
  );
}

/** The card colleagues' clones will see and route by, as it stands. */
function CardPreview({
  name,
  role,
  owns,
  tools,
  floating = true,
}: {
  name: string;
  role: string;
  owns: string[];
  tools: string[];
  /** Laid over the office (a shadow, as what floats has), or standing in the steps (a hairline). */
  floating?: boolean;
}) {
  const tShell = useTranslations("shell");
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[14px] bg-background p-4",
        floating
          ? "shadow-[0_0_0_1px_var(--alpha-10),0_12px_32px_-16px_var(--alpha-20)]"
          : "shadow-[inset_0_0_0_1px_var(--alpha-12)]",
      )}
    >
      <div className="flex items-center gap-3">
        <LogoMark className="size-9" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">
            {name.trim() || tShell("screens.clone")}
          </span>
          {role.trim() && (
            <span className="block truncate text-[13px] text-muted-foreground">
              {role}
            </span>
          )}
        </span>
      </div>
      {owns.length + tools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {owns.slice(0, 4).map((item) => (
            <span
              key={item}
              className="flex h-6 max-w-full items-center rounded-[7px] px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--alpha-12)]"
            >
              <span className="truncate">{item}</span>
            </span>
          ))}
          {tools.slice(0, 4).map((item) => (
            <span
              key={item}
              className="flex h-6 max-w-full items-center rounded-[7px] bg-muted px-2 text-[12.5px] text-muted-foreground"
            >
              <span className="truncate">{item}</span>
            </span>
          ))}
        </div>
      )}
    </div>
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
          className="flex flex-col gap-2"
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
      <h1 className="mt-6 text-[26px] leading-tight font-semibold tracking-[-0.022em] text-balance">
        {title}
      </h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-pretty text-muted-foreground">
        {body}
      </p>
    </>
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
        "h-11 gap-1.5 pr-4.5 pl-6 text-[15px] font-semibold tracking-[-0.01em] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        big && "pl-6.5",
      )}
      disabled={disabled}
      loading={busy}
      onClick={onClick}
    >
      {children}
      {!busy && <ChevronRight className="size-4.5" />}
    </Button>
  );
}

function Ghost({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "h-11 rounded-[10px] px-3 text-sm font-normal text-muted-foreground",
        className,
      )}
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
    // In the middle of its half (its button below is never far), tighter on a short window.
    <div className="my-auto flex flex-col py-4 [@media(max-height:800px)]:py-0">
      <h1 className="animate-in text-[40px] leading-[1.15] font-semibold tracking-[-0.03em] whitespace-pre-line duration-700 fade-in slide-in-from-bottom-2 [@media(max-height:800px)]:text-[34px]">
        {t("title")}
      </h1>
      <p className="mt-4 animate-in text-[15.5px] leading-relaxed text-muted-foreground delay-150 duration-700 fill-mode-backwards fade-in slide-in-from-bottom-2">
        {t("body")}
      </p>
      <ul className="mt-7 flex animate-in flex-col gap-4.5 delay-300 duration-700 fill-mode-backwards fade-in [@media(max-height:800px)]:mt-5 [@media(max-height:800px)]:gap-3">
        {points.map(([part, Icon]) => (
          <li key={part} className="flex gap-3.5">
            {/* A feature list as Apple's welcome screens draw one: each mark in the one ink, no tile. */}
            <Icon className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0">
              <span className="block text-[15px] leading-6 font-semibold">
                {t(`points.${part}.title`)}
              </span>
              <span className="block text-sm leading-relaxed text-muted-foreground">
                {t(`points.${part}.body`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-7 flex animate-in flex-col gap-2 rounded-xl bg-foreground/[0.035] px-4 py-3.5 delay-500 duration-700 fill-mode-backwards fade-in [@media(max-height:800px)]:mt-5 [@media(max-height:800px)]:py-3">
        <span className="text-sm font-semibold">{t("uses.title")}</span>
        <span className="-mt-1 text-xs text-muted-foreground">
          {t("uses.note")}
        </span>
        <ul className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1.5">
          {USED.map(([mark, label]) => (
            <li
              key={mark}
              className="flex h-6 items-center gap-1.5 text-[13px]"
            >
              <BrandMark id={mark} className="size-3.5" />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 animate-in text-[13px] text-muted-foreground delay-700 duration-700 fill-mode-backwards fade-in [@media(max-height:800px)]:mt-3">
        {t("fine")}
      </p>
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

/** Letting it read: what it reads, keeps and never keeps, the folders it reads, and the reading. */
function LearnStep({
  learn,
  lang,
  folders,
  nothingToRead,
  count,
  listed,
}: {
  learn: ReturnType<typeof useLearn>;
  lang: string;
  folders: Folders;
  nothingToRead: boolean;
  count: number;
  /** What it understood is listed here (no room beside the steps for its own pane). */
  listed: boolean;
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
      </>
    );

  if (done)
    return (
      <>
        {listed && <Knowledge learn={learn} count={count} />}
        {learn.example && (
          <div className="mt-7 flex animate-in flex-col gap-2.5 break-keep duration-500 fade-in">
            <div className="flex max-w-[88%] items-start gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted">
                <UserRound className="size-3.5 text-muted-foreground" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">
                  {t("learn.example")}
                </span>
                <span className="mt-0.5 line-clamp-3 text-[14px] leading-relaxed">
                  {learn.example.question}
                </span>
              </span>
            </div>
            <div className="flex max-w-[88%] flex-col items-end gap-1 self-end">
              <span className="text-xs text-muted-foreground">
                {t("learn.exampleAnswer")}
              </span>
              {/* The lines are cut inside the bubble, so its padding never shows half a line. */}
              <span className="rounded-[14px] rounded-br-[4px] bg-muted px-3.5 py-2.5 text-[14px] leading-relaxed">
                <span className={listed ? "line-clamp-4" : "line-clamp-8"}>
                  {learn.example.answer}
                </span>
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
      <ul className="mt-6 flex flex-col gap-3 [@media(max-height:760px)]:mt-5 [@media(max-height:760px)]:gap-2">
        {plan.map(([part, Icon]) => (
          <li key={part} className="flex gap-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {/* What it is leads its line, the details after it in the line's own grey. */}
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
              <span className="mr-1.5 font-medium text-foreground">
                {tRun(`plan.${part}.title`)}
              </span>
              {tRun(`plan.${part}.body`)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-7 flex flex-col gap-2 [@media(max-height:760px)]:mt-5">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-[13px] font-medium">{t("learn.folders")}</span>
          <span className="text-xs text-muted-foreground">
            {t("learn.foldersHint")}
          </span>
        </span>
        <FolderField folders={folders} />
        {found.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            <span className="text-muted-foreground">{t("learn.found")}</span>
            {found.map((tool) => (
              <span key={tool} className="flex items-center gap-1.5">
                <BrandMark id={TOOL_MARKS[tool][0]} className="size-3.5" />
                {TOOL_MARKS[tool][1]}
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setBringing(true)}
          className="group -mx-2 mt-1 flex h-8 items-center gap-1 self-start rounded-lg px-2 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {t("learn.bring")}
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
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

/** One kind of thing the reading learned: its first lines shown, and all of them a press away. */
interface KnownRow {
  id: string;
  label: string;
  /** One line each, the first shown first, and how to take it back (none: it is edited elsewhere). */
  items: { title: string; detail?: string; note?: string; known?: Known }[];
}

/**
 * Everything the reading learned, one row a kind: what they do, what they are on, the people,
 * where their work lives, its surroundings, how they work.
 */
function useKnownRows(learn: ReturnType<typeof useLearn>): KnownRow[] {
  const t = useTranslations("start.learn");
  const knows = learn.knows;
  const rows: KnownRow[] = [];
  if (learn.about?.role)
    rows.push({
      id: "role",
      label: t("knows.role"),
      items: [{ title: learn.about.role, detail: learn.about.owns.join(", ") }],
    });
  if (knows?.projects.length)
    rows.push({
      id: "projects",
      label: t("knows.projects"),
      items: knows.projects.map((project) => ({
        title: project.name,
        detail: project.summary,
        note: [project.folder, project.now].filter(Boolean).join(" · "),
        known: { kind: "projects", path: project.path },
      })),
    });
  if (knows?.people.length)
    rows.push({
      id: "people",
      label: t("knows.people"),
      items: knows.people.map((person) => ({
        title: person.name,
        detail: person.summary,
        known: { kind: "people", path: person.path },
      })),
    });
  if (knows?.places?.length)
    rows.push({
      id: "places",
      label: t("knows.places"),
      items: knows.places.map((place) => ({
        title: place.path.split("/").filter(Boolean).at(-1) ?? place.path,
        detail: place.about,
        note: place.path,
        known: { kind: "places", path: place.path },
      })),
    });
  if (knows?.work.length)
    rows.push({
      id: "work",
      label: t("knows.work"),
      items: knows.work.map((line) => ({
        title: line,
        known: { kind: "work", text: line },
      })),
    });
  const traits = knows?.user ?? [];
  if (traits.length || !knows)
    rows.push({
      id: "traits",
      label: t("knows.traits.all"),
      items: knows
        ? traits.map((trait) => ({
            title: trait.text,
            note: t(`knows.traits.${trait.kind}`),
            known: { kind: "user", text: trait.text },
          }))
        : // A reading from before it learned this broadly kept only lines about them.
          learn.kept.map((line) => ({
            title: line,
            known: { kind: "user", text: line },
          })),
    });
  return rows;
}

/**
 * One kind's whole list, opened from its row or its card, each line with its × to take it back:
 * what the reading kept is the clone's guess until the person keeps it (a line of memory is
 * removed, a page set aside, a place taken off the map; learn/forget.ts).
 */
function KnownDialog({
  row,
  onClose,
  onForget,
}: {
  row: KnownRow | null;
  onClose: () => void;
  onForget: (known: Known) => Promise<boolean>;
}) {
  const t = useTranslations("start.learn");
  const [taking, setTaking] = useState<string | null>(null);
  return (
    <Dialog open={row !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="flex flex-col gap-1 px-6 pt-5.5 pb-3">
          <DialogTitle className="text-lg font-semibold tracking-[-0.01em]">
            {row?.label}
          </DialogTitle>
          <DialogDescription className="text-[13.5px]">
            {/* What they do is not taken back here: the next step is where they set it. */}
            {row?.items.some((item) => item.known)
              ? t("knows.where")
              : t("knows.whereRole")}
          </DialogDescription>
        </div>
        <ul className="flex max-h-[min(28rem,60vh)] flex-col gap-1 overflow-y-auto px-3 pt-1 pb-4">
          {row?.items.map((item) => {
            const key = `${item.title}${item.note ?? ""}`;
            return (
              <li
                key={key}
                className="group flex items-start gap-2 rounded-[10px] py-2 pr-1.5 pl-3 hover:bg-muted/50"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 break-keep">
                  <span className="text-[14.5px] leading-snug font-medium">
                    {item.title}
                  </span>
                  {item.detail && (
                    <span className="text-[13.5px] leading-relaxed text-muted-foreground">
                      {item.detail}
                    </span>
                  )}
                  {item.note && (
                    <span className="font-mono text-xs break-all text-muted-foreground">
                      {item.note}
                    </span>
                  )}
                </span>
                {item.known && (
                  <button
                    type="button"
                    disabled={taking === key}
                    aria-label={t("knows.forget", { item: item.title })}
                    title={t("knows.forget", { item: item.title })}
                    onClick={async () => {
                      if (!item.known) return;
                      setTaking(key);
                      await onForget(item.known);
                      setTaking(null);
                    }}
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                  >
                    {taking === key ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the reading understood, in the steps themselves when there is no room beside them: each kind
 * one line however much it holds, with how many and a chevron, so the step never grows.
 */
function Knowledge({
  learn,
  count,
}: {
  learn: ReturnType<typeof useLearn>;
  count: number;
}) {
  const t = useTranslations("start.learn");
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useKnownRows(learn);
  const open = rows.find((row) => row.id === openId) ?? null;
  return (
    <div className="mt-6 flex flex-col gap-2">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[13px] font-medium">{t("understood")}</span>
        <span className="text-xs text-muted-foreground">
          {t("knows.saved", { count })}
        </span>
      </span>
      <div className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setOpenId(row.id)}
            className="group -mx-2 flex h-10 animate-in items-center gap-3 rounded-[10px] px-2 text-left outline-none transition-colors duration-500 fade-in hover:bg-muted/60 focus-visible:bg-muted/60"
          >
            <span className="w-28 shrink-0 text-[13px] text-muted-foreground">
              {row.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px]">
              {row.items.map((item) => item.title).join(", ")}
            </span>
            {row.items.length > 1 && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground tabular-nums">
                {row.items.length}
              </span>
            )}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
          </button>
        ))}
      </div>
      <KnownDialog
        row={open}
        onClose={() => setOpenId(null)}
        onForget={learn.forget}
      />
    </div>
  );
}

/** How many lines of a kind its card shows before "and N more". */
const CARD_LINES = 3;

/**
 * What the reading understood, laid out in the office's place beside the steps once it is read: a
 * card a kind, its first lines shown and the rest a press away, so all of it is seen at once and the
 * steps themselves keep to what to do next.
 */
function KnowledgePane({
  learn,
  count,
}: {
  learn: ReturnType<typeof useLearn>;
  count: number;
}) {
  const t = useTranslations("start.learn");
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useKnownRows(learn);
  const open = rows.find((row) => row.id === openId) ?? null;
  return (
    <section
      aria-label={t("understood")}
      className="flex min-w-0 flex-1 animate-in flex-col overflow-hidden rounded-2xl border border-foreground/8 bg-background duration-500 fade-in"
    >
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-6 pt-5.5 pb-4">
        <h2 className="text-base font-semibold tracking-[-0.01em]">
          {t("understood")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("knows.saved", { count })}
        </span>
      </header>
      {/* A list, so it may scroll on a short window; at the size it was drawn for it fits. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="columns-2 gap-3 max-[1180px]:columns-1">
          {rows.map((row, index) => {
            const shown = row.items.slice(0, CARD_LINES);
            const more = row.items.length - shown.length;
            return (
              <div
                key={row.id}
                style={{ animationDelay: `${index * 60}ms` }}
                className="mb-3 flex animate-in break-inside-avoid flex-col gap-3 rounded-[14px] bg-foreground/[0.035] p-4 break-keep duration-500 fill-mode-backwards fade-in slide-in-from-bottom-1"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  className="group -m-1 flex items-center gap-2 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="text-[13px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                    {row.label}
                  </span>
                  {row.items.length > 1 && (
                    <span className="text-[12px] text-muted-foreground tabular-nums">
                      {row.items.length}
                    </span>
                  )}
                  <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </button>
                <ul className="flex flex-col gap-2.5">
                  {shown.map((item) => (
                    <li
                      key={`${item.title}${item.note ?? ""}`}
                      className="flex min-w-0 flex-col gap-0.5"
                    >
                      <span className="line-clamp-2 text-[14px] leading-snug font-medium">
                        {item.title}
                      </span>
                      {item.detail && (
                        <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                          {item.detail}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {more > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpenId(row.id)}
                    className="-mx-1 -mb-1 self-start rounded-lg px-1 py-0.5 text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {t("knows.more", { count: more })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <KnownDialog
        row={open}
        onClose={() => setOpenId(null)}
        onForget={learn.forget}
      />
    </section>
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
  owns: string[];
  setOwns: (value: string[]) => void;
  tools: string[];
  setTools: (value: string[]) => void;
  team: Team;
  setTeam: (value: Team) => void;
  invite: string;
  setInvite: (value: string) => void;
  invited: { from?: string } | null;
  joined: boolean;
}) {
  const t = useTranslations("start.you");
  const tOffice = useTranslations("office");
  // A link that is not an invite says so in its own field, as it is pasted.
  const notLink = Boolean(invite.trim()) && !parseInvite(invite);
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
      {/* Each field's name inside it, on its left, so the step reads as the card being filled in;
          a list is one line that opens its items (ListField), so nothing here grows. */}
      <div className="mt-5 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 max-sm:grid-cols-1">
        <Field label={t("name")}>
          <input
            autoFocus
            value={name}
            maxLength={80}
            autoComplete="name"
            // Opening or joining an office needs a name: the field says so, not only the button.
            placeholder={team !== "alone" ? t("nameNeeded") : undefined}
            className={FIELD_INPUT}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label={t("role")}>
          <input
            value={role}
            maxLength={PROFILE_LIMITS.role}
            placeholder={t("rolePlaceholder")}
            className={FIELD_INPUT}
            onChange={(event) => setRole(event.target.value)}
          />
        </Field>
        <ListField
          label={t("owns")}
          values={owns}
          onChange={setOwns}
          max={PROFILE_LIMITS.owns}
          maxItem={PROFILE_LIMITS.own}
          placeholder={tOffice("ownsPlaceholder")}
          className="col-span-full"
        />
        <ListField
          label={t("tools")}
          values={tools}
          onChange={setTools}
          max={PROFILE_LIMITS.tools}
          maxItem={PROFILE_LIMITS.tool}
          placeholder={tOffice("toolsPlaceholder")}
          className="col-span-full"
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <span className="text-[13px] font-medium">{t("team")}</span>
        {/* Each choice says what it means under its name, so they are compared before one is picked. */}
        <ChoiceList<Team>
          dense
          aria-label={t("team")}
          value={team}
          onChange={setTeam}
          options={options.map(([value, Icon]) => ({
            value,
            icon: Icon,
            disabled: joined && team !== value,
            title:
              value === "join" && invited
                ? invited.from
                  ? t("invitedOffice", { from: invited.from })
                  : t("invitedOfficeNobody")
                : t(value),
            body:
              value === "join" && invited
                ? t("invitedBody")
                : t(`${value}Note`),
            tag: value === "join" && invited ? t("invitedTag") : undefined,
          }))}
        />
        {/* The link goes in a place kept for it, so picking "join" never grows the step. */}
        <div className="min-h-10">
          {team === "join" && !invited && (
            <Field label={t("link")} invalid={notLink}>
              <input
                spellCheck={false}
                value={invite}
                aria-invalid={notLink || undefined}
                placeholder={t("linkPaste")}
                className={cn(
                  FIELD_INPUT,
                  "font-mono text-[13px] placeholder:font-sans",
                )}
                onChange={(event) => setInvite(event.target.value)}
              />
              {notLink && (
                <span className="shrink-0 text-xs text-destructive">
                  {t("notLinkShort")}
                </span>
              )}
            </Field>
          )}
        </div>
      </div>
    </>
  );
}

/** What a field's own input looks like inside it. */
const FIELD_INPUT =
  "h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/80";

/** A field with its name inside it on the left, as one ring around both. */
function Field({
  label,
  children,
  className,
  invalid,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  invalid?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-h-10 min-w-0 items-center gap-3 rounded-[10px] pr-2.5 pl-3 ring-1 ring-input ring-inset transition-shadow focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "ring-destructive/60 focus-within:ring-destructive/30",
        className,
      )}
    >
      <span className="shrink-0 text-[13px] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Done: how much it may do alone, and each part with a way back; the card colleagues will see is
 * beside the steps (OfficePane), or here when there is no room for it there.
 */
function ReadyStep({
  card,
  autonomy,
  onAutonomy,
  rows,
}: {
  card: ReactNode | null;
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
  return (
    <>
      {card && <div className="mt-6">{card}</div>}

      <div className="mt-6 flex flex-col gap-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-[13px] font-medium">{t("ready.mode")}</span>
          <span className="text-xs text-muted-foreground">
            {t("ready.modeNote")}
          </span>
        </span>
        <AutonomyChoice value={autonomy} onChange={onAutonomy} />
      </div>

      {/* Each part as it stands; one not done yet opens its step again, a chevron on its row. */}
      <ul className="mt-4 flex flex-col gap-0.5">
        {rows.map((row) => {
          const line = (
            <>
              {row.done ? (
                <Check className="size-4 shrink-0" strokeWidth={2.25} />
              ) : (
                <span className="grid size-4 shrink-0 place-items-center">
                  <span className="size-1.5 rounded-full bg-foreground/25" />
                </span>
              )}
              <span className="w-28 shrink-0 text-[13.5px] text-muted-foreground">
                {row.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.value}
              </span>
            </>
          );
          return (
            <li key={row.label}>
              {row.change ? (
                <button
                  type="button"
                  onClick={row.change}
                  aria-label={`${row.label} · ${t("ready.change")}`}
                  className="group -mx-2 flex h-10 w-[calc(100%+1rem)] items-center gap-3 rounded-[10px] px-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {line}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </button>
              ) : (
                <div className="flex h-10 items-center gap-3">{line}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
