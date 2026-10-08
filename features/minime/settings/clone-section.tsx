"use client";

// Settings › Your clone: who the person is to their clone (what to call them, what they do), what
// it remembers about them exactly as kept (each line correctable or removable), reading their
// records again or bringing what their usual AI remembers, and starting over.

import {
  BookOpen,
  Check,
  ClipboardCopy,
  Download,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShinyText } from "@/components/ui/shiny-text";
import { Textarea } from "@/components/ui/textarea";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { Learn } from "../home/use-learn";
import {
  HEADERS,
  type OfficeState,
  type Profile,
  splitList,
} from "../home/use-office";
import { EXPORT_PROMPT } from "../learn/export-prompt";
import { stream } from "../stream";
import { Empty, Group, Groups, Rows } from "./parts";

/** Where a line came from (memory/store.ts Source), as the route words it. */
interface Source {
  from: string;
  at: string;
  title?: string;
}

interface Memory {
  user: string[];
  memory: string[];
  sources?: { user: Record<string, Source>; memory: Record<string, Source> };
  skills: number;
  notes: number;
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

  const remove = async (entry: Entry) => {
    const response = await fetch("/api/me/memory", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        remove: { target: entry.target, entry: entry.text },
      }),
    }).catch(() => undefined);
    const data = await response?.json().catch(() => ({}));
    if (response?.ok) setMemory(data as Memory);
    else setProblem(String(data?.error ?? response?.status ?? "generic"));
  };

  return (
    <Groups>
      <AboutYou
        profile={profile}
        onProfile={onProfile}
        office={office}
        lang={lang}
      />

      <Group
        title={t("remembers")}
        hint={t("remembersHint")}
        action={
          memory && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("lines", { count: entries.length })}
            </span>
          )
        }
      >
        {!memory ? (
          <ShinyText className="text-sm" text={t("loading")} />
        ) : entries.length === 0 ? (
          <Empty icon={<BookOpen className="size-5" />}>
            {t("nothingYet")}
          </Empty>
        ) : (
          <Rows>
            {entries.map((entry, index) => (
              <MemoryRow
                key={`${entry.target}-${entry.text}`}
                index={index}
                entry={entry}
                source={memory.sources?.[entry.target]?.[entry.text]}
                fresh={learn.kept.includes(entry.text)}
                onFix={(fixed) => fix(entry, fixed)}
                onRemove={() => remove(entry)}
              />
            ))}
          </Rows>
        )}
        {memory && (
          <p className="text-xs text-muted-foreground">
            {t("where", { dir: memory.dir })}
            {memory.skills + memory.notes > 0 &&
              ` ${t("andMore", { skills: memory.skills, notes: memory.notes })}`}
          </p>
        )}
        {problem && <p className="text-destructive">{problemText(problem)}</p>}
      </Group>

      <Group title={t("learnMore")} hint={t("learnMoreHint")}>
        <ReadAgain learn={learn} />
        <BringFromAnotherAi lang={lang} onDone={() => void loadMemory()} />
      </Group>

      <StartOver />
    </Groups>
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
  const card = office.office?.joined ? office.office.me?.card : undefined;
  const [name, setName] = useState(card?.name ?? profile.name ?? "");
  const [role, setRole] = useState(card?.description ?? profile.role ?? "");
  const ownsNow = (card?.owns ?? profile.owns ?? []).join(", ");
  const toolsNow = (profile.tools ?? []).join(", ");
  const [owns, setOwns] = useState(ownsNow);
  const [tools, setTools] = useState(toolsNow);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  useEffect(() => {
    setName(card?.name ?? profile.name ?? "");
    setRole(card?.description ?? profile.role ?? "");
    setOwns(ownsNow);
    setTools(toolsNow);
  }, [
    card?.name,
    card?.description,
    profile.name,
    profile.role,
    ownsNow,
    toolsNow,
  ]);
  const changed =
    name.trim() !== (card?.name ?? profile.name ?? "") ||
    role.trim() !== (card?.description ?? profile.role ?? "") ||
    splitList(owns).join(", ") !== ownsNow ||
    splitList(tools).join(", ") !== toolsNow;

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
        setOwns((was) => was.trim() || data.owns.join(", "));
      if (Array.isArray(data.tools))
        setTools((was) => was.trim() || data.tools.join(", "));
    } finally {
      setDrafting(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/me/profile", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          owns: splitList(owns),
          tools: splitList(tools),
        }),
      });
      if (response.ok) onProfile(await response.json());
      // In an office, the card colleagues see changes with it.
      if (card && name.trim())
        await office.post({
          action: "card",
          card: {
            ...card,
            name: name.trim(),
            description: role.trim(),
            owns: splitList(owns),
          },
        });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group title={t("about")} hint={card ? t("aboutInOffice") : t("aboutHint")}>
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
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
              variant="outline"
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
          <Input
            value={owns}
            maxLength={400}
            placeholder={tOffice("ownsPlaceholder")}
            disabled={drafting}
            onChange={(e) => setOwns(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs text-muted-foreground">
            {tOffice("tools")}
          </span>
          <Input
            value={tools}
            maxLength={400}
            placeholder={tOffice("toolsPlaceholder")}
            disabled={drafting}
            onChange={(e) => setTools(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            {tOffice("listHint")}
          </span>
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy || !changed} loading={busy}>
            {saved ? <Check /> : null}
            {saved ? t("saved") : t("save")}
          </Button>
        </div>
      </form>
    </Group>
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
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
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
          variant="outline"
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
}: {
  lang: string;
  onDone: () => void;
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
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
          <Download className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t("import.open")}</span>
          <span className="block text-xs text-muted-foreground">
            {tClone("importHint")}
          </span>
        </span>
        {!open && (
          <Button variant="outline" onClick={() => setOpen(true)}>
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
  index,
  entry,
  source,
  fresh,
  onFix,
  onRemove,
}: {
  index: number;
  entry: Entry;
  source?: Source;
  fresh: boolean;
  onFix: (fix: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [state, setState] = useState<
    "open" | "fixing" | "saving" | "removing" | "sure"
  >("open");
  const [text, setText] = useState(entry.text);
  const t = useTranslations();
  return (
    <li className="group flex flex-col gap-2 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-px w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 leading-relaxed">
          {entry.text}
          {fresh && (
            <span className="ml-2 inline-block rounded-md bg-brand/10 px-1.5 py-0.5 align-middle text-[11px] font-medium whitespace-nowrap text-brand">
              {t("memory.isNew")}
            </span>
          )}
          {source && <SourceLine source={source} />}
        </span>
        {state === "open" && (
          <span className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("memory.fix")}
              title={t("memory.fix")}
              onClick={() => setState("fixing")}
            >
              <Pencil />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("memory.remove")}
              title={t("memory.remove")}
              onClick={() => setState("sure")}
            >
              <Trash2 />
            </Button>
          </span>
        )}
        {(state === "saving" || state === "removing") && (
          <span className="shrink-0 text-xs">
            <ShinyText
              text={state === "saving" ? t("memory.fix") : t("memory.remove")}
            />
          </span>
        )}
      </div>
      {state === "sure" && (
        <span className="ml-7 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">
            {t("memory.removeSure")}
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setState("removing");
              void onRemove().finally(() => setState("open"));
            }}
          >
            {t("memory.remove")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState("open")}>
            {t("common.cancel")}
          </Button>
        </span>
      )}
      {state === "fixing" && (
        <span className="ml-7 flex flex-col gap-2">
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
  return (
    <Group title={t("startOver")} hint={t("startOverHint")} tone="danger">
      {sure ? (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4",
          )}
        >
          <p>
            {sure === "clear" ? tRun("startOverClear") : tRun("startOverSure")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={busy}
              loading={busy}
              onClick={() => void go()}
            >
              {tRun("startOverYes")}
            </Button>
            <Button variant="ghost" onClick={() => setSure(false)}>
              {common("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() =>
              void fetch("/api/me/reset", { headers: HEADERS })
                .then((r) => r.json())
                .then((data) => setSure(data?.onlyRead ? "clear" : "backup"))
                .catch(() => setSure("backup"))
            }
          >
            <RotateCcw />
            {tRun("startOver")}
          </Button>
        </div>
      )}
      {problem && <p className="text-destructive">{problemText(problem)}</p>}
    </Group>
  );
}
