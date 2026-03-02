import { parseApiKey, extractBearerToken } from "../utils/apiKey.js";
import * as log from "../utils/logger.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const TUNNEL_URL_TTL = 7 * 24 * 60 * 60; // 7 days

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
    await env.KV.delete(kvKey);
    log.info("TUNNEL", "Tunnel URL unregistered", { machineId });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  }

  // POST: register tunnel URL
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const { tunnelUrl } = body;
  if (!tunnelUrl || !tunnelUrl.startsWith("https://")) {
    return new Response(
      JSON.stringify({ error: "tunnelUrl must be an https:// URL" }),
      { status: 400, headers: CORS_HEADERS },
    );
  }

  await env.KV.put(kvKey, tunnelUrl, { expirationTtl: TUNNEL_URL_TTL });

  // Also store as 'default' for unauthenticated browser requests
  await env.KV.put("tunnel:default", tunnelUrl, {
    expirationTtl: TUNNEL_URL_TTL,
  });

  log.info("TUNNEL", "Tunnel URL registered", { machineId, tunnelUrl });

  return new Response(JSON.stringify({ success: true, machineId, tunnelUrl }), {
    status: 200,
    headers: CORS_HEADERS,
  });
}
