import path from "node:path";
import os from "node:os";
import fs from "node:fs";

function getDataDir(): string | null {
  const appName = "involvex-claude-router";
  const homeDir = os.homedir();

  if (process.platform === "win32") {
    const appDataRoot =
      process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return path.join(appDataRoot, appName);
  }
  return path.join(homeDir, `.${appName}`);
}

export function getLogPath(): string {
  const dataDir = getDataDir();
  if (!dataDir) throw new Error("Could not determine data directory");
  return path.join(dataDir, "log.txt");
}

export async function logs(argv: string[] = []): Promise<void> {
  const follow = argv.includes("--follow") || argv.includes("-f");
  const linesArg = argv.includes("--lines")
    ? parseInt(argv[argv.indexOf("--lines") + 1], 10)
    : 50;
  const lines = isNaN(linesArg) || linesArg <= 0 ? 50 : linesArg;

  const logPath = getLogPath();

  if (!fs.existsSync(logPath)) {
    console.log("No log file found at:", logPath);
    console.log(
      "The router may not have been started yet, or no requests have been logged.",
    );
    process.exit(1);
  }

  if (follow) {
    console.log(`Tailing ${logPath} (Ctrl+C to exit)...\n`);
    const { spawn } = await import("node:child_process");

    let tail: ReturnType<typeof spawn> | null = null;
    try {
      tail = spawn("tail", ["-f", logPath], { stdio: "inherit" });
      await new Promise<void>((_, __) => {
        if (!tail) return;
        tail.on("error", () => {
          console.error("tail command not available on this platform");
          process.exit(1);
        });
        process.on("SIGINT", () => {
          tail!.kill();
          process.exit(0);
        });
        process.on("SIGTERM", () => {
          tail!.kill();
          process.exit(0);
        });
      });
    } catch {
      console.error("tail command not available on this platform");
      process.exit(1);
    }
  } else {
    try {
      const content = fs.readFileSync(logPath, "utf-8");
      const allLines = content.split("\n").filter(Boolean);
      const recent = allLines.slice(-lines);
      console.log(recent.join("\n"));
    } catch (err: unknown) {
      console.error(
        "Error reading log file:",
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  }
}
