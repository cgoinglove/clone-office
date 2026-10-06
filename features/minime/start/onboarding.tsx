"use client";

// The first steps a new person takes with their clone (/start), one screen each: what a clone is,
// what it thinks with (brain/), letting it learn how they work (the first reading, with the
// folders they leave out), bringing it to their team or not (the office), and then their clone's
// own page. Each step can be passed over, and everything here can be changed later on that page.

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ShinyText } from "@/components/ui/shiny-text";
import { Bot } from "@/features/office";
import { personTag, useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { BrainChooser, type BrainState, brainReady } from "../brain-panel";
import { type Folder, FolderList, type LeftOut } from "../folder-list";
import { LanguageSwitch } from "../language-switch";
import { parseInvite } from "../office/invite";
import { stream } from "../stream";

const STEPS = ["welcome", "brain", "learn", "team", "ready"] as const;
type Step = (typeof STEPS)[number];

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

interface Progress {
  phase: string;
  percent: number;
  source?: string;
}

type Team = "alone" | "invite" | "open";

export function Onboarding() {
  const t = useTranslations("start");
  const tAll = useTranslations();
  const problemText = useProblem();
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [others, setOthers] = useState<LeftOut[]>([]);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [learned, setLearned] = useState<string[] | null>(null);
  const [team, setTeam] = useState<Team>("alone");
  const [invite, setInvite] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [joined, setJoined] = useState<"joined" | "opened" | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const following = useRef<AbortController | null>(null);
  const at = STEPS.indexOf(step);

  const go = (next: Step) => {
    setProblem(null);
    setStep(next);
  };

  // The folders it would read, for the person to leave any out before anything is read.
  useEffect(() => {
    if (step !== "learn" || folders) return;
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
  }, [step, folders]);

  useEffect(() => () => following.current?.abort(), []);

  const saveExcludes = async (next: string[]) => {
    const response = await fetch("/api/me/sources", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ exclude: next }),
    });
    if (!response.ok) return;
    setExcludes(next);
    setFolders(null);
  };

  /** Follows the reading; it goes on in the server whether this page watches or not. */
  const follow = useCallback(() => {
    following.current?.abort();
    const controller = new AbortController();
    following.current = controller;
    void stream(
      "/api/me/learn",
      undefined,
      (event) => {
        if (event.type === "progress") setProgress(event as never);
        if (event.type === "done") {
          setProgress(null);
          setLearned((event.kept as string[] | undefined) ?? []);
        }
        if (event.type === "error") {
          setProgress(null);
          setProblem(String(event.code ?? event.message));
        }
      },
      controller.signal,
    ).catch(() => {});
  }, []);

  const read = async () => {
    setProblem(null);
    setProgress({ phase: "index", percent: 1 });
    const response = await fetch("/api/me/learn", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ locale: personTag() }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setProgress(null);
      setProblem(String(data.error ?? response.status));
      return;
    }
    follow();
  };

  const bringToTeam = async () => {
    const card = { name: name.trim(), description: role.trim() };
    const found = team === "invite" ? parseInvite(invite) : undefined;
    if (team === "invite" && !found) {
      setProblem("not-invite-link");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(
          found
            ? { action: "join", relay: found.relay, key: found.key, card }
            : { action: "open", card },
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setProblem(String(data.error ?? response.status));
      else setJoined(found ? "joined" : "opened");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    await fetch("/api/me/onboarded", { method: "POST", headers: HEADERS });
    router.push("/me");
  };

  const progressLabel = progress
    ? progress.phase === "read" &&
      progress.source &&
      tAll.has(`firstRun.source.${progress.source}` as never)
      ? tAll(`firstRun.source.${progress.source}` as never)
      : tAll(`firstRun.phase.${progress.phase}` as never)
    : "";

  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-1 flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Bot size={28} mood="idle" label="sub-office" />
          sub-office
        </span>
        <LanguageSwitch />
      </header>

      <ol className="flex gap-2" aria-label={t("title")}>
        {STEPS.map((name, index) => (
          <li
            key={name}
            className="flex min-w-0 flex-1 flex-col gap-1.5"
            aria-current={index === at ? "step" : undefined}
          >
            <span
              className={cn(
                "h-1 rounded-full bg-foreground/10",
                index <= at && "bg-foreground",
              )}
            />
            <span
              className={cn(
                "truncate text-xs text-muted-foreground",
                index === at && "font-medium text-foreground",
              )}
            >
              {t(`steps.${name}`)}
            </span>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-5">
        {step === "welcome" && (
          <>
            <Bot size={88} mood="happy" label="" className="self-start" />
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {t("welcome.title")}
            </h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {t("welcome.body")}
            </p>
            <div className="flex flex-col gap-2 text-[15px]">
              <p className="font-medium">{t("welcome.steps")}</p>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
                <li>{t("welcome.one")}</li>
                <li>{t("welcome.two")}</li>
                <li>{t("welcome.three")}</li>
              </ol>
            </div>
            <div className="flex flex-col items-start gap-2">
              <Button size="lg" onClick={() => go("brain")}>
                {t("welcome.go")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("welcome.local")}
              </p>
            </div>
          </>
        )}

        {step === "brain" && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {t("brain.title")}
            </h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {t("brain.body")}
            </p>
            <BrainChooser onChange={setBrain} />
            <Button
              className="self-start"
              disabled={!brainReady(brain)}
              onClick={() => go("learn")}
            >
              {t("next")}
            </Button>
          </>
        )}

        {step === "learn" && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {t("learn.title")}
            </h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {t("learn.body")}
            </p>
            {learned ? (
              <div className="flex flex-col gap-2 text-[15px]">
                <p className="font-medium">{t("learn.done")}</p>
                {learned.length ? (
                  <ul className="flex flex-col">
                    {learned.map((line) => (
                      <li
                        key={line}
                        className="border-b border-border py-2 last:border-b-0"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">{t("learn.nothing")}</p>
                )}
              </div>
            ) : progress ? (
              <p className="text-[15px]">
                <ShinyText text={progressLabel} />
                <span className="ml-2 text-muted-foreground tabular-nums">
                  {progress.percent}%
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {t("learn.reading")}
                </span>
              </p>
            ) : folders === null ? null : folders.length === 0 &&
              others.length === 0 ? (
              <p className="text-[15px] text-muted-foreground">
                {t("learn.none")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {t("learn.folders")}
                </p>
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
            <div className="flex flex-wrap gap-2">
              {!learned &&
                !progress &&
                folders !== null &&
                folders.length > 0 && (
                  <Button onClick={() => void read()}>{t("learn.read")}</Button>
                )}
              <Button
                variant={learned || progress ? "default" : "ghost"}
                onClick={() => go("team")}
              >
                {learned || progress ? t("next") : t("learn.skip")}
              </Button>
            </div>
          </>
        )}

        {step === "team" && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {t("team.title")}
            </h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {t("team.body")}
            </p>
            {joined ? (
              <p className="text-[15px]">{t(`team.${joined}`)}</p>
            ) : (
              <>
                <Segmented<Team>
                  aria-label={t("team.title")}
                  className="w-full flex-wrap *:flex-1"
                  value={team}
                  onChange={(next) => {
                    setTeam(next);
                    setProblem(null);
                  }}
                  options={[
                    { value: "alone", label: t("team.alone") },
                    { value: "invite", label: t("team.invite") },
                    { value: "open", label: t("team.open") },
                  ]}
                />
                {team === "alone" ? (
                  <p className="text-sm text-muted-foreground">
                    {t("team.aloneNote")}
                  </p>
                ) : (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void bringToTeam();
                    }}
                  >
                    {team === "open" && (
                      <p className="text-sm text-muted-foreground">
                        {t("team.openNote")}
                      </p>
                    )}
                    {team === "invite" && (
                      <Input
                        spellCheck={false}
                        value={invite}
                        aria-label={t("team.link")}
                        placeholder={t("team.link")}
                        onChange={(event) => setInvite(event.target.value)}
                      />
                    )}
                    <Input
                      value={name}
                      maxLength={80}
                      autoComplete="name"
                      aria-label={t("team.name")}
                      placeholder={t("team.name")}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <Input
                      value={role}
                      maxLength={600}
                      aria-label={t("team.role")}
                      placeholder={t("team.role")}
                      onChange={(event) => setRole(event.target.value)}
                    />
                    <Button
                      type="submit"
                      className="self-start"
                      disabled={
                        busy ||
                        !name.trim() ||
                        (team === "invite" && !invite.trim())
                      }
                      loading={busy}
                    >
                      {team === "invite" ? t("team.join") : t("team.openGo")}
                    </Button>
                  </form>
                )}
              </>
            )}
            <Button
              className="self-start"
              variant={joined || team === "alone" ? "default" : "ghost"}
              onClick={() => go("ready")}
            >
              {joined || team === "alone" ? t("next") : t("learn.skip")}
            </Button>
          </>
        )}

        {step === "ready" && (
          <>
            <Bot size={88} mood="happy" label="" className="self-start" />
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {t("ready.title")}
            </h1>
            {learned && learned.length > 0 ? (
              <div className="flex flex-col gap-2 text-[15px]">
                <p className="font-medium">{t("ready.learned")}</p>
                <ul className="flex flex-col">
                  {learned.map((line) => (
                    <li
                      key={line}
                      className="border-b border-border py-2 last:border-b-0"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : progress ? (
              <p className="text-[15px] text-muted-foreground">
                {t("ready.reading")}
              </p>
            ) : null}
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {t("ready.try")}
            </p>
            <Button
              size="lg"
              className="self-start"
              disabled={busy}
              onClick={() => void finish()}
            >
              {t("ready.go")}
            </Button>
          </>
        )}

        {problem && (
          <p className="text-sm text-destructive" role="alert">
            {problem === "not-invite-link"
              ? tAll("office.notInviteLink")
              : problemText(problem)}
          </p>
        )}
      </section>

      <footer className="mt-auto flex items-center justify-between text-sm text-muted-foreground">
        {at > 0 && step !== "ready" ? (
          <button
            type="button"
            className="underline-offset-4 hover:underline"
            onClick={() => go(STEPS[at - 1])}
          >
            {t("back")}
          </button>
        ) : (
          <span />
        )}
        {step !== "ready" && (
          <button
            type="button"
            className="underline-offset-4 hover:underline"
            disabled={busy}
            onClick={() => void finish()}
          >
            {t("later")}
          </button>
        )}
      </footer>
    </div>
  );
}
