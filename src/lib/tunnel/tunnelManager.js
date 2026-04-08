import {
  spawnCloudflared,
  spawnQuickCloudflared,
  killCloudflared,
  isCloudflaredRunning,
  setUnexpectedExitHandler,
} from "./cloudflared.js";
import { getSettings, updateSettings } from "@/lib/localDb";
import { loadState, saveState } from "./state.js";
import crypto from "crypto";

const TUNNEL_WORKER_URL =
  process.env.TUNNEL_WORKER_URL ||
  (process.env.TUNNEL_DOMAIN
    ? `https://${process.env.TUNNEL_DOMAIN}`
    : "https://involvex-claude-router.involvex.workers.dev");
const MACHINE_ID_SALT = "9router-tunnel-salt";
const API_KEY_SECRET = "9router-tunnel-api-key-secret";
// Cloud routing worker uses a different HMAC secret for its API keys
const CLOUD_API_KEY_SECRET = "endpoint-proxy-api-key-secret";
const SHORT_ID_LENGTH = 6;
const SHORT_ID_CHARS = "abcdefghijklmnpqrstuvwxyz23456789";
const RECONNECT_DELAYS_MS = [5000, 15000, 30000];

let isReconnecting = false;

function generateShortId() {
  let result = "";
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    result += SHORT_ID_CHARS.charAt(
      Math.floor(Math.random() * SHORT_ID_CHARS.length),
    );
  }
  return result;
}

function getMachineId() {
  try {
    const { machineIdSync } = require("node-machine-id");
    const raw = machineIdSync();
    return crypto
      .createHash("sha256")
      .update(raw + MACHINE_ID_SALT)
      .digest("hex")
      .substring(0, 16);
  } catch {
    return crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  }
}

function generateApiKey(machineId, secret = API_KEY_SECRET) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let keyId = "";
  for (let i = 0; i < 6; i++) {
    keyId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const crc = crypto
    .createHmac("sha256", secret)
    .update(machineId + keyId)
    .digest("hex")
    .slice(0, 8);
  return `sk-${machineId}-${keyId}-${crc}`;
}

/** Generate a cloud-routing-compatible API key (HMAC with cloud secret). */
function generateCloudApiKey(machineId) {
  return generateApiKey(machineId, CLOUD_API_KEY_SECRET);
}

async function workerFetch(reqPath, options = {}, retries = 3) {
  const RETRY_DELAYS = [2000, 5000, 10000];

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `${TUNNEL_WORKER_URL}${reqPath}`;
      if (attempt > 0) {
        console.log(
          `[Tunnel] Worker API retry ${attempt + 1}/${retries + 1} for ${reqPath}...`,
        );
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
      }

      const res = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers },
      });

      if (!res.ok && attempt < retries) {
        const errText = await res.text().catch(() => "");
        console.warn(`[Tunnel] Worker API ${res.status}: ${errText}`);
        continue; // Retry
      }

      return await res.json();
    } catch (err) {
      console.error(
        `[Tunnel] Worker API error (attempt ${attempt + 1}):`,
        err.message,
      );
      if (attempt >= retries) {
        throw err;
      }
    }
  }
}

