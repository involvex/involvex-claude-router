# Implementation Plan: Quick Wins & High-Priority Items

This plan covers **10 high-value, low-risk improvements** prioritized by impact and effort. Each item includes the exact files to create/modify, code snippets, and verification steps. All file paths are verified against the actual codebase structure.

---

## Priority 1: Developer Experience (Tests + Scripts)

### 1.1 Add `test` script to root `package.json`

**Files:** `package.json` (root)

**Problem:** The root `package.json` has no `test` script — developers must remember `npx vitest`. The `tests/` workspace has its own package.json with a test script, but it's not propagated.

**Change:** Add scripts to root `package.json`:

```json
{
  "scripts": {
    "prebuild": "bun run format && bun run lint:fix",
    "build": "next build --turbo && bun run build:cli",
    "build:cli": "bun run --cwd cli build",
    "dev": "next dev --turbo --port 20128",
    "start": "next start",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "lint:fix": "eslint --fix .",
    "typecheck:cli": "bun run --cwd cli typecheck",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Verification:** `npm run test:run` should execute all existing tests.

---

### 1.2 Add unit tests for translator functions

**Files to create:**

- `tests/unit/translaters/openaiToAnthropic.test.js`
- `tests/unit/translaters/openaiToGemini.test.js`
- `tests/unit/translaters/factory.js` (shared test fixtures)

**Problem:** There are only 3 test files (`embeddingsCore.test.js`, `githubSanitizeTools.test.js`, `oauth-cursor-auto-import.test.js`). No tests cover the translator layer, which is the core of the router's value proposition.

**Approach:** Follow the existing test pattern in `tests/unit/embeddingsCore.test.js` — mock the executor layer, import the translator, test request/response transformations.

Example test structure:

```javascript
// tests/unit/translaters/openaiToAnthropic.test.js
import { describe, it, expect, vi } from "vitest";

// Mock executor to avoid uuid/native dependency issues
vi.mock("../../../open-sse/executors/index.js", () => ({
  getExecutor: vi.fn(() => ({ refreshCredentials: vi.fn() })),
  hasSpecializedExecutor: vi.fn(() => false),
}));

import { translateOpenAIToAnthropicSystem } from "../../../open-sse/translator/request/openai-to-claude.js";

describe("openai-to-claude translator", () => {
  it("converts OpenAI messages with tool_calls to Claude tool_use blocks", () => {
    const openaiBody = {
      model: "claude-3-7-sonnet-20250219",
      messages: [
        {
          role: "assistant",
          content: "Hello",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "get_weather", arguments: '{"city":"SF"}' },
            },
          ],
        },
      ],
    };
    // ... assert Claude format output
  });

  it("handles response_format.json_object as system instruction", () => {
    // ...
  });
});
```

**Verification:** `npm run test:run -- tests/unit/translaters/`

---

### 1.3 Add unit tests for fallback logic

**Files to create:** `tests/unit/services/accountFallback.test.js`

**Problem:** `open-sse/services/accountFallback.js` has zero test coverage. This is critical business logic (exponential backoff, error classification, account state management).

**Tests to write:**

- `checkFallbackError()` with each HTTP status code and error pattern
- `getQuotaCooldown()` exponential backoff progression
- `filterAvailableAccounts()` cooldown filtering
- `resetAccountState()` clearing error state
- `applyErrorState()` setting rate limits and backoff

```javascript
import {
  checkFallbackError,
  getQuotaCooldown,
  filterAvailableAccounts,
  resetAccountState,
  applyErrorState,
  HTTP_STATUS,
} from "../../../open-sse/services/accountFallback.js";
import { describe, it, expect } from "vitest";

