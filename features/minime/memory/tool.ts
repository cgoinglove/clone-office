// The `memory` tool the mini-me's brain calls to keep its memory, and the guidance that goes with
// it in every session. Wording follows Hermes Agent (tools/memory_tool.py MEMORY_SCHEMA and
// agent/prompt_builder.py build_memory_guidance, MIT, Nous Research), with "the user" as the
// person the mini-me works for.

import type { BatchOp, MemoryStore, Target, WriteResult } from "./store.ts";

export const MEMORY_TOOL = {
  name: "memory",
  description: [
    "Save durable facts about your person and their work to persistent memory that survives across sessions. Memory is injected into every future session, so keep entries compact and high-signal.",
    "HOW: make ALL your changes in ONE call via an 'operations' array (each item: {action, content?, old_text?}). The batch applies atomically and the char limit is checked only on the FINAL result — so a single call can remove/replace stale entries to free room AND add new ones, even when an add alone would overflow. The response reports current/limit chars and confirms completion; one batch call finishes the update, so don't repeat it. Use the bare action/content/old_text fields only for a single lone change.",
    "WHEN: only for durable facts that apply to EVERY session regardless of task and that you cannot look up again: who your person is, how they like to work, decide and talk, corrections they gave you, boundaries they set. Never save what you can find again on their computer — files, folders, projects and their status, versions, dates, plans, goals, what they are working on now, what they did — because it changes and a saved copy goes stale and misleads you; look it up when you need it (conversation_search, the files themselves). Procedures, pitfalls, and your person's preferences and corrections for one kind of task belong in that task's skill.",
    "IF FULL: an add is rejected with the current entries shown. Reissue as ONE batch that removes or shortens enough stale entries and adds the new one together.",
    "TARGETS: 'user' = who your person is (role, what they own, preferences, how they decide, where they stop, how they talk). 'memory' = durable conventions of their work that are written nowhere else, and where to find things you cannot search for (an outside tracker, a shared drive). A person they work with gets a notes page (note_write) instead, opened only when needed.",
    "SKIP: anything you could find again on their computer, trivial or obvious info, raw data dumps, task progress, status, plans and dates, completed-work logs, temporary to-dos. Never store secrets, credentials, health details, or private details about other people.",
  ].join("\n\n"),
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["add", "replace", "remove"],
        description:
          "The action to perform (single-op shape). Omit when using 'operations'.",
      },
      target: {
        type: "string",
        enum: ["memory", "user"],
        description:
          "Which store: 'user' for who your person is, 'memory' for your notes on their work.",
      },
      content: {
        type: "string",
        description:
          "The entry content. Required for 'add' and 'replace'. For 'replace' it is the COMPLETE new entry text: the whole matched entry is overwritten, so include everything you want to keep.",
      },
      old_text: {
        type: "string",
        description:
          "REQUIRED for 'replace' and 'remove' (single-op shape): a short unique substring IDENTIFYING the existing entry to modify -- it locates the entry, it is not spliced out. Omit only for 'add'.",
      },
      operations: {
        type: "array",
        description:
          "Several changes to one target in one call, applied all-or-nothing with the limit checked on the final result.",
        items: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["add", "replace", "remove"] },
            content: {
              type: "string",
              description:
                "Entry content for add/replace. For replace, the COMPLETE new entry.",
            },
            old_text: {
              type: "string",
              description:
                "Substring identifying the entry for replace/remove.",
            },
          },
          required: ["action"],
        },
      },
    },
    required: ["target"],
  },
} as const;

export const MEMORY_GUIDANCE = [
  "You have persistent memory, carried across sessions and loaded into each new session's context; the memory tool's schema defines what belongs there.",
  "Skills come first: when you learn something while doing a task — a procedure, a pitfall, and your person's preferences and corrections for that kind of work — record it in the skill for that task, where it loads only when relevant.",
  "Memory is the narrow exception for facts that apply to EVERY session regardless of task (who your person is, facts about their work, standing conventions with no task home); it has a hard character budget, so when it fills, replace or consolidate stale entries rather than skipping the save.",
  "Write entries as declarative facts, not instructions to yourself: 'Prefers concise replies with the conclusion first' ✓ — 'Always reply concisely' ✗ (imperative phrasing gets re-read as a directive in later sessions and can override the person's current request).",
  "Write each entry in the language your person mostly uses with you. A saved fact that stops being true is worse than no fact: save only what will still hold in months, and look up everything that changes (files, projects, status, plans, dates, what was done) when you need it. Procedures and workflows belong in skills; what you know about one person belongs in their notes page.",
].join(" ");

interface MemoryArgs {
  action?: string;
  target?: string;
  content?: string;
  new_text?: string;
  old_text?: string;
  operations?: BatchOp[];
}

/** Runs one memory tool call against the store, as Hermes does: a batch, or one action. */
export async function callMemoryTool(
  store: MemoryStore,
  args: MemoryArgs,
): Promise<WriteResult> {
  const target = args.target;
  if (target !== "user" && target !== "memory")
    return { success: false, error: "target must be 'user' or 'memory'." };
  const store_target: Target = target;
  if (Array.isArray(args.operations) && args.operations.length)
    return store.batch(store_target, args.operations);
  const content = args.content ?? args.new_text ?? "";
  switch (args.action) {
    case "add":
      return store.add(store_target, content);
    case "replace":
      if (!args.old_text)
        return {
          success: false,
          error:
            "old_text is required for 'replace': a short unique substring of the entry to change.",
          current_entries: await store.entries(store_target),
        };
      return store.replace(store_target, args.old_text, content);
    case "remove":
      if (!args.old_text)
        return {
          success: false,
          error:
            "old_text is required for 'remove': a short unique substring of the entry to delete.",
          current_entries: await store.entries(store_target),
        };
      return store.remove(store_target, args.old_text);
    default:
      return {
        success: false,
        error:
          "Give an action (add, replace or remove) or an 'operations' list.",
      };
  }
}
