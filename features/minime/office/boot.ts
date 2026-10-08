// When the app's server starts, the person's office work starts with it, as their messenger does:
// the office open on this computer (its relay, which teammates depend on) and the loop that answers
// colleagues' requests. Before, both waited for a page to ask about the office, so a clone whose
// person had not opened the app did not answer anyone.

import { ownUrl } from "../server/here.ts";
import { personLanguage } from "../server/language.ts";
import { loadOffice } from "./client.ts";
import { resumeHosting } from "./host.ts";
import { startOffice } from "./worker.ts";

/** The app's own gate, where the clone's tool server puts its questions. */
export const ownGate = () => `${ownUrl()}/api/me/gate`;

export async function startOfficeOnBoot(): Promise<void> {
  try {
    await resumeHosting();
    if (!(await loadOffice())) return;
    startOffice(ownGate(), await personLanguage());
  } catch (error) {
    console.error(`office: ${(error as Error).message}`);
  }
}