describe("accountFallback", () => {
  describe("getQuotaCooldown", () => {
    it("starts at 1s base, doubles each level", () => {
      expect(getQuotaCooldown(0)).toBe(1000);
      expect(getQuotaCooldown(1)).toBe(2000);
      expect(getQuotaCooldown(2)).toBe(4000);
    });
    it("caps at 2 minutes max", () => {
      expect(getQuotaCooldown(15)).toBe(120000);
    });
  });

  describe("checkFallbackError", () => {
    it("triggers fallback on 429", () => {
      const result = checkFallbackError(429, "", 0);
      expect(result.shouldFallback).toBe(true);
      expect(result.cooldownMs).toBe(1000);
    });
    it("triggers fallback on 503", () => {
      const result = checkFallbackError(503, "", 0);
      expect(result.shouldFallback).toBe(true);
      expect(result.cooldownMs).toBe(30000);
    });
    it("detects rate limit from error message text", () => {
      const result = checkFallbackError(400, "rate limit exceeded", 0);
      expect(result.shouldFallback).toBe(true);
    });
  });
});
```

---

### 1.4 Add `CONTRIBUTING.md`

**Files to create:** `CONTRIBUTING.md` (root)

**Content:** Document the development workflow using the actual commands from this project:

- Install: `bun install`
- Dev: `npm run dev` (port 20128)
- Prebuild: `npm run prebuild` (format + lint:fix)
- Build: `npm run build`
- Test: `npm run test:run`
- Lint: `npm run lint`
- Format: `npm run format`
- Architecture overview: `open-sse/` (routing core), `src/` (Next.js app), `cli/` (CLI), `tests/` (vitest)

---

## Priority 2: Security & Reliability

### 2.1 Log Sanitization Utility

**Files to create:** `open-sse/utils/sanitize.js`

**Files to modify:** `open-sse/handlers/chatCore.js` (where errors are logged)

**Problem:** Error objects with `Authorization` headers, API keys, and credentials may be logged to `log.txt` and console. No sanitization layer exists.

**Implementation:**

```javascript
// open-sse/utils/sanitize.js
/**
 * Recursively remove sensitive keys from an object before logging.
 * Matches: *key*, *token*, *secret*, *password*, *authorization*, *api_key, *apikey
 */
const SENSITIVE_PATTERNS =
  /^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|credential)/i;

export function sanitizeForLog(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== "object") return obj;
  if (seen.has(obj)) return "[circular]";
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLog(item, seen));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_PATTERNS.test(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeForLog(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

Then in `open-sse/handlers/chatCore.js` where errors are logged:

```javascript
import { sanitizeForLog } from "../utils/sanitize.js";
// ...
log.error("PROXY", "Upstream error", sanitizeForLog(errorDetails));
```

---

### 2.2 JWT Secret Validation at Startup

**Files to modify:** `src/lib/auth/checkJwt.js` (if exists) or create `src/lib/auth/validateConfig.js`

**Problem:** `JWT_SECRET` is required for dashboard protection but there's no startup validation. In production, if `JWT_SECRET` is unset, the dashboard silently fails or is unprotected.

**Implementation:**

```javascript
// src/lib/auth/validateConfig.js
const REQUIRED_ENV_PROD = ["JWT_SECRET"];

export function validateEnvVars() {
  if (process.env.NODE_ENV === "production") {
    for (const key of REQUIRED_ENV_PROD) {
      if (!process.env[key]) {
        console.error(
          `FATAL: ${key} environment variable is required in production`,
        );
        process.exit(1);
      }
      if (key === "JWT_SECRET" && process.env[key].length < 16) {
        console.error(
          "FATAL: JWT_SECRET must be at least 16 characters in production",
        );
        process.exit(1);
      }
    }
  }
}
```

Call this from `src/app/layout.js` or the Next.js middleware initialization.

---

## Priority 3: Monitoring & Observability

### 3.1 Prometheus Metrics Endpoint

**Files to create:** `src/app/api/metrics/route.js`

**Problem:** No metrics export for monitoring systems. The `usageDb.js` already tracks `statsEmitter` events but there's no scrape endpoint.

**Implementation:**

```javascript
// src/app/api/metrics/route.js
import { getUsageDb } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getUsageDb();
  await db.read();

  const history = db.data.history || [];
  let requestCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const entry of history) {
    requestCount++;
    const t = entry.tokens || {};
    totalInputTokens += t.prompt_tokens || t.input_tokens || 0;
    totalOutputTokens += t.completion_tokens || t.output_tokens || 0;
  }

  const metrics = [
    `# HELP router_requests_total Total number of requests processed`,
    `# TYPE router_requests_total counter`,
    `router_requests_total ${requestCount}`,
    `# HELP router_tokens_total Total tokens processed`,
    `# TYPE router_tokens_total counter`,
    `router_tokens_total{direction="input"} ${totalInputTokens}`,
    `router_tokens_total{direction="output"} ${totalOutputTokens}`,
  ];

  return new Response(metrics.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; version=0.0.4" },
  });
}
```

---

### 3.2 Structured JSON Logging

**Files to modify:** `open-sse/utils/stream.js` or wherever console.log is used in the request path

**Problem:** Currently uses `console.log` with text format. Structured JSON logs with request IDs, provider info, and timing would enable log aggregation (e.g., in Datadog, Loki).

**Approach:** Create `open-sse/utils/log.js` that wraps console methods with structured output:

```javascript
// open-sse/utils/log.js
const isProd = process.env.NODE_ENV === "production";

