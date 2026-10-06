// Run once when the app's server starts: the person's messenger connects then, so what they write
// from their phone is answered even before this computer's page is opened.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMessenger } = await import("./features/minime/messenger/bridge");
  // Not waited for: the server answers pages meanwhile.
  void startMessenger();
}
