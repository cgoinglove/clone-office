// Reading other tools' record files safely, however large they grow. A file is never read whole:
// lines are read a chunk at a time, a line longer than the limit (a pasted image, a huge tool
// result) is skipped instead of held in memory, and time-ordered logs can be read from the end
// so the newest records come first and reading stops at a time window or a size budget.

import { open } from "node:fs/promises";

/** Lines longer than this are skipped: Claude Code records can carry images tens of MB long. */
export const MAX_LINE_BYTES = 2 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
const NEWLINE = 0x0a;

export interface LineAt {
  line: string;
  /** Byte offset just past this line's newline: where reading resumes next time. */
  end: number;
  /** The line was over the limit: `line` is empty, but `end` still moves past it. */
  skipped?: boolean;
}

/**
 * Complete lines from `start`, in order, each with the offset after it. A last line without a
 * newline is not yielded (it may still be being written); resume from the last `end` next time.
 */
export async function* boundedLines(
  file: string,
  { start = 0, maxLine = MAX_LINE_BYTES } = {},
): AsyncGenerator<LineAt> {
  const handle = await open(file, "r");
  try {
    const chunk = Buffer.alloc(CHUNK_BYTES);
    let parts: Buffer[] = [];
    let partBytes = 0;
    let skipping = false;
    let position = start;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, CHUNK_BYTES, position);
      if (bytesRead === 0) return;
      let from = 0;
      for (;;) {
        const at = chunk.indexOf(NEWLINE, from);
        if (at === -1 || at >= bytesRead) break;
        const end = position + at + 1;
        const tail = chunk.subarray(from, at);
        const bytes = partBytes + tail.length;
        if (!skipping && bytes <= maxLine) {
          const line = partBytes
            ? Buffer.concat([...parts, tail], bytes).toString("utf8")
            : tail.toString("utf8");
          yield { line: line.endsWith("\r") ? line.slice(0, -1) : line, end };
        } else yield { line: "", end, skipped: true };
        parts = [];
        partBytes = 0;
        skipping = false;
        from = at + 1;
      }
      if (!skipping && from < bytesRead) {
        const rest = chunk.subarray(from, bytesRead);
        if (partBytes + rest.length > maxLine) {
          parts = [];
          partBytes = 0;
          skipping = true;
        } else {
          parts.push(Buffer.from(rest));
          partBytes += rest.length;
        }
      }
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
}

/**
 * Complete lines from the end of a file backwards, newest first, reading at most `maxBytes`.
 * For logs that only grow at the end, such as an AI tool's history of what the person typed.
 */
export async function* tailLines(
  file: string,
  { maxBytes = 8 * 1024 * 1024, maxLine = MAX_LINE_BYTES } = {},
): AsyncGenerator<string> {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const floor = Math.max(0, size - maxBytes);
    let position = size;
    let carry = Buffer.alloc(0);
    let skipping = false;
    while (position > floor) {
      const length = Math.min(CHUNK_BYTES, position - floor);
      position -= length;
      const chunk = Buffer.alloc(length);
      await handle.read(chunk, 0, length, position);
      let buffer = carry.length ? Buffer.concat([chunk, carry]) : chunk;
      let at = buffer.lastIndexOf(NEWLINE, buffer.length - 1);
      // The file's own last newline ends the last line; skip that empty remainder.
      let end = buffer.length;
      while (at !== -1) {
        const piece = buffer.subarray(at + 1, end);
        if (!skipping && piece.length) {
          const line = piece.toString("utf8");
          yield line.endsWith("\r") ? line.slice(0, -1) : line;
        }
        skipping = false;
        end = at;
        at = at > 0 ? buffer.lastIndexOf(NEWLINE, at - 1) : -1;
      }
      carry = buffer.subarray(0, end);
      if (carry.length > maxLine) {
        carry = Buffer.alloc(0);
        skipping = true;
      }
      buffer = Buffer.alloc(0);
    }
    // The first line of the file, when the whole file fit in the budget.
    if (floor === 0 && !skipping && carry.length) {
      const line = carry.toString("utf8");
      yield line.endsWith("\r") ? line.slice(0, -1) : line;
    }
  } finally {
    await handle.close();
  }
}

/** Run `work` over `items` with at most `limit` running at once, keeping the order of results. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index], index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

/** The first `bytes` of a file as text: for small notes that must never be read whole if huge. */
export async function readHead(
  file: string,
  bytes = 64 * 1024,
): Promise<string> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}
