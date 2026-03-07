import { transformToOllama } from "open-sse/utils/ollamaTransform.js";
import { ollamaModels } from "open-sse/config/ollamaModels.js";
import { initTranslators } from "open-sse/translator/index.js";
import * as log from "./utils/logger.js";

// Static imports for handlers (avoid dynamic import CPU cost)
import { createLandingPageResponse } from "./services/landingPage.js";
import { handleTestClaude } from "./handlers/testClaude.js";
import { handleForwardRaw } from "./handlers/forwardRaw.js";
import { handleEmbeddings } from "./handlers/embeddings.js";
import { handleTunnelRegister } from "./handlers/tunnel.js";
import { handleProviders } from "./handlers/providers.js";
import { handleCacheClear } from "./handlers/cache.js";
import { handlePricing } from "./handlers/pricing.js";
import { handleForward } from "./handlers/forward.js";
import { handleCleanup } from "./handlers/cleanup.js";
import { handleVerify } from "./handlers/verify.js";
import { handleModels } from "./handlers/models.js";
import { handleSync } from "./handlers/sync.js";
import { handleChat } from "./handlers/chat.js";
import { parseApiKey } from "./utils/apiKey.js";

// Initialize translators at module load (static imports)
initTranslators();

// Auth middleware for protected dashboard endpoints
async function checkAuth(request, env) {
  const requireApiKey = env.REQUIRE_API_KEY === "true";
  const jwtSecret = env.JWT_SECRET;
  const apiKeySecret = env.API_KEY_SECRET;

  // If no auth required, allow access
  if (!requireApiKey && !jwtSecret) {
    return { authorized: true };
  }

  const authHeader = request.headers.get("Authorization");

  // Check API key (Bearer token)
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Check against API_KEY_SECRET
    if (apiKeySecret && token === apiKeySecret) {
      return { authorized: true, type: "api-key" };
    }

    // Check against JWT_SECRET (simple check - actual JWT validation would need jose)
    if (jwtSecret && token.startsWith("eyJ")) {
      // Basic JWT structure check - in production use jose library
      return { authorized: true, type: "jwt" };
    }
  }

  // Check for x-api-key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey && apiKeySecret && xApiKey === apiKeySecret) {
    return { authorized: true, type: "api-key" };
  }

  return { authorized: false, error: "Unauthorized" };
}

