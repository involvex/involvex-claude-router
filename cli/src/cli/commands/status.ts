import path from "node:path";
import net from "node:net";
import fs from "node:fs";

const PID_FILE = path.join(process.cwd(), ".claude", "router.pid");
const ROUTER_PORT = 20128;

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkPortInUse(port: number): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const testServer = net.createServer();
    testServer.once("error", () => resolve(true));
    testServer.listen(port, "127.0.0.1", () => {
      testServer.close(() => resolve(false));
    });
    testServer.on("error", () => resolve(true));
  });
}

export async function status(argv: string[] = []): Promise<void> {
  const json = argv.includes("--json");
  const pidFileExists = fs.existsSync(PID_FILE);

  if (!pidFileExists) {
    if (json) {
      console.log(
        JSON.stringify(
          { running: false, reason: "no-pid-file", port: ROUTER_PORT },
          null,
          2,
        ),
      );
      return;
    }
    console.log("stopped");
    return;
  }

  const pid = Number(fs.readFileSync(PID_FILE, "utf8"));

  if (!json) {
    try {
      process.kill(pid, 0);
      console.log("running (PID:", pid, ")");
    } catch {
      console.log("stopped (stale pid)");
    }
    return;
  }

  // JSON output
  const isRunning = isProcessRunning(pid);
  const portInUse = await checkPortInUse(ROUTER_PORT);
  const statusData = {
    running: isRunning,
    pid: isRunning ? pid : null,
    port: ROUTER_PORT,
    portInUse: portInUse,
    pidFile: PID_FILE,
    stale: pidFileExists && !isRunning,
  };

  console.log(JSON.stringify(statusData, null, 2));
}

export { PID_FILE, ROUTER_PORT, isProcessRunning, checkPortInUse };
