"use client";

// Settings › Permissions: what the person let their clone do without asking: each "Don't ask again for this" they ticked
// on a card, in their words, and taking one back (gate/rules.ts keeps them).

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ruleText } from "./ask-text";

const HEADERS = { "content-type": "application/json", "x-clone-office": "1" };

export function TrustPanel() {
  const t = useTranslations("trust");
  const words = useTranslations("ask");
  const [rules, setRules] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/me/trust", { headers: HEADERS })
      .then((r) => r.json())
      .then((data: { rules?: string[] }) => setRules(data.rules ?? []))
      .catch(() => {});

  useEffect(() => {
    void load();
  }, []);

  const takeBack = async (rule: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/me/trust", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ remove: rule }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        rules?: string[];
      };
      if (data.rules) setRules(data.rules);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      {rules && (
        <div className="flex flex-col gap-3">
          {rules.length === 0 ? (
            <p className="text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col">
              {rules.map((rule) => (
                <li
                  key={rule}
                  className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-b-0"
                >
                  <span className="min-w-0 break-words">
                    {ruleText(words, rule)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    disabled={busy}
                    onClick={() => void takeBack(rule)}
                  >
                    {t("askAgain")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
