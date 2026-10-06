// Keeping folders out from then on, from the screen or when the person asks their mini-me in a
// conversation: saved in settings.json, and what the search index holds from them is removed at
// once. Bringing a folder back is only done on the screen, by the person.

import { readFile } from "node:fs/promises";
import { forgetExcluded } from "../history/indexer.ts";
import { loadExcludes, settingsPath, writeSettings } from "./exclude.ts";

/** Save the whole list of what is kept out; the rest of settings.json is kept as it is. */
export async function saveExcludes(list: string[]): Promise<string[]> {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    // No settings yet.
  }
  const exclude = [...new Set(list.map((p) => p.trim()).filter(Boolean))];
  await writeSettings(JSON.stringify({ ...settings, exclude }, null, 2));
  try {
    forgetExcluded(exclude);
  } catch {
    // The index is busy; its next pass removes them.
  }
  return exclude;
}

export const LEAVE_OUT_TOOL = {
  name: "leave_out_folder",
  description:
    'Keep a folder out of everything you read and search from now on, when your person asks you to ("don\'t look at my client work"). Give its full path (~ for the home folder), or a folder name that matches it wherever it is; * matches any characters inside one name, so client-* keeps out every folder whose name starts with client-. They are asked first, with the folder shown. What the search held from it is removed at once; what your memory already holds stays, and they can remove those lines on their page. Bringing a folder back is theirs to do on their page.',
  inputSchema: {
    type: "object",
    properties: {
      folder: {
        type: "string",
        description: "A full path, or a folder name (with * if needed).",
      },
    },
    required: ["folder"],
  },
};

export async function leaveOut(
  args: Record<string, unknown>,
): Promise<{ result: string; isError: boolean }> {
  const folder = typeof args.folder === "string" ? args.folder.trim() : "";
  if (!folder || folder.length > 500)
    return {
      result: "Give one folder: its full path, or its name.",
      isError: true,
    };
  const before = loadExcludes();
  if (before.includes(folder))
    return { result: `${folder} was already left out.`, isError: false };
  await saveExcludes([...before, folder]);
  return {
    result: `Left out ${folder}: from now on you neither read nor search it, and what the search held from it is gone. What your memory already holds stays; they can remove lines on their page.`,
    isError: false,
  };
}
