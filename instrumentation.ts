// Run once when the app's server starts: the person's messenger connects then, and their office
// work starts (the office open here, the loop that answers colleagues), so what comes from their
// phone or their team is answered even before this computer's page is opened. Their flows keep
// their times from then on too, and once they are past the first steps (which choose the folders
// left out), the search index is kept caught up. The skills the app ships are brought in, as
// Hermes Agent syncs its bundled skills on start.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMessenger } = await import("./features/minime/messenger/bridge");
  const { startOfficeOnBoot } = await import("./features/minime/office/boot");
  const { bringShippedSkills } = await import(
    "./features/minime/brain/session"
  );
  const { sealKeptFiles } = await import("./features/minime/server/secret");
  const { keysPath } = await import("./features/minime/brain/choice");
  // Not waited for: the server answers pages meanwhile.
  void sealKeptFiles([keysPath()]).catch(() => {});
  void startMessenger();
  void startOfficeOnBoot();
  void bringShippedSkills();
  const { keepFlowsRunning } = await import("./features/minime/flows/run");
  keepFlowsRunning();
  const { isOnboarded } = await import("./features/minime/server/onboarded");
  if (isOnboarded()) {
    const { keepIndexFresh } = await import(
      "./features/minime/history/indexer"
    );
    keepIndexFresh();
  }
}
