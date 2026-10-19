"use client";

// Your clone › What it knows (10-19 redesign, two columns): who the person is to their clone (what
// they do, look after and work in, read as their card is and corrected in place), what it remembers
// about them exactly as kept (each line correctable or removable, with where it came from), and
// beside them its notes, its skills and the office's (skills-section.tsx), reading their records
// again or bringing what their usual AI remembers; starting over at the foot.

import {
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCopy,
  Download,
  Folder,
  Globe,
  Hash,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ShinyText } from "@/components/ui/shiny-text";
import { Textarea } from "@/components/ui/textarea";
import { say } from "@/components/ui/toast";
import { Tip } from "@/components/ui/tooltip";
import { BrandMark } from "@/features/brand/brand-mark";
import { markOf } from "@/features/brand/tool-mark";
import { useUndoableRemoval } from "@/hooks/use-undoable-removal";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { Learn } from "../home/use-learn";
import { HEADERS, type OfficeState, type Profile } from "../home/use-office";
import { EXPORT_PROMPT } from "../learn/export-prompt";
import { ListField } from "../list-field";
import { PROFILE_LIMITS } from "../profile-limits";
import { stream } from "../stream";
import { Empty } from "./parts";
import { SkillsSection } from "./skills-section";

/** Where a line came from (memory/store.ts Source), as the route words it. */
interface Source {
  from: string;
  at: string;
  title?: string;
}

interface NotePage {
  path: string;
  title: string;
  summary: string;
  updated: string;
}

interface Memory {
  user: string[];
  memory: string[];
  sources?: { user: Record<string, Source>; memory: Record<string, Source> };
  skills: number;
  notes: number;
  pages?: NotePage[];
  dir: string;
}

type Entry = { target: "user" | "memory"; text: string };

export function CloneSection({
  lang,
  learn,
  profile,
  onProfile,
  office,
}: {
  lang: string;
  learn: Learn;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  office: OfficeState;
}) {
  const t = useTranslations("settings.clone");
  const problemText = useProblem();
  const router = useRouter();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const loadMemory = useCallback(
    () =>
      fetch("/api/me/memory", { headers: HEADERS })
        .then((r) => r.json())
        .then((data: Memory) => setMemory(data))
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);
  // A reading or an import that ends while this is open shows what it kept.
  useEffect(() => {
    if (learn.stage === "done") void loadMemory();
  }, [learn.stage, loadMemory]);

  const entries: Entry[] = memory
    ? [
        ...memory.user.map((text) => ({ target: "user" as const, text })),
        ...memory.memory.map((text) => ({ target: "memory" as const, text })),
      ]
    : [];

  const fix = async (entry: Entry, fixed: string) => {
    setProblem(null);
    try {
      await stream(
        "/api/me/fix",
        { line: entry.text, fix: fixed, locale: lang },
        (event) => {
          if (event.type === "error")
            setProblem(String(event.code ?? event.message));
        },
      );
    } catch (error) {
      setProblem((error as Error).message);
    }
    await loadMemory();
  };

  // A removed line is hidden at once, the count and the numbers following, and removed when its
  // Undo runs out or this screen goes; it is back if that fails or is undone.
  const words = useTranslations();
  const removal = useUndoableRemoval(words("common.undo"));
  const keyOf = (entry: Entry) => `${entry.target}-${entry.text}`;
  const shown = entries.filter((entry) => !removal.hidden.has(keyOf(entry)));
  const remove = async (entry: Entry): Promise<boolean> => {
    const response = await fetch("/api/me/memory", {
      method: "POST",
      headers: HEADERS,
      // kept alive so a removal done as the page goes still arrives
      keepalive: true,
      body: JSON.stringify({
        remove: { target: entry.target, entry: entry.text },
      }),
    }).catch(() => undefined);
    const data = await response?.json().catch(() => ({}));
    if (response?.ok) setMemory(data as Memory);
    else setProblem(String(data?.error ?? response?.status ?? "generic"));
    return Boolean(response?.ok);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-9 gap-y-8 text-sm lg:grid-cols-[minmax(0,1fr)_21.5rem]">
      <div className="flex min-w-0 flex-col gap-8">
        <AboutYou
          profile={profile}
          onProfile={onProfile}
          office={office}
          lang={lang}
        />

        <section className="flex flex-col gap-2.5">
          <Head
            title={t("remembers")}
            meta={
              memory ? t("remembersMeta", { count: shown.length }) : undefined
            }
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  router.push(
                    `/chat?say=${encodeURIComponent(t("teachStarter"))}`,
                  )
                }
              >
                <Plus />
                {t("add")}
              </Button>
            }
          />
          {!memory ? (
            <ShinyText className="text-sm" text={t("loading")} />
          ) : shown.length === 0 ? (
            <Empty icon={<BookOpen className="size-5" />}>
              {t("nothingYet")}
            </Empty>
          ) : (
            <ul className="-mx-3 flex flex-col gap-0.5">
              {shown.map((entry) => (
                <MemoryRow
                  key={keyOf(entry)}
                  entry={entry}
                  source={memory.sources?.[entry.target]?.[entry.text]}
                  fresh={learn.kept.includes(entry.text)}
                  onFix={(fixed) => fix(entry, fixed)}
                  onRemove={() =>
                    removal.remove(keyOf(entry), words("memory.removed"), {
                      commit: () => remove(entry),
                    })
                  }
                />
              ))}
            </ul>
          )}
          {problem && (
            <p className="text-destructive">{problemText(problem)}</p>
          )}
        </section>

        <StartOver />
      </div>

      <aside className="flex min-w-0 flex-col gap-3.5">
        <NotesCard pages={memory?.pages} />
        <SkillsSection />
        <div className="flex flex-col gap-3 rounded-[14px] bg-foreground/[0.035] p-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-[14px] font-semibold">{t("learnMore")}</h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {t("learnMoreHint")}
            </p>
          </div>
          <ReadAgain learn={learn} />
          <BringFromAnotherAi
            lang={lang}
            frame="plain"
            onDone={() => void loadMemory()}
          />
        </div>
        {memory && (
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            {t("where", { dir: memory.dir })}
          </p>
        )}
      </aside>
    </div>
  );
}