export const createLogger = component => {
  const log = (level, message, data = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      ...(Object.keys(data).length > 0 ? { data } : {}),
    };
    if (isProd) {
      console.log(JSON.stringify(entry));
    } else {
      console.log(`[${level}] ${component}: ${message}`, data);
    }
  };
  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
  };
};

export const logger = createLogger("router");
```

Then replace `console.log` calls in `chatCore.js` and `chat.js` with structured logger calls.

---

### 3.3 Request ID Passthrough

**Files to modify:** `src/sse/handlers/chat.js`

**Problem:** Log lines in `log.txt` don't have a correlation ID to trace a request through the 3-tier fallback path.

**Implementation:** Generate a UUID per request and include it in all log lines:

```javascript
// In src/sse/handlers/chat.js, at the top of handleChat():
import { v4 as uuidv4 } from "uuid";

const requestId = uuidv4();
// Pass requestId through to handleChatCore and include in all log calls
log.info("CHAT", `Request ${requestId} received | model=${modelStr}`, {
  requestId,
});
```

---

## Priority 4: CLI Enhancements

### 4.1 `ccr config` Command

**Files to create:** `cli/src/cli/commands/config.ts`

**Problem:** The CLI only has `start`, `stop`, `status`, `models`. There's no way to inspect or change configuration from the command line.

**Implementation:**

```typescript
// cli/src/cli/commands/config.ts
import path from "node:path";
import fs from "node:fs";

const DB_FILE = path.join(process.cwd(), "db.json"); // Adjust path for actual location

export async function config(argv: string[] = []) {
  const [sub, ...rest] = argv;

  if (!fs.existsSync(DB_FILE)) {
    console.error("Config db.json not found at:", DB_FILE);
    process.exit(1);
  }

  let db: any;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    console.error("Failed to parse db.json");
    process.exit(1);
  }

  switch (sub) {
    case "list":
      console.log(JSON.stringify(db, null, 2));
      break;
    case "get":
      if (!rest[0]) {
        console.error("Usage: ccr config get <key>");
        process.exit(1);
      }
      const val = rest[0].split(".").reduce((obj, k) => obj?.[k], db);
      console.log(val ?? "undefined");
      break;
    case "set":
      if (rest.length < 2) {
        console.error("Usage: ccr config set <key> <value>");
        process.exit(1);
      }
      // Simple top-level key setter (extend for nested keys if needed)
      const [key, ...valParts] = rest;
      db[key] = valParts.join(" ");
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
      console.log(`Set ${key} = ${valParts.join(" ")}`);
      break;
    default:
      console.log("Usage: ccr config <list|get|set>");
  }
}
```

**Register in:** `cli/src/cli/index.ts` (add `import { config } from "./commands/config";` and `case "config": await config(positionals.slice(1));`)

---

### 4.2 `ccr logs` Command

**Files to create:** `cli/src/cli/commands/logs.ts`

**Problem:** Logs are written to `log.txt` in the user data directory but there's no CLI command to view them.

```typescript
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const LOG_FILE = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "9router",
  "log.txt",
);

