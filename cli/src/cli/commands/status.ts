import path from "node:path";
import fs from "node:fs";

const PID_FILE = path.join(process.cwd(), ".claude", "router.pid");

export async function status(_argv: string[] = []) {
  if (!fs.existsSync(PID_FILE)) {
    console.log("stopped");
    return;
  }
  const pid = Number(fs.readFileSync(PID_FILE, "utf8"));
  try {
    process.kill(pid, 0);
    console.log("running (PID:", pid, ")");
  } catch {
    console.log("stopped (stale pid)");
  }
}