/** A part's heading on the clone's screen: its name, a dim line beside it, a quiet action at the end. */
function Head({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center gap-2.5">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {meta && (
        <span className="truncate text-[13px] text-muted-foreground">
          {meta}
        </span>
      )}
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}

const NOTE_KINDS = ["people", "projects", "topics"] as const;
/** The page of where the work lives (memory/notes.ts `WORK_MAP`), named apart from the topics. */
const WORK_MAP = "topics/where-work-lives";

/**
 * The clone's note pages, by kind: a row each with how many, opening the names and what each is
 * about. The map of where the work lives is a row of its own.
 */
function NotesCard({ pages }: { pages?: NotePage[] }) {
  const t = useTranslations("settings.clone.notes");
  const [open, setOpen] = useState<string | null>(null);
  if (!pages) return null;
  const map = pages.find((page) => page.path === WORK_MAP);
  const groups = [
    ...NOTE_KINDS.map((kind) => ({
      key: kind as string,
      icon: kind === "people" ? Users : kind === "projects" ? Folder : Hash,
      list: pages.filter(
        (page) => page.path.startsWith(`${kind}/`) && page !== map,
      ),
    })),
    ...(map ? [{ key: "map", icon: Globe, list: [map] }] : []),
  ].filter((group) => group.list.length > 0);
  return (
    <section className="flex flex-col rounded-[14px] bg-background px-4 py-3.5 shadow-[0_0_0_1px_var(--alpha-10)]">
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="flex-1 text-[14px] font-semibold">{t("title")}</h3>
        <span className="text-xs text-muted-foreground">{t("hint")}</span>
      </div>
      {groups.length === 0 ? (
        <p className="py-1 text-[13px] text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {groups.map(({ key, icon: Icon, list }) => {
            const shown = open === key;
            return (
              <li key={key} className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={shown}
                  onClick={() => setOpen(shown ? null : key)}
                  className="flex h-9 items-center gap-2.5 rounded-lg px-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-[13.5px]">
                    {t(key as never)}
                  </span>
                  {key !== "map" && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {list.length}
                    </span>
                  )}
                  <ChevronRight
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
                      shown && "rotate-90",
                    )}
                  />
                </button>
                {shown && (
                  <ul className="mb-1 ml-8 flex flex-col gap-1.5 py-1 pr-2">
                    {list.slice(0, 20).map((page) => (
                      <li key={page.path} className="flex flex-col">
                        <span className="text-[13px] font-medium">
                          {page.title}
                        </span>
                        {page.summary && (
                          <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {page.summary}
                          </span>
                        )}
                      </li>
                    ))}
                    {list.length > 20 && (
                      <li className="text-xs text-muted-foreground">
                        {t("more", { count: list.length - 20 })}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** What to call the person and what they do: their card's lines, and their desk's name alone. */
function AboutYou({
  profile,
  onProfile,
  office,
  lang,
}: {
  profile: Profile;
  onProfile: (profile: Profile) => void;
  office: OfficeState;
  lang: string;
}) {
  const t = useTranslations("settings.clone");
  const tOffice = useTranslations("office");
  const common = useTranslations("common");
  const card = office.office?.joined ? office.office.me?.card : undefined;
  const [name, setName] = useState(card?.name ?? profile.name ?? "");
  const [role, setRole] = useState(card?.description || profile.role || "");
  // Kept as items, never as text split on commas: an item may hold one (list-field.tsx).
  const ownsNow = card?.owns ?? profile.owns ?? [];
  const toolsNow = profile.tools ?? [];
  const ownsKey = JSON.stringify(ownsNow);
  const toolsKey = JSON.stringify(toolsNow);
  const [owns, setOwns] = useState<string[]>(ownsNow);
  const [tools, setTools] = useState<string[]>(toolsNow);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // read as the card is; corrected in place (nothing written yet opens it to write)
  const empty = !role.trim() && owns.length === 0 && tools.length === 0;
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setName(card?.name ?? profile.name ?? "");
    setRole(card?.description || profile.role || "");
    setOwns(JSON.parse(ownsKey));
    setTools(JSON.parse(toolsKey));
  }, [
    card?.name,
    card?.description,
    profile.name,
    profile.role,
    ownsKey,
    toolsKey,
  ]);
  const changed =
    name.trim() !== (card?.name ?? profile.name ?? "") ||
    role.trim() !== (card?.description || profile.role || "") ||
    JSON.stringify(owns) !== ownsKey ||
    JSON.stringify(tools) !== toolsKey;

  const draft = async () => {
    setDrafting(true);
    try {
      const response = await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "draft", locale: lang }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      if (typeof data.description === "string") setRole(data.description);
      // A draft fills in only what is still empty: what they typed stays theirs.
      if (Array.isArray(data.owns))
        setOwns((was) => (was.length ? was : data.owns));
      if (Array.isArray(data.tools))
        setTools((was) => (was.length ? was : data.tools));
    } finally {
      setDrafting(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/me/profile", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          owns,
          tools,
        }),
      });
      if (!response.ok) {
        // nothing said as saved that was not: the form stays open with what they wrote
        setProblem(t("saveFailed"));
        return;
      }
      onProfile(await response.json());
      // In an office, the card colleagues see changes with it; one that did not go says so.
      if (
        card &&
        name.trim() &&
        !(await office.post({
          action: "card",
          card: {
            ...card,
            name: name.trim(),
            description: role.trim(),
            owns,
          },
        }))
      ) {
        setProblem(t("saveFailed"));
        return;
      }
      setEditing(false);
      say(t("saved"));
    } finally {
      setBusy(false);
    }
  };

  const pills = (items: string[], marks = false) => (
    <span className="flex min-w-0 flex-wrap gap-1.5">
      {items.map((item) => {
        const mark = marks ? markOf(item) : undefined;
        return (
          <span
            key={item}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-[13px]"
          >
            {mark && <BrandMark id={mark} className="size-3.5" />}
            {item}
          </span>
        );
      })}
    </span>
  );
  const line = (label: string, value: ReactNode) => (
    <div className="flex items-baseline gap-3.5">
      <span className="w-20 shrink-0 text-[13px] text-muted-foreground">
        {label}
      </span>
      {value}
    </div>
  );
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex min-h-8 items-center gap-2.5">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {t("about")}
        </h2>
        {!(editing || empty) && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setEditing(true)}
          >
            <Pencil />
            {t("edit")}
          </Button>
        )}
      </div>
      {editing || empty ? (
        <form
          className="grid gap-3 rounded-[14px] bg-background p-4 shadow-[0_0_0_1px_var(--alpha-10)] sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {tOffice("name")}
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {tOffice("role")}
            </span>
            <div className="flex gap-2">
              <Input
                value={role}
                maxLength={200}
                className="min-w-0 flex-1"
                placeholder={
                  drafting ? tOffice("drafting") : tOffice("rolePlaceholder")
                }
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
                {tOffice("draft")}
              </Button>
            </div>
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs text-muted-foreground">
              {tOffice("owns")}
            </span>
            <ListField
              values={owns}
              onChange={setOwns}
              max={PROFILE_LIMITS.owns}
              maxItem={PROFILE_LIMITS.own}
              placeholder={tOffice("ownsPlaceholder")}
              disabled={drafting}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs text-muted-foreground">
              {tOffice("tools")}
            </span>
            <ListField
              values={tools}
              onChange={setTools}
              max={PROFILE_LIMITS.tools}
              maxItem={PROFILE_LIMITS.tool}
              placeholder={tOffice("toolsPlaceholder")}
              disabled={drafting}
            />
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy || !changed} loading={busy}>
              {t("save")}
            </Button>
            {problem && (
              <span role="alert" className="text-[13px] text-destructive">
                {problem}
              </span>
            )}
            {!empty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setName(card?.name ?? profile.name ?? "");
                  setRole(card?.description || profile.role || "");
                  setOwns(JSON.parse(ownsKey));
                  setTools(JSON.parse(toolsKey));
                  setEditing(false);
                }}
              >
                {common("cancel")}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-background px-4.5 py-4 shadow-[0_0_0_1px_var(--alpha-10)]">
          {line(t("roleShort"), <span className="text-[14px]">{role}</span>)}
          {owns.length > 0 && line(t("ownsShort"), pills(owns))}
          {tools.length > 0 && line(t("toolsShort"), pills(tools, true))}
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {card ? t("aboutInOffice") : t("aboutHint")}
          </p>
        </div>
      )}
    </section>
  );
}

