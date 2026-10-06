// Run once when the app's server starts: the person's messenger connects then, and their office
// work starts (the office open here, the loop that answers colleagues), so what comes from their
// phone or their team is answered even before this computer's page is opened.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMessenger } = await import("./features/minime/messenger/bridge");
  const { startOfficeOnBoot } = await import("./features/minime/office/boot");
  // Not waited for: the server answers pages meanwhile.
  void startMessenger();
  void startOfficeOnBoot();
}
