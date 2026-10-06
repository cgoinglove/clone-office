"use client";

// Settings › Requests: what colleagues' clones may ask the person's clone, each kind with how much
// it does alone (on its own, then tell them, or ask them first), how often its answers were sent as
// they were, and how to work with them (their ME.md): the lines colleagues and their clones read on
// their card.

import { Building2, Inbox, Pencil, Plus, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useProblem } from "@/i18n/client";
import {
  HEADERS,
  type MenuItem,
  type OfficeState,
  type Trust,
} from "../home/use-office";
import type { LikeMe } from "../office/likeme";
import { Empty, Group, Groups, Rows } from "./parts";

const TRUSTS: Trust[] = ["auto", "tell", "ask"];

export function RequestsSection({
  lang,
  office,
  onOpenOffice,
}: {
  lang: string;
  office: OfficeState;
  onOpenOffice: () => void;
}) {
  const t = useTranslations("settings.requests");
  const data = office.office;
  if (!data) return null;
  if (!data.joined)
    return (
      <Empty
        icon={<Building2 className="size-5" />}
        action={<Button onClick={onOpenOffice}>{t("toOffice")}</Button>}
      >
        {t("notInOffice")}
      </Empty>
    );
  const card = data.me?.card;
  return (
    <Groups>
      <Menu
        menu={data.menu ?? []}
        likeMe={data.likeMe}
        lang={lang}
        busy={office.busy}
        onSave={(menu) => office.post({ action: "menu", menu })}
      />
      {card && (
        <Ways
          lines={card.howToWork ?? []}
          lang={lang}
          busy={office.busy}
          onSave={(howToWork) =>
            office.post({ action: "card", card: { ...card, howToWork } })
          }
        />
      )}
    </Groups>
  );
}

/**
 * The kinds of request the person takes, each with how much their clone does alone. Every change is
 * kept and goes on the card at once.
 */
