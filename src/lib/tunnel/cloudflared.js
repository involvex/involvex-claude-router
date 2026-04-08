import { savePid, loadPid, clearPid } from "./state.js";
import { execSync, spawn } from "child_process";
import https from "https";
import path from "path";
import os from "os";
import fs from "fs";

const BIN_DIR = path.join(os.homedir(), ".9router", "bin");
const BINARY_NAME = "cloudflared";
const IS_WINDOWS = os.platform() === "win32";
const BIN_NAME = IS_WINDOWS ? `${BINARY_NAME}.exe` : BINARY_NAME;
const BIN_PATH = path.join(BIN_DIR, BIN_NAME);

const GITHUB_BASE_URL =
  "https://github.com/cloudflare/cloudflared/releases/latest/download";

const PLATFORM_MAPPINGS = {
  darwin: {
    x64: "cloudflared-darwin-amd64.tgz",
    arm64: "cloudflared-darwin-amd64.tgz",
  },
  win32: {
    x64: "cloudflared-windows-amd64.exe",
  },
  linux: {
    x64: "cloudflared-linux-amd64",
    arm64: "cloudflared-linux-arm64",
  },
};

function getDownloadUrl() {
  const platform = os.platform();
  const arch = os.arch();

  const platformMapping = PLATFORM_MAPPINGS[platform];
  if (!platformMapping) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const binaryName = platformMapping[arch];
  if (!binaryName) {
    throw new Error(
      `Unsupported architecture: ${arch} for platform ${platform}`,
    );
  }

  return `${GITHUB_BASE_URL}/${binaryName}`;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https
      .get(url, response => {
        if ([301, 302].includes(response.statusCode)) {
          file.close();
          fs.unlinkSync(dest);
          downloadFile(response.headers.location, dest)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(
            new Error(`Download failed with status ${response.statusCode}`),
          );
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close(() => resolve(dest));
        });

        file.on("error", err => {
          file.close();
          fs.unlinkSync(dest);
          reject(err);
        });
      })
      .on("error", err => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

export async function ensureCloudflared() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  if (fs.existsSync(BIN_PATH)) {
    if (!IS_WINDOWS) {
      fs.chmodSync(BIN_PATH, "755");
    }
    return BIN_PATH;
  }

  const url = getDownloadUrl();
  const isArchive = url.endsWith(".tgz");
  const downloadDest = isArchive
    ? path.join(BIN_DIR, "cloudflared.tgz")
    : BIN_PATH;

  await downloadFile(url, downloadDest);

  if (isArchive) {
    execSync(`tar -xzf "${downloadDest}" -C "${BIN_DIR}"`, { stdio: "pipe" });
    fs.unlinkSync(downloadDest);
  }

  if (!IS_WINDOWS) {
    fs.chmodSync(BIN_PATH, "755");
  }

  return BIN_PATH;
}

let cloudflaredProcess = null;
let unexpectedExitHandler = null;

/** Register a callback to be called when cloudflared exits unexpectedly after connecting */
export function setUnexpectedExitHandler(handler) {
  unexpectedExitHandler = handler;
}

export async function spawnCloudflared(tunnelToken) {
  const binaryPath = await ensureCloudflared();

  const child = spawn(
    binaryPath,
    [
      "tunnel",
      "run",
      "--dns-resolver-addrs",
      "1.1.1.1:53",
      "--token",
      tunnelToken,
    ],
    {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  cloudflaredProcess = child;
  savePid(child.pid);

  return new Promise((resolve, reject) => {
    let connectionCount = 0;
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // Don't reject immediately on timeout - wait for any connection
        if (connectionCount > 0) {
          resolve(child);
        } else {
          reject(new Error("Timed out waiting for tunnel connection (90s)"));
        }
      }
    }, 90000);

    const handleLog = data => {
      const msg = data.toString();
      console.log("[cloudflared]", msg.trim());
      if (msg.includes("Registered tunnel connection")) {
        connectionCount++;
        if (connectionCount >= 1 && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(child);
        }
      }
      if (
        msg.includes("error") ||
        msg.includes("failed") ||
        msg.includes("Failed")
      ) {
        console.error("[cloudflared error]", msg.trim());
      }
    };

    child.stdout.on("data", handleLog);
    child.stderr.on("data", handleLog);

    child.on("error", err => {
      console.error("[cloudflared process error]", err.message);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on("exit", code => {
      cloudflaredProcess = null;
      clearPid();
      console.log(`[cloudflared] Process exited with code ${code}`);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (connectionCount === 0) {
          reject(new Error(`cloudflared exited with code ${code}`));
          return;
        }
      }
      // Notify reconnect handler if tunnel died after successful connection
      if (unexpectedExitHandler) {
        unexpectedExitHandler();
      }
    });
  });
}

export async function spawnQuickCloudflared(localUrl, retries = 3) {
  const RETRY_DELAYS = [5000, 15000, 30000];

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(
          `[cloudflared] Quick tunnel attempt ${attempt + 1}/${retries + 1}, waiting ${RETRY_DELAYS[attempt - 1] / 1000}s...`,
        );
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
      }

      return await doSpawnQuickCloudflared(localUrl);
    } catch (err) {
      console.error(
        `[cloudflared] Quick tunnel attempt ${attempt + 1} failed:`,
        err.message,
      );
      if (attempt >= retries) {
        throw new Error(
          `Quick tunnel failed after ${retries + 1} attempts: ${err.message}`,
        );
      }
    }
  }
}

async function doSpawnQuickCloudflared(localUrl) {
  const binaryPath = await ensureCloudflared();

  const child = spawn(binaryPath, ["tunnel", "--url", localUrl], {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  cloudflaredProcess = child;
  savePid(child.pid);

  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Timed out waiting for quick tunnel URL (120s)"));
      }
    }, 120000);

    const handleLog = data => {
      const msg = data.toString();
      console.log("[cloudflared quick]", msg.trim());
      const match = msg.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log(`[cloudflared] Quick tunnel ready: ${match[0]}`);
        resolve({ child, url: match[0] });
      }
      if (
        msg.includes("error") ||
        msg.includes("failed") ||
        msg.includes("Failed")
      ) {
        console.error("[cloudflared quick error]", msg.trim());
      }
    };

    child.stdout.on("data", handleLog);
    child.stderr.on("data", handleLog);

    child.on("error", err => {
      console.error("[cloudflared quick process error]", err.message);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on("exit", code => {
      cloudflaredProcess = null;
      clearPid();
      console.log(`[cloudflared quick] Process exited with code ${code}`);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`cloudflared quick tunnel exited with code ${code}`));
        return;
      }
      if (unexpectedExitHandler) {
        unexpectedExitHandler();
      }
    });
  });
}

export function killCloudflared() {
  if (cloudflaredProcess) {
    try {
      cloudflaredProcess.kill();
    } catch (e) {
      /* ignore */
    }
    cloudflaredProcess = null;
  }

  const pid = loadPid();
  if (pid) {
    try {
      process.kill(pid);
    } catch (e) {
      /* ignore */
    }
    clearPid();
  }

  // Kill any remaining cloudflared processes
  try {
    execSync("pkill -f cloudflared 2>/dev/null || true", { stdio: "ignore" });
  } catch (e) {
    /* ignore */
  }
}

export function isCloudflaredRunning() {
  const pid = loadPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}
