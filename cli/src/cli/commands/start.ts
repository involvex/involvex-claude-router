import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const PID_FILE = path.join(process.cwd(), ".claude", "router.pid");

export async function start(_argv: string[] = []) {
  try {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });

    if (fs.existsSync(PID_FILE)) {
      const existing = Number(fs.readFileSync(PID_FILE, "utf8"));
      if (existing) {
        try {
          process.kill(existing, 0);
          console.log("Router already running (PID:", existing, ")");
          return;
        } catch {
          // stale pid file, continue and overwrite
          console.log("Stale pid file found, starting new instance");
        }
      }
    }

    const child = spawn("bun", ["run", "dev"], {
      cwd: process.cwd(),
      stdio: "inherit",
      detached: true,
    });

    fs.writeFileSync(PID_FILE, String(child.pid));
    console.log("Router started, PID:", child.pid);
    child.unref();
  } catch (err) {
    console.error("Failed to start router:", err);
    process.exit(1);
  }
}