function Menu({
  menu,
  likeMe,
  lang,
  busy,
  onSave,
}: {
  menu: MenuItem[];
  likeMe?: LikeMe;
  lang: string;
  busy: boolean;
  onSave: (menu: MenuItem[]) => Promise<boolean>;
}) {
  const t = useTranslations("office");
  const tS = useTranslations("settings.requests");
  const cancel = useTranslations("common")("cancel");
  const problemText = useProblem();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The clone drafts the kinds from what it knows; the person keeps, changes or removes them.
  const draft = async () => {
    setDrafting(true);
    setProblem(null);
    try {
      const response = await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "draft-menu", locale: lang }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProblem(String(data.error ?? response.status));
        return;
      }
      const known = new Set(menu.map((item) => item.name.toLowerCase()));
      const fresh = ((data.menu as MenuItem[]) ?? []).filter(
        (item) => !known.has(item.name.toLowerCase()),
      );
      if (fresh.length) await onSave([...menu, ...fresh]);
    } finally {
      setDrafting(false);
    }
  };

  const percent =
    likeMe && likeMe.total >= 5
      ? Math.round((100 * likeMe.asIs) / likeMe.total)
      : null;

  return (
    <Group
      title={t("menu.title")}
      hint={menu.length ? t("menu.intro") : t("menu.none")}
      action={
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={drafting || busy}
            loading={drafting}
            onClick={() => void draft()}
          >
            {!drafting && <Sparkles />}
            {drafting ? t("drafting") : t("draft")}
          </Button>
          {!adding && (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus />
              {t("menu.add")}
            </Button>
          )}
        </div>
      }
    >
      {likeMe && likeMe.total > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-border px-4 py-3">
          <span className="text-2xl font-semibold tabular-nums">
            {percent !== null
              ? `${percent}%`
              : `${likeMe.asIs}/${likeMe.total}`}
          </span>
          <span className="min-w-0 text-[13px] leading-relaxed text-muted-foreground">
            <span className="block font-medium text-foreground">
              {tS("likeMe")}
            </span>
            {percent !== null
              ? tS("likeMeBody", { asIs: likeMe.asIs, total: likeMe.total })
              : t("menu.likeMeFew", { asIs: likeMe.asIs, total: likeMe.total })}
          </span>
        </div>
      )}
      {menu.length === 0 && !adding ? (
        <Empty icon={<Inbox className="size-5" />}>{tS("emptyMenu")}</Empty>
      ) : (
        menu.length > 0 && (
          <Rows>
            {menu.map((item, index) => (
              <li
                key={item.id ?? item.name}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3"
              >
                <span className="min-w-0 flex-1 basis-48">
                  <span className="font-medium">{item.name}</span>
                  {item.description && (
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                  {item.id && likeMe?.byMenu[item.id] && (
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {t("menu.itemLikeMe", likeMe.byMenu[item.id])}
                    </span>
                  )}
                </span>
                <Segmented<Trust>
                  size="sm"
                  aria-label={item.name}
                  options={TRUSTS.map((trust) => ({
                    value: trust,
                    label: t(`menu.trust.${trust}`),
                    title: t(`menu.trustHint.${trust}`),
                  }))}
                  value={item.trust}
                  onChange={(trust) =>
                    void onSave(
                      menu.map((m, i) => (i === index ? { ...m, trust } : m)),
                    )
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("menu.remove")}
                  title={t("menu.remove")}
                  className="text-muted-foreground"
                  disabled={busy}
                  onClick={() =>
                    void onSave(menu.filter((_, i) => i !== index))
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </Rows>
        )
      )}
      {menu.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("menu.free")}</p>
      )}
      {adding && (
        <form
          className="flex flex-col gap-3 rounded-xl border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave([
              ...menu,
              {
                name: name.trim(),
                description: description.trim(),
                trust: "tell",
              },
            ]).then((ok) => {
              if (!ok) return;
              setName("");
              setDescription("");
              setAdding(false);
            });
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("menu.name")}
            </span>
            <Input
              autoFocus
              value={name}
              placeholder={t("menu.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("menu.description")}
            </span>
            <Input
              value={description}
              placeholder={t("menu.descriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("menu.save")}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {cancel}
            </Button>
          </div>
        </form>
      )}
      {problem && <p className="text-destructive">{problemText(problem)}</p>}
    </Group>
  );
}

/**
 * How to work with the person: the lines of their ME.md that colleagues and their clones read on
 * the card. The clone drafts lines from what it knows; a line goes on the card only when the
 * person adds it, and any line can be taken off.
 */
function Ways({
  lines,
  lang,
  busy,
  onSave,
}: {
  lines: string[];
  lang: string;
  busy: boolean;
  onSave: (lines: string[]) => Promise<boolean>;
}) {
  const t = useTranslations("office");
  const problemText = useProblem();
  // Kept here as well, so lines added one after another never undo each other.
  const [mine, setMine] = useState(lines);
  useEffect(() => setMine(lines), [lines]);
  const [drafted, setDrafted] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const save = (next: string[]) => {
    setMine(next);
    void onSave(next);
  };

  const draft = async () => {
    setDrafting(true);
    setProblem(null);
    try {
      const response = await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "draft-ways", locale: lang }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProblem(String(data.error ?? response.status));
        return;
      }
      setDrafted(
        ((data.lines as string[]) ?? []).filter((line) => !mine.includes(line)),
      );
    } finally {
      setDrafting(false);
    }
  };

  return (
    <Group
      title={t("ways.title")}
      hint={t("ways.none")}
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={drafting || busy}
          loading={drafting}
          onClick={() => void draft()}
        >
          {!drafting && <Pencil />}
          {drafting ? t("drafting") : t("draft")}
        </Button>
      }
    >
      {mine.length > 0 && (
        <Rows>
          {mine.map((line) => (
            <li key={line} className="flex items-start gap-3 px-3.5 py-2.5">
              <span className="min-w-0 flex-1 leading-relaxed">{line}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("menu.remove")}
                title={t("menu.remove")}
                className="shrink-0 text-muted-foreground"
                disabled={busy}
                onClick={() => save(mine.filter((l) => l !== line))}
              >
                <X />
              </Button>
            </li>
          ))}
        </Rows>
      )}
      {drafted.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3.5">
          <span className="text-xs text-muted-foreground">
            {t("ways.drafted")}
          </span>
          {drafted.map((line) => (
            <div key={line} className="flex items-start gap-2">
              <span className="min-w-0 flex-1 leading-relaxed">{line}</span>
              <span className="flex shrink-0 gap-1">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    save([...mine, line]);
                    setDrafted((all) => all.filter((l) => l !== line));
                  }}
                >
                  {t("ways.add")}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() =>
                    setDrafted((all) => all.filter((l) => l !== line))
                  }
                >
                  {t("ways.skip")}
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const line = typed.trim();
          if (!line || mine.includes(line)) return;
          setTyped("");
          save([...mine, line]);
        }}
      >
        <Input
          value={typed}
          placeholder={t("ways.placeholder")}
          aria-label={t("ways.placeholder")}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Button
          variant="outline"
          type="submit"
          disabled={busy || !typed.trim()}
        >
          <Plus />
          {t("ways.add")}
        </Button>
      </form>
      {problem && <p className="text-destructive">{problemText(problem)}</p>}
    </Group>
  );
}