export async function logs(argv: string[] = []) {
  const follow = argv.includes("--follow") || argv.includes("-f");
  const lines = argv.includes("--lines")
    ? parseInt(argv[argv.indexOf("--lines") + 1])
    : 50;

  if (!fs.existsSync(LOG_FILE)) {
    console.log("No log file found at:", LOG_FILE);
    return;
  }

  if (follow) {
    // Tail -f implementation
    const { spawn } = await import("node:child_process");
    const child = spawn("tail", ["-f", LOG_FILE], { stdio: "inherit" });
    child.on("error", () =>
      console.error("tail command not available on Windows"),
    );
    process.on("SIGINT", () => {
      child.kill();
      process.exit(0);
    });
  } else {
    const content = fs.readFileSync(LOG_FILE, "utf8");
    const allLines = content.split("\n").filter(Boolean);
    console.log(allLines.slice(-lines).join("\n"));
  }
}
```

---

### 4.3 `ccr status --json`

**Files to modify:** `cli/src/cli/commands/status.ts`

**Problem:** The status command outputs plain text only. A `--json` flag would enable programmatic monitoring.

```typescript
import { spawn } from "node:child_process";
import killport from "kill-port";

export async function status(argv: string[] = []) {
  const json = argv.includes("--json");

  if (!json) {
    // Existing text output
    // ... (current logic)
    return;
  }

  // JSON output
  let portAvailable = true;
  try {
    await killport(20128);
    portAvailable = false; // Port was in use (router running)
  } catch {
    portAvailable = false;
  }

  // Check if PID file exists
  const pidFile = path.join(process.cwd(), ".claude", "router.pid");
  let pid = null;
  let uptime = null;
  if (fs.existsSync(pidFile)) {
    pid = Number(fs.readFileSync(pidFile, "utf8"));
    try {
      process.kill(pid, 0);
      // Get process start time for uptime calculation
      // ...
    } catch {
      pid = null;
    }
  }

  console.log(
    JSON.stringify(
      {
        running: !!pid,
        pid,
        port: 20128,
        portInUse: !portAvailable,
      },
      null,
      2,
    ),
  );
}
```

---

## Priority 5: Routing & Performance

### 5.1 Weighted Round-Robin Account Selection

**Files to modify:** `open-sse/services/accountService.js` (check if exists) or wherever `getNextAccount` is implemented

**Problem:** Account selection uses plain round-robin. High-priority accounts can't be weighted to receive more traffic.

**Approach:** First, locate the account selection logic. Based on `open-sse/services/model.js` and `open-sse/services/provider.js`, the actual connection selection logic may be in `src/sse/services/auth.js`.

**Implementation:**

1. Extend the LowDB schema in `src/lib/localDb.js` to accept a `weight` field per connection
2. Modify the account selection function to use weighted round-robin
3. Add a weight input in the dashboard provider settings UI

```javascript
// Weighted round-robin selection
function selectWeightedAccount(accounts) {
  const totalWeight = accounts.reduce((sum, acc) => sum + (acc.weight || 1), 0);
  let r = Math.random() * totalWeight;
  for (const acc of accounts) {
    r -= acc.weight || 1;
    if (r <= 0) return acc;
  }
  return accounts[0]; // Fallback
}
```

---

### 5.2 Response Caching for Non-Streaming Requests

**Files to create:** `open-sse/services/cacheService.js`

**Problem:** Non-streaming chat requests to the same model with identical messages are re-sent to upstream providers, wasting quota and adding latency.

**Implementation:**

```javascript
// open-sse/services/cacheService.js
import { LRUCache } from "lru-cache";

const cache = new LRUCache({
  max: 500,
  ttl: 5 * 60 * 1000, // 5 minutes default
});

export function generateCacheKey(model, body, provider) {
  const payload = JSON.stringify({
    model,
    messages: body.messages,
    tools: body.tools,
    temperature: body.temperature,
    provider,
  });
  return `${provider}:${model}:${Buffer.hash ? Buffer.hash(payload) : payload}`;
}

export function getCachedResponse(cacheKey) {
  return cache.get(cacheKey);
}