function ReadAgain({ learn }: { learn: Learn }) {
  const t = useTranslations("settings.clone");
  const tRun = useTranslations("firstRun");
  const problemText = useProblem();
  const learning = learn.stage === "learning";
  const label = learn.progress
    ? learn.progress.phase === "read" &&
      learn.progress.source &&
      tRun.has(`source.${learn.progress.source}` as never)
      ? tRun(`source.${learn.progress.source}` as never)
      : tRun(`phase.${learn.progress.phase}`)
    : "";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background">
          <RotateCcw className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t("readAgain")}</span>
          <span className="block text-xs text-muted-foreground">
            {learn.fresh > 0
              ? t("readFresh", { count: learn.fresh })
              : t("readAgainHint")}
          </span>
        </span>
        <Button
          variant="secondary"
          disabled={learning}
          loading={learning}
          onClick={() => void learn.start()}
        >
          {t("read")}
        </Button>
      </div>
      {learning && learn.progress && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs">
            <ShinyText text={label} />
            <span className="text-muted-foreground tabular-nums">
              {learn.progress.percent}%
            </span>
          </span>
          <span className="block h-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${learn.progress.percent}%` }}
            />
          </span>
        </div>
      )}
      {learn.kept.length > 0 && (
        <ul className="flex flex-col gap-1">
          {learn.kept.map((line) => (
            <li
              key={line}
              className="flex items-start gap-1.5 text-xs text-muted-foreground"
            >
              <Check className="mt-0.5 size-3 shrink-0 text-foreground" />
              {line}
            </li>
          ))}
        </ul>
      )}
      {learn.problem && (
        <p className="text-xs text-destructive">{problemText(learn.problem)}</p>
      )}
    </div>
  );
}