export async function enableTunnel() {
  const existing = loadState();
  if (existing && existing.tunnelUrl && isCloudflaredRunning()) {
    return {
      success: true,
      tunnelUrl: existing.tunnelUrl,
      shortId: existing.shortId,
      alreadyRunning: true,
    };
  }

  killCloudflared();

  const machineId = getMachineId();
  const shortId = existing?.shortId || generateShortId();
  const apiKey = existing?.apiKey || generateApiKey(machineId);

  console.log(`[Tunnel] Creating session with worker ${TUNNEL_WORKER_URL}...`);
  const sessionResult = await workerFetch("/api/session/create", {
    method: "POST",
    body: JSON.stringify({ apiKey, shortId }),
  });

  if (sessionResult.error) {
    throw new Error(`Session creation failed: ${sessionResult.error}`);
  }
  console.log(`[Tunnel] Session created, shortId: ${shortId}`);

  console.log(`[Tunnel] Provisioning tunnel...`);
  const tunnelResult = await workerFetch("/api/tunnel/create", {
    method: "POST",
    body: JSON.stringify({ apiKey }),
  });

  if (tunnelResult.error) {
    throw new Error(`Tunnel provisioning failed: ${tunnelResult.error}`);
  }

  console.log(
    `[Tunnel] Tunnel mode: ${tunnelResult.mode}, hostname: ${tunnelResult.hostname}`,
  );

  let hostname = tunnelResult.hostname;
  let tunnelUpstreamUrl = null;
  if (tunnelResult.mode === "quick") {
    const localPort = process.env.PORT || "20128";
    console.log(`[Tunnel] Starting quick tunnel to localhost:${localPort}...`);
    const quick = await spawnQuickCloudflared(`http://localhost:${localPort}`);
    tunnelUpstreamUrl = quick.url;
    console.log(`[Tunnel] Quick tunnel URL: ${quick.url}`);
  } else {
    const { token } = tunnelResult;
    console.log(`[Tunnel] Starting token-based tunnel...`);
    await spawnCloudflared(token);
  }

  const cloudApiKey = existing?.cloudApiKey || generateCloudApiKey(machineId);
  const publicTunnelUrl = hostname?.startsWith("http")
    ? hostname
    : `https://${hostname}`;
  if (!tunnelUpstreamUrl) {
    tunnelUpstreamUrl = publicTunnelUrl;
  }

  saveState({
    shortId,
    apiKey,
    cloudApiKey,
    tunnelUrl: publicTunnelUrl,
    machineId,
  });

  await updateSettings({ tunnelEnabled: true, tunnelUrl: publicTunnelUrl });

  // Register tunnel URL with cloud routing worker so it can proxy requests
  try {
    const { getCloudUrl } = await import("@/lib/localDb");
    const cloudUrl = await getCloudUrl();
    console.log(`[Tunnel] Registering with cloud worker at ${cloudUrl}...`);
    const regRes = await fetch(`${cloudUrl}/api/tunnel/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cloudApiKey}`,
      },
      body: JSON.stringify({ tunnelUrl: tunnelUpstreamUrl, shortId }),
    });
    if (!regRes.ok) {
      const errBody = await regRes.text().catch(() => "");
      console.warn(
        `[Tunnel] Cloud registration returned ${regRes.status}:`,
        errBody,
      );
    } else {
      console.log(`[Tunnel] Cloud registration successful`);
    }
  } catch (err) {
    // Non-fatal — tunnel still works for direct access
    console.warn(
      "[Tunnel] Failed to register tunnel URL with cloud worker:",
      err.message,
    );
  }

  // Register exit handler for auto-reconnect on unexpected crash/sleep-wake
  setUnexpectedExitHandler(() => scheduleReconnect(0));

  return { success: true, tunnelUrl: publicTunnelUrl, shortId };
}

async function scheduleReconnect(attempt) {
  if (isReconnecting) return;
  isReconnecting = true;

  const delay =
    RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
  console.log(
    `[Tunnel] Unexpected exit detected, reconnecting in ${delay / 1000}s (attempt ${attempt + 1})...`,
  );

  await new Promise(r => setTimeout(r, delay));

  try {
    const settings = await getSettings();
    if (!settings.tunnelEnabled) {
      console.log("[Tunnel] Tunnel disabled, skipping reconnect");
      isReconnecting = false;
      return;
    }
    await enableTunnel();
    console.log("[Tunnel] Reconnected successfully");
    isReconnecting = false;
  } catch (err) {
    console.log(
      `[Tunnel] Reconnect attempt ${attempt + 1} failed:`,
      err.message,
    );
    isReconnecting = false;
    const nextAttempt = attempt + 1;
    if (nextAttempt < RECONNECT_DELAYS_MS.length) {
      scheduleReconnect(nextAttempt);
    } else {
      console.log("[Tunnel] All reconnect attempts exhausted");
    }
  }
}

export async function disableTunnel() {
  const state = loadState();

  killCloudflared();

  if (state?.apiKey) {
    try {
      await workerFetch("/api/tunnel/delete", {
        method: "DELETE",
        body: JSON.stringify({ apiKey: state.apiKey }),
      });
    } catch {
      /* ignore worker errors on disable */
    }
  }

  // Also unregister tunnel URL from cloud routing worker
  if (state?.cloudApiKey) {
    try {
      const { getCloudUrl } = await import("@/lib/localDb");
      const cloudUrl = await getCloudUrl();
      await fetch(`${cloudUrl}/api/tunnel/register`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.cloudApiKey}`,
        },
        body: JSON.stringify({ shortId: state.shortId }),
      });
    } catch {
      /* ignore */
    }
  }

  if (state) {
    saveState({
      shortId: state.shortId,
      apiKey: state.apiKey,
      cloudApiKey: state.cloudApiKey,
      machineId: state.machineId,
      tunnelUrl: null,
    });
  }

  await updateSettings({ tunnelEnabled: false, tunnelUrl: "" });

  return { success: true };
}

export async function getTunnelStatus() {
  const state = loadState();
  const running = isCloudflaredRunning();
  const settings = await getSettings();

  return {
    enabled: settings.tunnelEnabled === true && running,
    tunnelUrl: state?.tunnelUrl || "",
    shortId: state?.shortId || "",
    running,
  };
}
