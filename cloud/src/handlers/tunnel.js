import { parseApiKey, extractBearerToken } from "../utils/apiKey.js";
import * as log from "../utils/logger.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const TUNNEL_URL_TTL = 7 * 24 * 60 * 60; // 7 days
const TUNNEL_API_KEY_SECRET = "9router-tunnel-api-key-secret";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function generateTunnelCrc(machineId, keyId) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(TUNNEL_API_KEY_SECRET);
  const data = encoder.encode(machineId + keyId);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, data);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex.slice(0, 8);
}

async function validateTunnelApiKey(apiKey) {
  if (!apiKey || !apiKey.startsWith("sk-")) return null;

  const parts = apiKey.split("-");
  if (parts.length !== 4) return null;

  const [, machineId, keyId, crc] = parts;
  const expected = await generateTunnelCrc(machineId, keyId);
  if (crc !== expected) return null;

  return { machineId, keyId };
}

/**
 * POST /api/session/create
 * Body: { apiKey, shortId }
 */
export async function handleTunnelSession(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await parseJsonBody(request);
  if (!body || !body.apiKey || !body.shortId) {
    return json({ error: "apiKey and shortId are required" }, 400);
  }

  const parsed = await validateTunnelApiKey(body.apiKey);
  if (!parsed) {
    return json({ error: "Invalid tunnel API key" }, 401);
  }

  await env.KV.put(
    `session:${body.apiKey}`,
    JSON.stringify({ shortId: body.shortId, machineId: parsed.machineId }),
    { expirationTtl: TUNNEL_URL_TTL },
  );

  return json({ success: true, shortId: body.shortId });
}

/**
 * POST /api/tunnel/create
 * Body: { apiKey }
 *
 * workers.dev-compatible mode: returns stable worker path and expects
 * the local process to register a live trycloudflare URL via /api/tunnel/register.
 */
export async function handleTunnelProvision(request, env) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await parseJsonBody(request);
  if (!body || !body.apiKey) {
    return json({ error: "apiKey is required" }, 400);
  }

  const parsed = await validateTunnelApiKey(body.apiKey);
  if (!parsed) {
    return json({ error: "Invalid tunnel API key" }, 401);
  }

  if (request.method === "DELETE") {
    await env.KV.delete(`session:${body.apiKey}`);
    await env.KV.delete(`tunnel:${parsed.machineId}`);
    return json({ success: true });
  }

  const sessionRaw = await env.KV.get(`session:${body.apiKey}`);
  if (!sessionRaw) {
    return json({ error: "Session not found" }, 404);
  }

  let session;
  try {
    session = JSON.parse(sessionRaw);
  } catch {
    return json({ error: "Invalid session data" }, 500);
  }

  const shortId = session?.shortId;
  if (!shortId) {
    return json({ error: "Session missing shortId" }, 500);
  }

  const workerBase = new URL(request.url).origin;
  const hostname = `${workerBase}/tunnel/${shortId}`;

  return json({
    success: true,
    mode: "quick",
    shortId,
    hostname,
  });
}

/**
 * Proxy handler for /tunnel/{shortId}/... requests.
 */
export async function handleTunnelProxy(request, env, path) {
  const prefix = "/tunnel/";
  if (!path.startsWith(prefix)) {
    return json({ error: "Invalid tunnel path" }, 400);
  }

  const suffix = path.slice(prefix.length);
  const [shortId, ...rest] = suffix.split("/");
  if (!shortId) {
    return json({ error: "Missing shortId" }, 400);
  }

  const targetBase =
    (await env.KV.get(`tunnel:short:${shortId}`)) ||
    (await env.KV.get("tunnel:default"));

  if (!targetBase) {
    return json({ error: "Tunnel target not found" }, 404);
  }

  let upstreamUrl;
  let incoming;
  let upstreamBase;
  try {
    incoming = new URL(request.url);
    upstreamBase = new URL(targetBase);
    upstreamUrl = new URL(targetBase);
    const pathRest = rest.length > 0 ? `/${rest.join("/")}` : "/";
    upstreamUrl.pathname = pathRest;
    upstreamUrl.search = incoming.search;
  } catch {
    return json({ error: "Invalid tunnel target" }, 500);
  }

  const upstreamReq = new Request(upstreamUrl.toString(), request);
  const upstreamRes = await fetch(upstreamReq);
  const location = upstreamRes.headers.get("location");
  if (!location) {
    return upstreamRes;
  }

  const publicPrefix = `/tunnel/${shortId}`;
  let rewrittenLocation = location;

  if (location.startsWith("/")) {
    rewrittenLocation = `${publicPrefix}${location}`;
  } else {
    try {
      const absoluteLocation = new URL(location, upstreamBase);
      if (absoluteLocation.origin === upstreamBase.origin) {
        rewrittenLocation = `${incoming.origin}${publicPrefix}${absoluteLocation.pathname}${absoluteLocation.search}${absoluteLocation.hash}`;
      }
    } catch {
      // keep original location header if it cannot be parsed
    }
  }

  const headers = new Headers(upstreamRes.headers);
  headers.set("location", rewrittenLocation);
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers,
  });
}

/**
 * POST /api/tunnel/register
 * Body: { tunnelUrl: "https://..." }
 * Auth: Bearer sk-{machineId}-{keyId}-{crc8}  (cloud routing key)
 *
 * Stores the tunnel URL for a machineId in KV so the proxy fallback can route
 * browser/API requests to the local machine.
 */
export async function handleTunnelRegister(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  if (request.method !== "POST" && request.method !== "DELETE") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  // Authenticate via Bearer token (cloud routing API key format)
  const apiKey = extractBearerToken(request);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      {
        status: 401,
        headers: CORS_HEADERS,
      },
    );
  }

  const parsed = await parseApiKey(apiKey);
  if (!parsed || !parsed.isNewFormat || !parsed.machineId) {
    return new Response(JSON.stringify({ error: "Invalid API key format" }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  const { machineId } = parsed;
  const kvKey = `tunnel:${machineId}`;

  if (request.method === "DELETE") {
    // Optional body payload to remove short mapping too
    const maybeBody = await parseJsonBody(request);
    if (maybeBody?.shortId) {
      await env.KV.delete(`tunnel:short:${maybeBody.shortId}`);
    }
    await env.KV.delete(kvKey);
    log.info("TUNNEL", "Tunnel URL unregistered", { machineId });
    return json({ success: true });
  }

  // POST: register tunnel URL
  const body = await parseJsonBody(request);
  if (!body) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const shortId = body.shortId || null;

  const { tunnelUrl } = body;
  if (!tunnelUrl || !tunnelUrl.startsWith("https://")) {
    return json({ error: "tunnelUrl must be an https:// URL" }, 400);
  }

  await env.KV.put(kvKey, tunnelUrl, { expirationTtl: TUNNEL_URL_TTL });
  if (shortId) {
    await env.KV.put(`tunnel:short:${shortId}`, tunnelUrl, {
      expirationTtl: TUNNEL_URL_TTL,
    });
  }

  // Also store as 'default' for unauthenticated browser requests
  await env.KV.put("tunnel:default", tunnelUrl, {
    expirationTtl: TUNNEL_URL_TTL,
  });

  log.info("TUNNEL", "Tunnel URL registered", { machineId, tunnelUrl });

  return json({ success: true, machineId, shortId, tunnelUrl });
}
