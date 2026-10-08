"use client";

// Your clone › What it knows: its skills (how it does one kind of task the person's way), and in an
// office the skills colleagues shared. A skill of the person's own is shared with the office from
// here after they see the files that would go; one a colleague shared is added, or updated while
// it is as it came. Their press is their say: the clone's own tool asks on a card instead.

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShinyText } from "@/components/ui/shiny-text";
import { useProblem } from "@/i18n/client";
import { HEADERS } from "../home/use-office";
import { Empty, Group, Rows } from "./parts";

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

  const load = useCallback(
    () =>
      fetch("/api/me/skills", { headers: HEADERS })
        .then((r) => r.json())
        .then((next: Skills) => setData(next))
        .catch(() => {}),
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

  const office = data?.office;
  return (
    <>
      <Group title={t("title")} hint={t("hint")}>
        {!data ? (
          <ShinyText className="text-sm" text={t("loading")} />
        ) : data.skills.length === 0 ? (
          <Empty>{t("none")}</Empty>
        ) : (
          <Rows>
            {data.skills.map((skill) => (
              <OwnRow
                key={skill.name}
                skill={skill}
                inOffice={Boolean(office)}
                busy={busy === `share:${skill.name}`}
                onShare={() => act("share", skill.name)}
              />
            ))}
          </Rows>
        )}
        {problem && !office && (
          <p className="text-destructive">{problemText(problem)}</p>
        )}
      </Group>

      {office && (
        <Group title={t("officeTitle")} hint={t("officeHint")}>
          {office.problem ? (
            <p className="text-destructive">{problemText(office.problem)}</p>
          ) : office.skills.length === 0 ? (
            <Empty>{t("officeNone")}</Empty>
          ) : (
            <Rows>
              {office.skills.map((skill) => (
                <OfficeRow
                  key={skill.name}
                  skill={skill}
                  busy={busy}
                  onAct={(action) => act(action, skill.name)}
                />
              ))}
            </Rows>
          )}
          {problem && (
            <p className="text-destructive">{problemText(problem)}</p>
          )}
        </Group>
      )}
    </>
  );
}

function Done({ children, title }: { children: string; title?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
      title={title}
    >
      <Check className="size-3" />
      {children}
    </span>
  );
}

function OwnRow({
  skill,
  inOffice,
  busy,
  onShare,
}: {
  skill: OwnSkill;
  inOffice: boolean;
  busy: boolean;
  onShare: () => Promise<void>;
}) {
  const t = useTranslations("settings.skills");
  const cancel = useTranslations("common")("cancel");
  const problemText = useProblem();
  const [sure, setSure] = useState(false);
  const shareable = inOffice && skill.from === "own";
  return (
    <li className="flex flex-col gap-2 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="font-medium">{skill.name}</span>
          {skill.from !== "own" && (
            <span className="ml-2 text-xs text-muted-foreground">
              {skill.from === "app"
                ? t("fromApp")
                : t("fromOffice", { name: skill.by ?? "?" })}
            </span>
          )}
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {skill.description}
          </span>
        </span>
        {shareable &&
          !sure &&
          (skill.shared === "yes" ? (
            <Done>{t("shared")}</Done>
          ) : skill.files ? (
            <Button
              size="xs"
              variant="outline"
              className="shrink-0"
              onClick={() => setSure(true)}
            >
              {skill.shared === "changed" ? t("shareChanges") : t("share")}
            </Button>
          ) : skill.problem ? (
            <span
              className="shrink-0 text-xs text-muted-foreground"
              title={problemText(skill.problem)}
            >
              {t("cantShare")}
            </span>
          ) : null)}
      </div>
      {sure && skill.files && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5">
          <span className="text-xs">{t("shareSure")}</span>
          <ul className="flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
            {skill.files.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
          <span className="flex gap-2">
            <Button
              size="xs"
              disabled={busy}
              loading={busy}
              onClick={() => void onShare().finally(() => setSure(false))}
            >
              {t("shareYes")}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setSure(false)}>
              {cancel}
            </Button>
          </span>
        </div>
      )}
    </li>
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
    <li className="flex flex-col gap-2 px-3.5 py-3">
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
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {skill.here === "new" || skill.here === "update" ? (
            <Button
              size="xs"
              variant="outline"
              disabled={adding}
              loading={adding}
              onClick={() => void onAct("add")}
            >
              {skill.here === "new" ? t("add") : t("update")}
            </Button>
          ) : skill.here === "added" ? (
            <Done>{t("added")}</Done>
          ) : skill.here === "changed" ? (
            <Done title={t("changedHint")}>{t("changed")}</Done>
          ) : skill.here === "taken" ? (
            <span className="text-xs text-muted-foreground">{t("taken")}</span>
          ) : null}
          {skill.removable && !sure && (
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
      {sure && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("removeSure")}
          </span>
          <Button
            size="xs"
            disabled={removing}
            loading={removing}
            onClick={() => void onAct("unshare").finally(() => setSure(false))}
          >
            {t("removeYes")}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setSure(false)}>
            {cancel}
          </Button>
        </span>
      )}
    </li>
  );
}
