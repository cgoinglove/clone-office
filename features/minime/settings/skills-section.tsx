"use client";

// Your clone › What it knows: its skills (how it does one kind of task the person's way), and in an
// office the skills colleagues shared, as one card beside the memory, each row opening what it is
// and its share, the office's under a row of their own (10-19 redesign). A skill of the person's own is shared with the office from
// here after they see the files that would go; one a colleague shared is added, or updated while
// it is as it came. Their press is their say: the clone's own tool asks on a card instead.

import { BookOpen, Check, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { HEADERS } from "../home/use-office";

interface OwnSkill {
  name: string;
  category?: string;
  description: string;
  from: "app" | "office" | "own";
  /** Who shared it, for one added from the office. */
  by?: string;
  /** What sharing it would send; or why it cannot go. */
  files?: string[];
  problem?: string;
  /** Shared with the office: as it is here, or changed here since. */
  shared?: "yes" | "changed";
  /** One the app ships, as it came: named in the person's language. */
  shipped?: boolean;
}

interface OfficeSkill {
  name: string;
  description: string;
  files: { path: string; size: number }[];
  by: string;
  byName: string;
  removable: boolean;
  scripts: number;
  here:
    | "new"
    | "added"
    | "update"
    | "changed"
    | "taken"
    | "yours"
    | "yours-changed";
}

interface Skills {
  skills: OwnSkill[];
  office: { skills: OfficeSkill[]; me: string; problem?: string } | null;
}

export function SkillsSection() {
  const t = useTranslations("settings.skills");
  const problemText = useProblem();
  const [data, setData] = useState<Skills | null>(null);
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string | null>(null);
  // the list could not be read: said, rather than an empty card
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    () =>
      fetch("/api/me/skills", { headers: HEADERS })
        .then((r) => r.json())
        .then((next: Skills) => setData(next))
        .catch(() => setFailed(true)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "share" | "unshare" | "add", name: string) => {
    setBusy(`${action}:${name}`);
    setProblem(null);
    try {
      const response = await fetch("/api/me/skills", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action, name }),
      }).catch(() => undefined);
      const next = await response?.json().catch(() => ({}));
      if (response?.ok) setData(next as Skills);
      else setProblem(String(next?.error ?? response?.status ?? "generic"));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <SkillsCard
      data={data}
      busy={busy}
      problem={failed ? t("loadFailed") : problem ? problemText(problem) : null}
      onAct={act}
    />
  );
}

/** The skills as one card beside the memory: a row each, opening what it is (and its share). */
function SkillsCard({
  data,
  busy,
  problem,
  onAct,
}: {
  data: Skills | null;
  busy?: string;
  problem: string | null;
  onAct: (action: "share" | "unshare" | "add", name: string) => Promise<void>;
}) {
  const t = useTranslations("settings.skills");
  const problemText = useProblem();
  const [open, setOpen] = useState<string | null>(null);
  const [officeOpen, setOfficeOpen] = useState(false);
  if (!data)
    return problem ? (
      <p className="px-1 text-[13px] text-destructive">{problem}</p>
    ) : null;
  const office = data.office;
  const fresh = office?.skills.filter((skill) => skill.here === "new").length;
  return (
    <section className="flex flex-col rounded-[14px] bg-background px-4 py-3.5 shadow-[0_0_0_1px_var(--alpha-10)]">
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="flex-1 text-[14px] font-semibold">{t("title")}</h3>
        <span className="text-xs text-muted-foreground">
          {t("count", { count: data.skills.length })}
        </span>
      </div>
      {data.skills.length === 0 ? (
        <p className="py-1 text-[13px] leading-relaxed text-muted-foreground">
          {t("none")}
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {data.skills.map((skill) => (
            <OwnRow
              key={skill.name}
              open={open === skill.name}
              onOpen={() => setOpen(open === skill.name ? null : skill.name)}
              skill={skill}
              inOffice={Boolean(office)}
              busy={busy === `share:${skill.name}`}
              onShare={() => onAct("share", skill.name)}
            />
          ))}
        </ul>
      )}
      {office && (office.skills.length > 0 || office.problem) && (
        <>
          <button
            type="button"
            aria-expanded={officeOpen}
            onClick={() => setOfficeOpen(!officeOpen)}
            className="-mx-2 mt-1 flex h-9 items-center gap-1.5 rounded-lg px-2 text-left text-[13px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex-1">
              {t("officeMore", { count: office.skills.length })}
              {fresh ? ` · ${t("officeNew", { count: fresh })}` : ""}
            </span>
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                officeOpen && "rotate-90",
              )}
            />
          </button>
          {officeOpen &&
            (office.problem ? (
              <p className="text-[13px] text-destructive">
                {problemText(office.problem)}
              </p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {office.skills.map((skill) => (
                  <OfficeRow
                    key={skill.name}
                    skill={skill}
                    busy={busy}
                    onAct={(action) => onAct(action, skill.name)}
                  />
                ))}
              </ul>
            ))}
        </>
      )}
      {problem && (
        <p className="mt-1 text-[13px] text-destructive">{problem}</p>
      )}
    </section>
  );
}

