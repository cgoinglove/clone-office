// The computer stays awake while the mini-me works (a brain run: an answer to a colleague, a
// learning, a turn of a conversation), as Orca keeps it awake while its agents run: a laptop that
// sleeps in the middle of an answer leaves a colleague waiting. Only while working; where the
// system offers no way (Windows for now), nothing happens.

import { type ChildProcess, spawn } from "node:child_process";

let holders = 0;
let keeper: ChildProcess | undefined;

/** The command that keeps the system from sleeping until it is stopped or this process ends. */
export function awakeCommand(
  platform: NodeJS.Platform = process.platform,
  pid = process.pid,
): [string, string[]] | undefined {
  if (platform === "darwin") return ["caffeinate", ["-i", "-w", String(pid)]];
  if (platform === "linux")
    return [
      "systemd-inhibit",
      [
        "--what=idle:sleep",
        "--who=sub-office",
        "--why=Your clone is working",
        "--mode=block",
        "sh",
        "-c",
        `while kill -0 ${pid} 2>/dev/null; do sleep 30; done`,
      ],
    ];
  return undefined;
}

/** Keep the computer awake until the returned function is called; overlapping work shares one. */
export function keepAwake(): () => void {
  holders += 1;
  if (holders === 1 && !keeper) {
    const command = awakeCommand();
    if (command)
      try {
        keeper = spawn(/*turbopackIgnore: true*/ command[0], command[1], {
          stdio: "ignore",
        });
        // Not installed or not allowed: the work goes on, only without the guard.
        keeper.on("error", () => {
          keeper = undefined;
        });
        keeper.unref();
      } catch {
        keeper = undefined;
      }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0 && keeper) {
      keeper.kill();
      keeper = undefined;
    }
  };
}