/**
 * Bringing what another AI remembers, in Claude's two steps: copy the prompt into a chat with that
 * AI, paste its answer back. Only what lasts is kept; the pasted text is not stored.
 */
export function BringFromAnotherAi({
  lang,
  onDone,
  frame = "box",
}: {
  lang: string;
  onDone: () => void;
  /** Its own framed box (the first steps), or plain inside what holds it (the clone's screen). */
  frame?: "box" | "plain";
}) {
  const t = useTranslations();
  const tClone = useTranslations("settings.clone");
  const problemText = useProblem();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const submit = async () => {
    setWorking(true);
    setResult(null);
    try {
      await stream("/api/me/import", { text, locale: lang }, (event) => {
        if (event.type === "done") {
          const kept = (event.kept as string[]) ?? [];
          setResult(t("import.done", { count: kept.length }));
          setText("");
          onDone();
        }
        if (event.type === "error")
          setResult(problemText(String(event.code ?? event.message)));
      });
    } catch (error) {
      setResult(problemText((error as Error).message));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        frame === "box" && "rounded-xl border border-border p-4",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg",
            frame === "box" ? "bg-muted" : "bg-background",
          )}
        >
          <Download className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t("import.open")}</span>
          <span className="block text-xs text-muted-foreground">
            {tClone("importHint")}
          </span>
        </span>
        {!open && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {tClone("bring")}
          </Button>
        )}
      </div>
      {open && (
        <ol className="flex flex-col gap-4">
          <li className="flex flex-col gap-2">
            <span className="flex items-start gap-2">
              <StepNumber n={1} />
              <span className="min-w-0 flex-1">{t("import.step1")}</span>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(EXPORT_PROMPT)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false))
                }
              >
                {copied ? <Check /> : <ClipboardCopy />}
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
            </span>
            <pre className="max-h-36 overflow-auto rounded-lg bg-muted p-3 font-sans text-xs whitespace-pre-wrap text-muted-foreground">
              {EXPORT_PROMPT}
            </pre>
          </li>
          <li className="flex flex-col gap-2">
            <span className="flex gap-2">
              <StepNumber n={2} />
              <span className="min-w-0">{t("import.step2")}</span>
            </span>
            <Textarea
              value={text}
              placeholder={t("import.placeholder")}
              className="min-h-28"
              disabled={working}
              onChange={(event) => setText(event.target.value)}
            />
          </li>
          {working && (
            <ShinyText className="text-sm" text={t("import.working")} />
          )}
          {!working && result && <p className="text-sm">{result}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {result ? t("common.close") : t("common.cancel")}
            </Button>
            <Button
              disabled={!text.trim() || working}
              loading={working}
              onClick={() => void submit()}
            >
              {t("import.add")}
            </Button>
          </div>
        </ol>
      )}
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-md bg-muted text-xs font-medium tabular-nums">
      {n}
    </span>
  );
}