function Done({ children }: { children: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <Check className="size-3" />
      {children}
    </span>
  );
}

/** A row of the card: its name and where it came from, opening what it is and its share. */
function OwnRow({
  skill,
  inOffice,
  busy,
  onShare,
  open,
  onOpen,
}: {
  skill: OwnSkill;
  inOffice: boolean;
  busy: boolean;
  onShare: () => Promise<void>;
  open: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("settings.skills");
  const cancel = useTranslations("common")("cancel");
  const problemText = useProblem();
  const [sure, setSure] = useState(false);
  const shareable = inOffice && skill.from === "own";
  // The app's own skills are written in English; one as it came reads in the person's language.
  const named =
    skill.shipped && t.has(`shipped.${skill.name}.title` as never)
      ? {
          title: t(`shipped.${skill.name}.title` as never),
          body: t(`shipped.${skill.name}.body` as never),
        }
      : { title: skill.name, body: skill.description };
  const share =
    shareable &&
    !sure &&
    (skill.shared === "yes" ? (
      <Done>{t("shared")}</Done>
    ) : skill.files ? (
      <Button
        size="xs"
        variant="secondary"
        className="shrink-0"
        onClick={() => setSure(true)}
      >
        {skill.shared === "changed" ? t("shareChanges") : t("share")}
      </Button>
    ) : null);
  return (
    <li className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={onOpen}
        className="flex h-9 items-center gap-2.5 rounded-lg px-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BookOpen className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          {named.title}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {skill.from === "own"
            ? t("mine")
            : skill.from === "app"
              ? t("fromAppShort")
              : (skill.by ?? "")}
        </span>
      </button>
      {open && (
        <div className="mb-1.5 ml-8 flex flex-col gap-2 pr-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {named.body}
          </p>
          {shareable && !skill.files && skill.problem && (
            <p className="text-xs text-muted-foreground">
              {t("cantShare")} · {problemText(skill.problem)}
            </p>
          )}
          {share && <div>{share}</div>}
          {sure && skill.files && (
            <ShareSure
              files={skill.files}
              busy={busy}
              onYes={() => void onShare().finally(() => setSure(false))}
              onNo={() => setSure(false)}
              cancel={cancel}
            />
          )}
        </div>
      )}
    </li>
  );
}

/** The files sharing a skill would send, looked at before they go. */
function ShareSure({
  files,
  busy,
  onYes,
  onNo,
  cancel,
}: {
  files: string[];
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
  cancel: string;
}) {
  const t = useTranslations("settings.skills");
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5">
      <span className="text-xs">{t("shareSure")}</span>
      <ul className="flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
        {files.map((file) => (
          <li key={file} className="break-all">
            {file}
          </li>
        ))}
      </ul>
      <span className="flex gap-2">
        <Button size="xs" disabled={busy} loading={busy} onClick={onYes}>
          {t("shareYes")}
        </Button>
        <Button size="xs" variant="ghost" onClick={onNo}>
          {cancel}
        </Button>
      </span>
    </div>
  );
}

function OfficeRow({
  skill,
  busy,
  onAct,
}: {
  skill: OfficeSkill;
  busy?: string;
  onAct: (action: "add" | "unshare") => Promise<void>;
}) {
  const t = useTranslations("settings.skills");
  const cancel = useTranslations("common")("cancel");
  const [sure, setSure] = useState(false);
  const yours = skill.here === "yours" || skill.here === "yours-changed";
  const adding = busy === `add:${skill.name}`;
  const removing = busy === `unshare:${skill.name}`;
  return (
    <li className="flex flex-col gap-2 px-2 py-2 text-[13px]">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="font-medium">{skill.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {yours ? t("byYou") : t("by", { name: skill.byName })}
          </span>
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {skill.description}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t("files", { count: skill.files.length })}
            {skill.scripts > 0 &&
              ` · ${t("scripts", { count: skill.scripts })}`}
          </span>
          {skill.here === "changed" && (
            <span className="block text-xs text-muted-foreground">
              {t("changedHint")}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {skill.here === "new" || skill.here === "update" ? (
            <Button
              size="xs"
              variant="secondary"
              disabled={adding}
              loading={adding}
              onClick={() => void onAct("add")}
            >
              {skill.here === "new" ? t("add") : t("update")}
            </Button>
          ) : skill.here === "added" ? (
            <Done>{t("added")}</Done>
          ) : skill.here === "changed" ? (
            <Done>{t("changed")}</Done>
          ) : skill.here === "taken" ? (
            <span className="text-xs text-muted-foreground">{t("taken")}</span>
          ) : null}
          {skill.removable && (
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setSure(true)}
            >
              {yours ? t("unshare") : t("remove")}
            </Button>
          )}
        </span>
      </div>
      <ConfirmDialog
        open={sure}
        onOpenChange={setSure}
        title={t("removeTitle")}
        description={t("removeBody")}
        cancel={cancel}
        confirm={t("removeYes")}
        busy={removing}
        onConfirm={() => void onAct("unshare").finally(() => setSure(false))}
      />
    </li>
  );
}
