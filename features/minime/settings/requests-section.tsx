"use client";

// Your clone › Requests it takes (10-19 redesign): what colleagues' clones may ask the person's
// clone, each kind a card with how much it does alone (on its own, then tell them, or ask them
// first) and how often its answers were sent as they were; beside them the three levels said once,
// and how to work with them (their ME.md): the lines colleagues and their clones read on their card.

import { Building2, Inbox, PenLine, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Tip } from "@/components/ui/tooltip";
import { useProblem } from "@/i18n/client";
import {
  HEADERS,
  type MenuItem,
  type OfficeState,
  type Trust,
} from "../home/use-office";
import type { LikeMe } from "../office/likeme";
import type { Preferences } from "../server/preferences";
import { Empty } from "./parts";

const TRUSTS: Trust[] = ["auto", "tell", "ask"];

/** The more careful of two trust levels: asking first over telling after, telling over neither. */
const stricter = (a: Trust | undefined, b: Trust): Trust =>
  TRUSTS.indexOf(a ?? b) > TRUSTS.indexOf(b) ? (a ?? b) : b;

export function RequestsSection({
  lang,
  office,
  preferences,
  onPreferences,
  onOpenOffice,
}: {
  lang: string;
  office: OfficeState;
  /** Where a kind added here starts (`defaultTrust`), picked at the foot of the list. */
  preferences: Preferences | null;
  onPreferences: (next: Partial<Preferences>) => Promise<boolean>;
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
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-9 gap-y-8 text-sm lg:grid-cols-[minmax(0,1fr)_21.5rem]">
      <Menu
        menu={data.menu ?? []}
        likeMe={data.likeMe}
        lang={lang}
        busy={office.busy}
        defaultTrust={preferences?.defaultTrust ?? "tell"}
        onDefaultTrust={(defaultTrust) => void onPreferences({ defaultTrust })}
        onSave={(menu) => office.post({ action: "menu", menu })}
      />
      <aside className="flex min-w-0 flex-col gap-3.5">
        <Levels />
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
      </aside>
    </div>
  );
}

