// What changed in what a colleague's request may read, said once rather than done silently (10-14):
// a version that reads the folders where the work lives when a colleague asks tells its person so
// in their latest conversation the first time it runs in an office, with where to turn it off; and
// the services where a team tracks its work, now read for colleagues' requests unless turned off,
// stay off for any the person had connected while the screen said "off until you turn it on".

import { readFile } from "node:fs/promises";
import { appendMessage, createChat, listChats } from "../chat/store.ts";
import { setForColleagues } from "../connectors/colleagues.ts";
import { connectedConnectors } from "../connectors/oauth.ts";
import { listFlows } from "../flows/store.ts";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import { readPreferences } from "../server/preferences.ts";
import { words } from "../server/words.ts";

/** The notice this version says once. */
const NOTICE = "colleague-reads-10-14";

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

/** Says it once, the first time the office runs on this version; quietly does nothing after. */
export async function announceColleagueReads(): Promise<void> {
  // Taken under the lock first, so two processes never say it twice.
  const first = await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    const told = Array.isArray(settings.notices) ? settings.notices : [];
    if (told.includes(NOTICE)) return false;
    await writeSettings(
      `${JSON.stringify({ ...settings, notices: [...told, NOTICE] }, null, 2)}\n`,
    );
    return true;
  });
  if (!first) return;
  // Services connected before, with nothing decided for colleagues: they stay as they were, off.
  const decided =
    (
      (await readSettings()).connectors as
        | { forColleagues?: Record<string, boolean> }
        | undefined
    )?.forColleagues ?? {};
  for (const service of await connectedConnectors().catch(() => []))
    if (!(service.id in decided))
      await setForColleagues(service.id, false).catch(() => {});
  if (!(await readPreferences()).answerFromWork) return;
  const w = await words();
  const flows = new Set((await listFlows()).map((flow) => flow.chat));
  const latest = (await listChats(30)).find((chat) => !flows.has(chat.id));
  const chat = latest ?? (await createChat(w.office("noticeTitle")));
  await appendMessage(chat.id, "minime", w.office("answerFromWorkNotice"));
}