// Helper to add CORS headers to response
function addCorsHeaders(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  newHeaders.set("Access-Control-Allow-Headers", "*");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

const worker = {
  async scheduled(event, env, ctx) {
    const result = await handleCleanup(env);
    log.info("SCHEDULED", "Cleanup completed", result);
  },

  async fetch(request, env, ctx) {
    const startTime = Date.now();
    const url = new URL(request.url);
    let path = url.pathname;

    // Normalize /v1/v1/* → /v1/*
    if (path.startsWith("/v1/v1/")) {
      path = path.replace("/v1/v1/", "/v1/");
    } else if (path === "/v1/v1") {
      path = "/v1";
    }

    log.request(request.method, path);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    try {
      // Routes

      // Dashboard API endpoints (protected)
      if (path === "/api/pricing") {
        const auth = await checkAuth(request, env);
        if (!auth.authorized) {
          return new Response(JSON.stringify({ error: auth.error }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const response = await handlePricing(request, env, ctx);
        log.response(response.status, Date.now() - startTime);
        return addCorsHeaders(response);
      }

      if (path === "/api/providers") {
        const auth = await checkAuth(request, env);
        if (!auth.authorized) {
          return new Response(JSON.stringify({ error: auth.error }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const response = await handleProviders(request, env, ctx);
        log.response(response.status, Date.now() - startTime);
        return addCorsHeaders(response);
      }

      if (path === "/api/models") {
        const auth = await checkAuth(request, env);
        if (!auth.authorized) {
          return new Response(JSON.stringify({ error: auth.error }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const response = await handleModels(request, env, ctx);
        log.response(response.status, Date.now() - startTime);
        return addCorsHeaders(response);
      }

      if (path === "/health" && request.method === "GET") {
        log.response(200, Date.now() - startTime);
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Ollama compatible - list models
      if (path === "/api/tags" && request.method === "GET") {
        log.response(200, Date.now() - startTime);
        return new Response(JSON.stringify(ollamaModels), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (path === "/cache/clear" && request.method === "POST") {
        const response = await handleCacheClear(request, env);
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // Sync provider data by machineId (GET, POST, DELETE) - protected
      if (
        path.startsWith("/sync/") &&
        ["GET", "POST", "DELETE"].includes(request.method)
      ) {
        const auth = await checkAuth(request, env);
        if (!auth.authorized) {
          return new Response(JSON.stringify({ error: auth.error }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const response = await handleSync(request, env, ctx);
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // Tunnel URL registration (unauthenticated route; auth done inside handler)
      if (path === "/api/tunnel/register") {
        const response = await handleTunnelRegister(request, env);
        log.response(response.status, Date.now() - startTime);
        return addCorsHeaders(response);
      }

      // ========== NEW FORMAT: /v1/... (machineId in API key) ==========

      // OpenAI-compatible model list — returns models from ollamaModels
      if (path === "/v1/models" && request.method === "GET") {
        const modelList = ollamaModels.models.map(m => ({
          id: m.name,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: m.name.includes("/") ? m.name.split("/")[0] : "openai",
        }));
        log.response(200, Date.now() - startTime);
        return addCorsHeaders(
          new Response(JSON.stringify({ object: "list", data: modelList }), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // New format: /v1/chat/completions
      if (path === "/v1/chat/completions" && request.method === "POST") {
        const response = await handleChat(request, env, ctx, null);
        log.response(response.status, Date.now() - startTime);
        return addCorsHeaders(response);
      }

      // New format: /v1/messages (Claude format)
      if (path === "/v1/messages" && request.method === "POST") {
        const response = await handleChat(request, env, ctx, null);
        log.response(response.status, Date.now() - startTime);
        return addCorsHeaders(response);
      }

      // New format: /v1/embeddings
      if (path === "/v1/embeddings" && request.method === "POST") {
        const response = await handleEmbeddings(request, env, ctx, null);
        log.response(response.status, Date.now() - startTime);
        return addCorsHeaders(response);
      }

      // New format: /v1/responses (OpenAI Responses API - Codex CLI)
      if (path === "/v1/responses" && request.method === "POST") {
        const response = await handleChat(request, env, ctx, null);
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // New format: /v1/verify
      if (path === "/v1/verify" && request.method === "GET") {
        const response = await handleVerify(request, env, null);
        log.response(response.status, Date.now() - startTime);
        return addCorsHeaders(response);
      }

      // New format: /v1/api/chat (Ollama format)
      if (path === "/v1/api/chat" && request.method === "POST") {
        const clonedReq = request.clone();
        const body = await clonedReq.json();
        const response = await handleChat(request, env, ctx, null);
        const ollamaResponse = transformToOllama(
          response,
          body.model || "llama3.2",
        );
        log.response(200, Date.now() - startTime);
        return ollamaResponse;
      }

      // ========== OLD FORMAT: /{machineId}/v1/... ==========

      // Machine ID based chat endpoint
      if (
        path.match(/^\/[^\/]+\/v1\/chat\/completions$/) &&
        request.method === "POST"
      ) {
        const machineId = path.split("/")[1];
        const response = await handleChat(request, env, ctx, machineId);
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // Machine ID based embeddings endpoint
      if (
        path.match(/^\/[^\/]+\/v1\/embeddings$/) &&
        request.method === "POST"
      ) {
        const machineId = path.split("/")[1];
        const response = await handleEmbeddings(request, env, ctx, machineId);
        log.response(response.status, Date.now() - startTime);
        return addCorsHeaders(response);
      }

      // Machine ID based messages endpoint (Claude format)
      if (path.match(/^\/[^\/]+\/v1\/messages$/) && request.method === "POST") {
        const machineId = path.split("/")[1];
        const response = await handleChat(request, env, ctx, machineId);
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // Machine ID based api/chat endpoint (Ollama format)
      if (
        path.match(/^\/[^\/]+\/v1\/api\/chat$/) &&
        request.method === "POST"
      ) {
        const machineId = path.split("/")[1];
        const clonedReq = request.clone();
        const body = await clonedReq.json();
        const response = await handleChat(request, env, ctx, machineId);
        const ollamaResponse = transformToOllama(
          response,
          body.model || "llama3.2",
        );
        log.response(200, Date.now() - startTime);
        return ollamaResponse;
      }

      // Machine ID based verify endpoint
      if (path.match(/^\/[^\/]+\/v1\/verify$/) && request.method === "GET") {
        const machineId = path.split("/")[1];
        const response = await handleVerify(request, env, machineId);
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // Test Claude - forward to Anthropic API
      if (path === "/testClaude" && request.method === "POST") {
        const response = await handleTestClaude(request);
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // Forward request to any endpoint
      if (path === "/forward" && request.method === "POST") {
        const response = await handleForward(request);
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // Forward request via raw TCP socket (bypasses CF auto headers)
      if (path === "/forward-raw" && request.method === "POST") {
        const response = await handleForwardRaw(request);
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // Cloud-mode API stubs — these endpoints are managed locally; return safe defaults
      if (path === "/api/settings") {
        if (request.method === "GET") {
          return addCorsHeaders(
            new Response(
              JSON.stringify({
                requireApiKey: false,
                cloudProxyUrl:
                  "https://involvex-claude-router-cloud.involvex.workers.dev",
                cloudMode: true,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (request.method === "PATCH" || request.method === "PUT") {
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
      }

      if (path === "/api/tunnel/status" && request.method === "GET") {
        return addCorsHeaders(
          new Response(
            JSON.stringify({
              enabled: false,
              tunnelUrl: null,
              shortId: null,
              cloudMode: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (path === "/api/keys") {
        if (request.method === "GET") {
          return addCorsHeaders(
            new Response(JSON.stringify({ keys: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        // POST/DELETE/PUT — no-op in cloud mode
        return addCorsHeaders(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // GET /v1 — base info endpoint (used by dashboards to verify connectivity)
      if (path === "/v1" && request.method === "GET") {
        return addCorsHeaders(
          new Response(
            JSON.stringify({ object: "api", version: "v1", status: "ok" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // Landing page for root
      if (path === "/" && request.method === "GET") {
        const response = createLandingPageResponse();
        log.response(response.status, Date.now() - startTime);
        return response;
      }

      // Serve Next.js static dashboard from ASSETS; SPA fallback for dynamic routes
      if (env.ASSETS) {
        try {
          const assetResponse = await env.ASSETS.fetch(request);
          if (assetResponse.status !== 404) {
            return assetResponse;
          }
          // SPA fallback: walk up the URL path for /dashboard/* dynamic segments
          if (path.startsWith("/dashboard/")) {
            const segments = path.split("/").filter(Boolean);
            for (let len = segments.length - 1; len >= 1; len--) {
              const fallbackPath = "/" + segments.slice(0, len).join("/") + "/";
              try {
                const fb = await env.ASSETS.fetch(
                  new Request(new URL(fallbackPath, request.url).toString()),
                );
                if (fb.status === 200) {
                  return new Response(fb.body, {
                    status: 200,
                    headers: fb.headers,
                  });
                }
              } catch (_) {}
            }
          }
        } catch (_) {
          // ASSETS fetch failed — fall through
        }
      }

      log.warn("ROUTER", "Not found", { path });
      return addCorsHeaders(
        new Response(JSON.stringify({ error: "Not Found", path }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );
    } catch (error) {
      log.error("ROUTER", error.message, { stack: error.stack });
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

export default worker;