const SOURCES = [
  "task",
  "review",
  "reading",
  "import",
  "request",
  "flow",
  "fix",
  "meeting",
] as const;

/** Where a line came from and when, in one dim line: "where did you get that?" answered. */
function SourceLine({ source }: { source: Source }) {
  const t = useTranslations("settings.clone.source");
  const format = useFormatter();
  const from = (SOURCES as readonly string[]).includes(source.from)
    ? (source.from as (typeof SOURCES)[number])
    : "other";
  return (
    <span className="block text-xs text-muted-foreground">
      {t(from, { title: source.title ?? "none" })} ·{" "}
      {format.dateTime(new Date(source.at), { month: "short", day: "numeric" })}
    </span>
  );
}

function MemoryRow({
  entry,
  source,
  fresh,
  onFix,
  onRemove,
}: {
  entry: Entry;
  source?: Source;
  fresh: boolean;
  onFix: (fix: string) => Promise<void>;
  /** Removes it, with Undo (the list hides it at once). */
  onRemove: () => void;
}) {
  const [state, setState] = useState<"open" | "fixing" | "saving">("open");
  const [text, setText] = useState(entry.text);
  const t = useTranslations();
  return (
    <li className="group flex flex-col gap-2 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-foreground/[0.035] focus-within:bg-foreground/[0.035]">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="text-[14px] leading-relaxed">{entry.text}</span>
          {fresh && (
            <span className="ml-2 inline-block rounded-md bg-brand/10 px-1.5 py-0.5 align-middle text-[11px] font-medium whitespace-nowrap text-brand">
              {t("memory.isNew")}
            </span>
          )}
          {source && <SourceLine source={source} />}
        </span>
        {state === "open" && (
          // shown while pointed at or reached by the keyboard; always where nothing points
          <span className="flex shrink-0 gap-0.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
            <Tip label={t("memory.fix")}>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setState("fixing")}
              >
                <Pencil />
              </Button>
            </Tip>
            <Tip label={t("memory.remove")}>
              <Button size="icon-sm" variant="ghost" onClick={onRemove}>
                <Trash2 />
              </Button>
            </Tip>
          </span>
        )}
        {state === "saving" && (
          <span className="shrink-0 text-xs">
            <ShinyText text={t("memory.fix")} />
          </span>
        )}
      </div>
      {state === "fixing" && (
        <span className="flex flex-col gap-2">
          <Textarea
            autoFocus
            value={text}
            aria-label={t("memory.fixHint")}
            onChange={(event) => setText(event.target.value)}
          />
          <span className="flex gap-2">
            <Button
              size="sm"
              disabled={!text.trim() || text === entry.text}
              onClick={() => {
                setState("saving");
                void onFix(text.trim()).finally(() => setState("open"));
              }}
            >
              {t("memory.fix")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState("open")}>
              {t("common.cancel")}
            </Button>
          </span>
        </span>
      )}
    </li>
  );
}

