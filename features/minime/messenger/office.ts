// What the messenger needs of the office: the questions about colleagues' requests kept for the
// person, who asked what, and answering one as their page does. Kept apart from the bridge so its
// tests need no relay.

import { FINAL } from "../../relay/relay.ts";
import { loadOffice, members, personAway, tasks } from "../office/client.ts";
import { answerLater } from "../office/handle.ts";
import { changeState, loadState } from "../office/state.ts";
import { personLanguage } from "../server/language.ts";

/** A question about a colleague's request, kept until the person answers it. */
export interface Kept {
  id: string;
  task: string;
  from?: string;
  question: string;
  choices?: string[];
  /** The question it was first put to the person as, live. */
  ask?: string;
  at: string;
  phoned?: string;
}

export interface OfficeSide {
  kept(): Promise<Kept[]>;
  /** It went to the phone: it does not go again. */
  phoned(id: string): Promise<void>;
  /** Who asked and what, and whether the request is still open. */
  about(
    task: string,
  ): Promise<{ from?: string; text: string; open: boolean } | undefined>;
  /** Answers a kept question; the request goes on. False when it no longer waits. */
  answer(id: string, given: string): Promise<boolean>;
  /** The person said they are in a meeting, away or off. */
  away(): Promise<boolean>;
}

export function officeSide(gateUrl: () => string): OfficeSide {
  return {
    async kept() {
      const { later } = await loadState();
      return Object.entries(later).map(([id, entry]) => ({
        id,
        task: entry.task,
        ...(entry.from ? { from: entry.from } : {}),
        question: entry.question,
        ...(entry.choices?.length ? { choices: entry.choices } : {}),
        ...(entry.ask ? { ask: entry.ask } : {}),
        at: entry.at,
        ...(entry.phoned ? { phoned: entry.phoned } : {}),
      }));
    },
    async phoned(id) {
      await changeState((state) => {
        const entry = state.later[id];
        if (entry) entry.phoned = new Date().toISOString();
      });
    },
    async about(task) {
      const office = await loadOffice();
      if (!office) return undefined;
      const [{ tasks: all }, { members: everyone }] = await Promise.all([
        tasks(office),
        members(office),
      ]);
      const found = all.find((one) => one.id === task);
      if (!found) return undefined;
      const from =
        everyone.find((member) => member.id === found.metadata.from)?.card
          .name ?? found.metadata.guest;
      const first = found.history.find((message) => message.role === "user");
      return {
        ...(from ? { from } : {}),
        text: first?.parts.map((part) => part.text).join("\n") ?? "",
        open: !FINAL.includes(found.status.state),
      };
    },
    async answer(id, given) {
      return answerLater(id, given, {
        gateUrl: gateUrl(),
        language: await personLanguage(),
      });
    },
    away: personAway,
  };
}