/** The three levels, said once beside the kinds rather than under every one. */
function Levels() {
  const t = useTranslations("office.menu");
  const tS = useTranslations("settings.requests");
  return (
    <section className="flex flex-col gap-2.5 rounded-[14px] bg-foreground/[0.035] p-4">
      <h3 className="text-[14px] font-semibold">{tS("levels")}</h3>
      <dl className="flex flex-col gap-2">
        {TRUSTS.map((trust) => (
          <div key={trust} className="flex items-baseline gap-2.5">
            <dt className="w-[4.5rem] shrink-0 text-[13px] font-semibold">
              {t(`trust.${trust}`)}
            </dt>
            <dd className="text-[13px] leading-relaxed text-muted-foreground">
              {t(`trustHint.${trust}`)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {tS("always")}
      </p>
    </section>
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
  defaultTrust,
  onDefaultTrust,
  onSave,
}: {
  menu: MenuItem[];
  likeMe?: LikeMe;
  lang: string;
  busy: boolean;
  defaultTrust: Trust;
  onDefaultTrust: (trust: Trust) => void;
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
      // A drafted kind starts where the person said new kinds start, or more carefully when the
      // clone thought it should (a kind that makes promises, say): never looser than either.
      const fresh = ((data.menu as MenuItem[]) ?? [])
        .filter((item) => !known.has(item.name.toLowerCase()))
        .map((item) => ({
          ...item,
          trust: stricter(item.trust, defaultTrust),
        }));
      if (fresh.length) await onSave([...menu, ...fresh]);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {t("menu.title")}
        </h2>
        <span className="text-[13px] text-muted-foreground">{tS("meta")}</span>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={drafting || busy}
            loading={drafting}
            onClick={() => void draft()}
          >
            {!drafting && <PenLine />}
            {drafting ? t("drafting") : t("draft")}
          </Button>
          {!adding && (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus />
              {t("menu.add")}
            </Button>
          )}
        </div>
      </div>
      {menu.length === 0 && !adding ? (
        <Empty icon={<Inbox className="size-5" />}>{tS("emptyMenu")}</Empty>
      ) : (
        menu.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {menu.map((item, index) => {
              const like = item.id ? likeMe?.byMenu[item.id] : undefined;
              const example = item.examples?.[0];
              return (
                <li
                  key={item.id ?? item.name}
                  className="group flex flex-col gap-3 rounded-[14px] bg-background px-4.5 py-4 shadow-[0_0_0_1px_var(--alpha-10)] sm:flex-row sm:items-start"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14.5px] font-semibold">
                      {item.name}
                    </span>
                    {item.description && (
                      <span className="text-[13px] leading-relaxed text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                    {example && (
                      <span className="mt-1 text-xs text-muted-foreground">
                        {tS("example", { text: example })}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <div className="flex items-center gap-1">
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
                            menu.map((m, i) =>
                              i === index ? { ...m, trust } : m,
                            ),
                          )
                        }
                      />
                      <Tip label={t("menu.remove")}>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          // shown while the card is pointed at or reached by the keyboard
                          className="text-muted-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
                          disabled={busy}
                          onClick={() =>
                            void onSave(menu.filter((_, i) => i !== index))
                          }
                        >
                          <X />
                        </Button>
                      </Tip>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {like ? t("menu.itemLikeMe", like) : tS("likeNone")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}
      <div className="flex flex-col gap-2 px-0.5 pt-1">
        {menu.length > 0 && (
          <p className="text-[13px] text-muted-foreground">{t("menu.free")}</p>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[13px] text-muted-foreground">
            {tS("startsAt")}
          </span>
          <Segmented<Trust>
            size="sm"
            aria-label={tS("startsAt")}
            options={TRUSTS.map((trust) => ({
              value: trust,
              label: t(`menu.trust.${trust}`),
              title: t(`menu.trustHint.${trust}`),
            }))}
            value={defaultTrust}
            onChange={onDefaultTrust}
          />
        </div>
      </div>
      {adding && (
        <form
          className="flex flex-col gap-3 rounded-[14px] bg-background p-4 shadow-[0_0_0_1px_var(--alpha-10)]"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave([
              ...menu,
              {
                name: name.trim(),
                description: description.trim(),
                trust: defaultTrust,
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
    </section>
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
    <section className="flex flex-col gap-2.5 rounded-[14px] bg-background px-4 py-3.5 shadow-[0_0_0_1px_var(--alpha-10)]">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-[14px] font-semibold">{t("ways.short")}</h3>
        <span className="text-xs text-muted-foreground">ME.md</span>
        <Tip label={t("draft")}>
          <Button
            size="icon-sm"
            variant="ghost"
            className="-mr-1.5 text-muted-foreground"
            disabled={drafting || busy}
            loading={drafting}
            onClick={() => void draft()}
          >
            {!drafting && <PenLine />}
          </Button>
        </Tip>
      </div>
      {mine.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {mine.map((line) => (
            <li
              key={line}
              className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-foreground/[0.035]"
            >
              <span className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-foreground/60" />
              <span className="min-w-0 flex-1 text-[13.5px] leading-relaxed">
                {line}
              </span>
              <Tip label={t("menu.remove")}>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                  disabled={busy}
                  onClick={() => save(mine.filter((l) => l !== line))}
                >
                  <X />
                </Button>
              </Tip>
            </li>
          ))}
        </ul>
      ) : (
        drafted.length === 0 && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("ways.none")}
          </p>
        )
      )}
      {drafted.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg bg-foreground/[0.035] p-3">
          <span className="text-xs text-muted-foreground">
            {t("ways.drafted")}
          </span>
          {drafted.map((line) => (
            <div key={line} className="flex flex-col gap-1.5">
              <span className="text-[13px] leading-relaxed">{line}</span>
              <span className="flex gap-1">
                <Button
                  size="xs"
                  variant="secondary"
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
        className="flex gap-1.5"
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
          className="h-8 text-[13px]"
          onChange={(event) => setTyped(event.target.value)}
        />
        <Tip label={t("ways.add")}>
          <Button
            size="icon-sm"
            variant="secondary"
            type="submit"
            className="size-8"
            disabled={busy || !typed.trim()}
          >
            <Plus />
          </Button>
        </Tip>
      </form>
      <p className="text-xs text-muted-foreground">{t("ways.onCard")}</p>
      {problem && <p className="text-destructive">{problemText(problem)}</p>}
    </section>
  );
}
