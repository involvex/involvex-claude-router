// import { execSync } from 'node:child_process';
// import path from 'node:path';
// import fs from 'node:fs';
import killport from "kill-port";

// const PID_FILE = path.join(process.cwd(), '.claude', 'router.pid');

// export async function stop(_argv: string[] = []) {
//   if (!fs.existsSync(PID_FILE)) {
//     console.log('Router not running (no pid file)');
//     return;
//   }
//   const pid = Number(fs.readFileSync(PID_FILE, 'utf8'));
//   if (!pid) {
//     console.log('Invalid pid file');
//     return;
//   }

//   try {
//     if (process.platform === 'win32') {
//       execSync(`taskkill /PID ${pid} /T /F`);
//     } else {
//       process.kill(pid, 'SIGTERM');
//     }
//     fs.unlinkSync(PID_FILE);
//     console.log('Router stopped');
//   } catch (err: unknown) {
//     // Process already gone — clean up stale pid file and report success
//     const msg = err instanceof Error ? err.message : String(err);
//     const isNotFound =
//       msg.includes('not found') ||
//       msg.includes('nicht gefunden') ||
//       msg.includes('ESRCH') ||
//       (err as { status?: number })?.status === 128;
//     if (isNotFound) {
//       fs.unlinkSync(PID_FILE);
//       console.log('Router was not running (stale pid), cleaned up');
//     } else {
//       console.error('Failed to stop router:', err);
//     }
//   }
// }

export async function stop() {
  console.log("Stopping router...");
  console.log("Killing process on port 20128...");
  try {
    await killport(20128);
    console.log("Router stopped");
  } catch (err) {
    console.error("Failed to stop router:", err);
  }
  console.log("Done!");
  return;
}
