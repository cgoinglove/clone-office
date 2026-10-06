// One line for something the mini-me kept, like Hermes' "💾 Memory updated", for the screen and for
// the conversation's record alike.

export function savedText(event: Record<string, unknown>): string | undefined {
  if (event.type === "memory") {
    const ops = event.operations as
      | { action: string; content?: string }[]
      | undefined;
    const first =
      ops?.find((op) => op.content)?.content ??
      (event.content as string | undefined);
    const preview = first
      ? first.length > 70
        ? `${first.slice(0, 70)}…`
        : first
      : "";
    return ops && ops.length > 1
      ? `${preview} (+${ops.length - 1})`
      : preview || String(event.action);
  }
  if (event.type === "skill" || event.type === "note")
    return ((event.changes as string[] | undefined) ?? []).join(", ");
  return undefined;
}