export function setCachedResponse(cacheKey, responseBody) {
  cache.set(cacheKey, responseBody);
}
```

**Integration in `open-sse/handlers/chatCore.js`:**

```javascript
// Before making upstream call (only for non-streaming)
if (!body.stream) {
  const cacheKey = generateCacheKey(
    `${modelInfo.provider}/${modelInfo.model}`,
    body,
    credentials.connectionId,
  );
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    log.info("CACHE", "Response served from cache");
    return {
      success: true,
      response: new Response(JSON.stringify(cached), {
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  // After successful response:
  setCachedResponse(cacheKey, responseBody);
}
```

---

### 5.3 Graceful Shutdown

**Files to modify:** `cli/src/cli/commands/stop.ts`, `src/lib/usageDb.js`

**Problem:** `ccr stop` immediately kills the process on port 20128. Active SSE streams may be cut off mid-response.

**Implementation:**

1. Add a `closing` state flag in `src/lib/usageDb.js` using the existing `pendingRequests` global
2. On `SIGTERM`, set the flag and wait up to 10 seconds for pending requests to finish
3. Modify `stop.ts` to send `SIGTERM` instead of `kill-port`

```typescript
// cli/src/cli/commands/stop.ts
import { spawn } from "node:child_process";

export async function stop() {
  const pidFile = path.join(process.cwd(), ".claude", "router.pid");
  if (!fs.existsSync(pidFile)) {
    console.log("Router not running");
    return;
  }
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  if (!pid) {
    console.log("Router not running");
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    // Wait for graceful shutdown
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        process.kill(pid, 0);
      } catch {
        console.log("Router stopped gracefully");
        fs.unlinkSync(pidFile);
        return;
      }
    }
    // Force kill if still running
    process.kill(pid, "SIGKILL");
    fs.unlinkSync(pidFile);
    console.log("Router force-stopped");
  } catch (err: any) {
    if (err.message?.includes("not found")) {
      fs.unlinkSync(pidFile);
      console.log("Router was not running (stale pid)");
    } else {
      console.error("Failed to stop router:", err);
    }
  }
}
```

---

## Priority 6: Missing API Endpoints

### 6.1 Image Generation Endpoint (`/v1/images/generations`)

**Files to create:** `src/app/api/v1/images/generations/route.js`

**Problem:** The OpenAI-compatible `/v1/images/generations` endpoint is not implemented. Clients calling this endpoint get 404.

**Implementation:** Support DALL-E (OpenAI), Gemini Imagen (via Gemini API), and any OpenAI-compatible provider's image endpoint.

```javascript
// src/app/api/v1/images/generations/route.js
import { initTranslators } from "open-sse/translator/index.js";
import { handleChat } from "@/sse/handlers/chat.js";

export async function POST(request) {
  let initialized = false;
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }

  const body = await request.json();
  const { prompt, n = 1, size = "1024x1024", model } = body;

  // Route to providers that support image generation
  // OpenAI DALL-E: POST https://api.openai.com/v1/images/generations
  // Gemini: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predict
  // ...
}
```

---

### 6.2 Audio Transcription Endpoint (`/v1/audio/transcriptions`)

**Files to create:** `src/app/api/v1/audio/transcriptions/route.js`

**Problem:** No audio transcription endpoint. OpenAI Whisper, Google Speech-to-Text not accessible via `/v1/audio/transcriptions`.

---

## Priority 7: Testing Infrastructure

### 7.1 CLI Command Tests

**Files to create:** `tests/unit/cli/models.test.ts`

**Implementation:** Test `cli/src/cli/commands/models.ts` using `vitest` with mocked filesystem.

### 7.2 Integration Test: Full Chat Flow

**Files to create:** `tests/integration/chatFlow.test.js`

**Problem:** No end-to-end test of the full request path.

---

## Execution Order & Dependencies

```
Phase 1 (Week 1): Quick Wins
  1.1  Add test scripts to package.json
  1.4  Create CONTRIBUTING.md
  3.1  Add Prometheus metrics endpoint
  2.1  Add log sanitization utility

Phase 2 (Week 2): Testing Foundation
  1.2  Translator unit tests
  1.3  Fallback logic tests
  5.3  Update test:run to include new tests

Phase 3 (Week 2-3): CLI & Observability
  4.1  ccr config command
  4.3  ccr status --json
  3.2  Structured JSON logging
  3.3  Request ID passthrough

Phase 4 (Week 3-4): Routing Improvements
  5.1  Weighted round-robin (requires localDb schema change)
  5.2  Response caching
  5.3  Graceful shutdown

Phase 5 (Week 4+): New Endpoints
  6.1  /v1/images/generations
  6.2  /v1/audio/transcriptions
```

## Verification Checklist

After each phase:

- [ ] `npm run format:check` passes
- [ ] `npm run lint` passes (no new warnings)
- [ ] `npm run test:run` passes all tests
- [ ] `npm run build` succeeds without errors