/** Starting over: what is kept moves into a backup, or is cleared when it all came from a reading. */
function StartOver() {
  const t = useTranslations("settings.clone");
  const tRun = useTranslations("firstRun");
  const common = useTranslations("common");
  const problemText = useProblem();
  const router = useRouter();
  const [sure, setSure] = useState<false | "backup" | "clear">(false);
  // what is kept is looked at first, to say whether starting over keeps a copy
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    const response = await fetch("/api/me/reset", {
      method: "POST",
      headers: HEADERS,
    }).catch(() => undefined);
    setBusy(false);
    if (!response?.ok) {
      setProblem(String(response?.status ?? "generic"));
      return;
    }
    router.push("/start");
  };
  // at the foot, quiet: a line saying what it does and a button that asks once before it goes
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
      <p className="min-w-0 flex-1 basis-64 text-[13px] leading-relaxed text-muted-foreground">
        {t("startOverHint")}
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        loading={checking}
        onClick={() => {
          setChecking(true);
          setProblem(null);
          void fetch("/api/me/reset", { headers: HEADERS })
            .then((r) => r.json())
            .then((data) => setSure(data?.onlyRead ? "clear" : "backup"))
            .catch(() => setSure("backup"))
            .finally(() => setChecking(false));
        }}
      >
        <RotateCcw />
        {tRun("startOver")}
      </Button>
      <ConfirmDialog
        open={Boolean(sure)}
        onOpenChange={(open) => !open && setSure(false)}
        title={t("startOverTitle")}
        description={
          sure === "clear" ? t("startOverBodyClear") : t("startOverBody")
        }
        cancel={common("cancel")}
        confirm={tRun("startOverYes")}
        destructive
        busy={busy}
        error={problem ? problemText(problem) : undefined}
        onConfirm={() => void go()}
      />
    </section>
  );
}
