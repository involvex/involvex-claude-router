# Suggestions for 9router (involvex-claude-router)

This document captures implementable feature ideas, refactors, and improvements grounded in the current codebase structure. Each item references actual files/modules so an engineer can act directly.

## 1. Core Routing & API Surface

### 1.1 Implement OpenAI Responses API (`/v1/responses`)

**Status:** Not implemented
**Where to add:** `src/sse/handlers/responsesHandler.js` (new) + register in `src/sse/handlerRegistry.js`

The router currently exposes `/v1/chat`, `/v1/models`, `/v1/embeddings`, and `/v1/vectors`. OpenAI's newer `responses` endpoint supports stateful conversations, tools, file search, and built-in reasoning. Adding a translator in `open-sse/translator/responsesTranslator.js` that converts the OpenAI Responses format to each provider's native format (Anthropic messages, Gemini chat) would unlock o1/o3/o4 style reasoning models for Claude/Gemini backends.

**Key files to extend:**

- Add case in `src/sse/handlerRegistry.js` mapping `responses` → new handler
- New handler calls `open-sse/translator/responsesTranslator.js` → `open-sse/executors/*`
- Store conversation state keyed by `id` in `open-sse/services/conversationService.js` (extend existing service)

### 1.2 Structured Outputs / JSON Schema Enforcement

**Status:** Partially supported (basic passthrough)
**Files:** `open-sse/translator/openaiToAnthropic.js`, `open-sse/translator/openaiToGemini.js`

Currently `response_format: { type: "json_object" }` is passed through but there is no schema validation or structured-output enforcement for Anthropic or Gemini. Add schema translation:

- **Anthropic:** Use `response_schema` via the `anthropic-beta: max-tokens-3-2024-09` beta header and `response_schema` param (new field on executor)
- **Gemini:** Map `json_schema` → `generationConfig.responseSchema` in `openaiToGemini.js`

Implement a `structuredOutputService.js` in `open-sse/services/` that validates the model's raw output against the requested schema and retries on failure (leveraging existing retry logic in `open-sse/utils/errorUtils.js`).

### 1.3 Tool Call Delta Streaming for SSE

**Status:** Basic streaming exists, delta is coarse
**Files:** `open-sse/utils/stream.js`, `open-sse/handlers/chatHandler.js`

The SSE stream currently sends full deltas aggregated per chunk. Add finer-grained tool-call deltas (e.g., `tool_call.delta.index`, `tool_call.delta.id`, `tool_call.delta.function.name`, `tool_call.delta.function.arguments`) so clients that render streaming tool calls (Claude Code, Cursor) get smoother UX. This mirrors OpenAI's `stream_options: { include_usage: true }` pattern.

### 1.4 Rate-Limit Headers Propagation

**Status:** Not propagated from upstream
**Files:** `open-sse/executors/anthropicExecutor.js`, `open-sse/executors/geminiCLIExecutor.js`, `open-sse/utils/proxy.js`

Forward upstream `x-ratelimit-remaining`, `x-ratelimit-reset`, and `x-ratelimit-limit` headers from Anthropic/OpenRouter/Gemini back to the caller in the SSE stream. Add helper `open-sse/utils/rateLimitHeaders.js` that parses and normalizes these into a consistent `x-cc-ratelimit-*` set.

### 1.5 Image Generation Endpoint (`/v1/images/generations`)

**Status:** Not implemented
**Where to add:** `src/sse/handlers/imageHandler.js` (new)

The router has an `image-generation` capability flag (`open-sse/config/providerCapabilities.js`) but no endpoint. Implement `/v1/images/generations` that accepts base64/image URLs from providers that support it (Anthropic Claude 3.5 Sonnet image output, OpenAI DALL-E, Gemini Imagen). Route to `open-sse/executors/*` providers that declare `imageGeneration: true`.

### 1.6 Audio Transcription & TTS

**Status:** Not implemented
**Where to add:** `src/sse/handlers/audioHandler.js` (new)

Add `/v1/audio/transcriptions` (Whisper via OpenAI, Google Speech-to-Text via Gemini CLI) and `/v1/audio/speech` (TTS). Reuse the existing executor pattern; create `open-sse/translaters/audioTranscriptionTranslator.js` for format conversion.

## 2. Provider Integrations

### 2.1 Mistral Provider

**Status:** Not connected
**Files:** `open-sse/providers/` (new folder), `src/lib/oauth/services/`

Mistral's API is OpenAI-compatible. Add `open-sse/providers/mistral.js` executor (extends `open-sse/executors/openaiCompatibleExecutor.js`) and an OAuth service at `src/lib/oauth/services/mistral.js` if they offer OAuth. Register in `src/lib/oauth/services/index.js` and in the provider config DB defaults (`src/lib/db.js` init schema).

### 2.2 xAI (Grok)

**Status:** API key only, no executor
**Files:** Add `open-sse/providers/xai.js`

xAI's API uses the OpenAI format. Add as a provider type `api_key` in `open-sse/config/providerModels.js` with known models (`grok-2`, `grok-3`, etc.). Implement simple pass-through executor.

### 2.3 Local Ollama Provider

**Status:** No integration
**Files:** `open-sse/providers/ollama.js` (new)

Add a provider type `local` that connects to `http://localhost:11434` and serves `/v1/*` style requests using Ollama's native format. This would bypass the need for any upstream provider for local-only mode. Map Ollama's function-calling format to the unified tool-call structure in `open-sse/translator/`.

### 2.4 DeepSeek Integration

**Status:** API key only via openai-compatible
**Improvement:** First-class executor

DeepSeek's chat API is OpenAI-compatible but has its own rate limits and model names. Create `open-sse/providers/deepseek.js` that sets the base URL, handles `deepseek-chat` and `deepseek-reasoner` models specially (reasoning models need `reasoning_content` field passthrough), and applies DeepSeek-specific retry logic.

### 2.5 Provider Health Check & Auto-Disable

**Status:** Fallback handles failures, but no proactive health checks
**Files:** Add `open-sse/services/healthService.js`

Implement a background health checker that pings each provider's `/v1/models` (or lightweight endpoint) every 2 minutes. Mark unhealthy providers in `src/lib/db.js` by setting a `lastHealthCheckFailed` flag. The fallback logic in `open-sse/services/fallbackService.js` already skips providers with `enabled: false`, so reuse that mechanism. Add a dashboard indicator (green/yellow/red dots) on `src/app/providers/page.js`.

### 2.6 Cohere Integration

**Status:** Not connected
**Where to add:** `open-sse/providers/cohere.js`

Cohere's API has its own format. Create a translator `open-sse/translator/cohereToAnthropic.js` and `open-sse/translator/anthropicToCohere.js` to handle the R-series command format (`command-r`, `command-r-plus`).

## 3. Multi-Account & Routing Enhancements

### 3.1 Weighted Round-Robin Selection

**Status:** Round-robin exists (`open-sse/services/accountService.js`)
**Improvement:** Add weights per account

Extend the LowDB schema in `src/lib/db.js` to add `weight: number` (default 1) per account. Modify `open-sse/services/accountService.js` `getNextAccount()` to use weighted round-robin (e.g., accounts with weight 2 get picked twice as often). Add weight slider in dashboard UI (`src/components/providers/ProviderAccounts.js`).

### 3.2 Context-Based Provider Selection

**Status:** Not implemented

Use LLM classification or keyword matching on incoming requests to route to specific providers. For example, if a request contains code-heavy content, prefer a coding-specialized provider (Claude 3.7 Sonnet, DeepSeek Coder, o1). Implement `open-sse/services/contextSelector.js` that inspects `messages[].content` and matches against configured rules (regex or embeddings similarity using existing embeddings service).

### 3.3 Per-Model Usage Cost Tracking

**Status:** Basic token counting exists (`open-sse/services/usageService.js`)

Extend the usage DB schema to track `inputTokens`, `outputTokens`, `costUsd` per provider/model combination. Add a pricing map in `open-sse/config/providerPricing.js`. Display cost breakdown in the `src/app/usage/page.js` dashboard with a per-combo cost chart.

### 3.4 Request Queuing for Burst Protection

**Status:** No queuing
**Files:** Add `open-sse/services/requestQueue.js`

When upstream providers return 429 (rate limited), queue requests and retry with exponential backoff instead of immediately falling back. Use a priority queue with `p-queue` (add as dependency). Configure per-provider concurrency limits in `open-sse/config/providerModels.js`.

## 4. Dashboard & UI Improvements

### 4.1 Real-Time Metrics Dashboard

**Status:** Basic usage page exists (`src/app/usage/page.js`)
**Improvement:** Live streaming metrics

Add a WebSocket or SSE connection from the dashboard to a new `/api/stream` endpoint that broadcasts:

- Current throughput (tokens/sec)
- Active request count
- Failover events
- Provider health status

Use the existing `src/store/` zustand pattern for state management. Visualize with charts (consider `recharts` dependency).

### 4.2 Provider Configuration Wizard

**Status:** Manual config editing only
**Files:** `src/app/providers/page.js`, `src/app/providers/[id]/settings/page.js`

Create a guided wizard that walks through adding a new provider:

1. Select provider type (Claude, Gemini, OpenAI, OpenRouter, etc.)
2. Enter API key / OAuth flow
3. Test connection (calls `open-sse/services/healthService.js` test endpoint)
4. Review mapped models
5. Set priority / weight

Reuse `src/components/providers/` components.

### 4.3 Dark Mode Toggle

**Status:** Theme hook exists (`src/shared/hooks/useTheme.js`)
**Improvement:** Expose toggle in UI

Add a visible dark/light toggle button in the dashboard header (e.g., `src/components/layout/Header.js`). The `useTheme` hook already reads from `localStorage`; just wire it to a clickable UI element.

### 4.4 Alias / Combo Import-Export

**Status:** Managed in DB only (`src/lib/db.js`)
**Improvement:** JSON backup/restore

Add export buttons on `src/app/aliases/page.js` and `src/app/combos/page.js` that download the current alias/combo configuration as JSON. Add an import flow that merges with existing config (with collision detection).

### 4.5 Request Log Viewer

**Status:** Logs written to `log.txt` only
**Files:** `src/app/logs/page.js` (new)

Create a paginated log viewer in the dashboard that reads from the usage DB (if we start storing structured logs there) or tail-reads `log.txt`. Show request ID, timestamp, model, provider, token usage, duration, and error if any. Add filters by provider, model, and date range.

### 4.6 Provider Status Banner

**Status:** Health not surfaced to users
**Files:** `src/components/layout/ProviderStatusBanner.js` (new)

Add a sticky banner at the top of the dashboard showing which providers are unhealthy (red), rate-limited (yellow), or healthy (green), based on `open-sse/services/healthService.js` data. Make it dismissible per-session.

## 5. Testing Improvements

### 5.1 Translator Unit Tests

**Status:** Only 3 test files exist (`tests/unit/`)
**Files:** Add `tests/unit/translaters/` directory

Write tests for each translator:

- `open-sest/translator/openaiToAnthropic.js` — test tool → tool_calls mapping, system prompt handling, streaming
- `open-sse/translator/openaiToGemini.js` — test function calling, safety settings, role mapping
- `open-sse/translator/geminiToOpenai.js` — test response normalization, candidate filtering
- `open-sse/translator/anthropicResponseToOpenAi.js` — test usage mapping, delta aggregation

Use the existing vitest setup; create a `tests/unit/translaters/factory.js` helper that generates standard test messages.

```javascript
// Example test structure
import { describe, it, expect } from 'vitest';
import { translate } from '../../../open-sse/translator/openaiToAnthropic.js';

describe('openaiToAnthropic', () => {
  it('converts tool calls to anthropic tool_use blocks', () => {
    const openaiMsg = { role: 'assistant', tool_calls: [...] };
    const result = translate(openaiMsg);
    expect(result.content[0].type).toBe('tool_use');
  });
});
```

### 5.2 Executor Mock Tests

**Status:** No tests for executors
**Files:** `tests/unit/executors/`

Use `vitest-mock` or `nock` to mock HTTP calls. Test that `anthropicExecutor.js` correctly calls the Anthropic API with translated params and handles auth token rotation via `open-sse/services/tokenRefresh.js`.

### 5.3 Fallback Logic Tests

**Status:** No tests
**Files:** `tests/unit/services/fallbackService.spec.js`

Test the 3-tier fallback logic with mocked executors. Scenario: Subscription provider returns 429/503, verify cheap provider is tried next, then free provider. Test edge cases: all providers fail, no providers configured, provider disabled.

### 5.4 Integration Test: Full Chat Request Flow

**Status:** No integration tests
**Files:** `tests/integration/chatFlow.spec.js`

Test the full path from `src/sse/handlerRegistry.js` → `open-sse/translator/` → `open-sse/executors/*` → `open-sse/services/*` with a mocked provider. Verify that OpenAI-format request → translation → provider call → response translation → OpenAI-format response round-trips correctly including tool calls and streaming.

### 5.5 CLI Command Tests

**Status:** CLI commands untested
**Files:** `tests/unit/cli/models.spec.js`

Test `cli/src/cli/commands/models.ts` — add list, add, remove with mocked filesystem.

## 6. Performance & Reliability

### 6.1 Streaming Buffer Optimization

**Status:** Basic streaming chunks
**Files:** `open-sse/utils/stream.js`

The current streaming sends each upstream delta as a separate SSE event. Batch deltas that arrive within 50ms into a single SSE event to reduce HTTP overhead on the client side. Use a `Transform` stream with a configurable flush interval.

### 6.2 Connection Pooling / Keep-Alive

**Status:** Default fetch behavior
**Files:** `open-sse/executors/*.js`, `open-sse/utils/proxy.js`

Ensure all `fetch` calls to upstream providers use `keepalive: true` and proper `Connection: keep-alive` headers. For Node 20, configure the `undici` agent with a `ConnectionPool` for persistent connections to Anthropic/Gemini endpoints.

### 6.3 Model Response Caching

**Status:** No caching
**Files:** Add `open-sse/services/cacheService.js`

Cache non-streaming responses for identical requests (same model + messages + temperature). Use `lru-cache` package. Cache should be per-provider-account to avoid cross-account contamination. TTL: configurable per provider (default 5 minutes). Add cache hit metric to `src/app/usage/page.js`.

### 6.4 Graceful Shutdown

**Status:** Basic process handling in `cli/src/cli/commands/start.ts`
**Improvement:** Drain active requests

When `stop` is called, wait for all active SSE streams to finish before shutting down the Next.js server. Add a `closing` flag in `open-sse/services/connectionTracker.js` that tracks active request IDs. On shutdown, signal clients to stop, wait up to 10 seconds for active streams to drain.

### 6.5 Compression for SSE Streams

**Status:** No compression
**Files:** `next.config.js` or `src/middleware.js`

Add gzip/Brotli compression for SSE responses. Note: compression must not interfere with streaming — use `Content-Encoding: gzip` with proper chunk flushing, or `next-compression` plugin configured for `/v1/*` routes only.

## 7. Security Enhancements

### 7.1 API Key Rotation

**Status:** Keys stored in DB only (`src/lib/db.js`)
**Improvement:** Rotation workflow

Add a key rotation feature: generate a new API key, mark old one as "deprecated" (still valid for 24 hours), and update the JWT-protected key reference in `src/shared/utils/apiKey.js`. Add UI in dashboard settings.

### 7.2 Request Validation / Schema Enforcement

**Status:** Minimal validation
**Files:** Add `src/sse/middleware/validateRequest.js`

Validate all incoming `/v1/*` requests against JSON schemas (e.g., `open-sest/translator/schemas/openaiRequest.json`). Reject malformed requests early (400 Bad Request) before translation. Use `ajv` or `zod` for schema validation.

### 7.3 Rate Limiting Per API Key

**Status:** No API key rate limiting
**Files:** Add `src/sse/middleware/rateLimit.js`

Implement token-bucket rate limiting keyed by API key. Use `rate-limiter-flexible` or `lru-cache`-based counter. Default: 1000 RPM per key, configurable in dashboard. Return 429 with `Retry-After` header.

### 7.4 Provider Key Masking in Logs

**Status:** Keys may be logged during errors
**Files:** `open-sse/utils/errorUtils.js`, `open-sse/utils/log.js`

Sanitize error objects before logging — strip `Authorization` headers and API key fields. Add a `sanitizeForLog(obj)` utility in `open-sse/utils/sanitize.js` that recursively removes keys matching `*key*`, `*token*`, `*secret*`, `*password*`.

### 7.5 JWT Secret Validation

**Status:** Required but not validated at startup
**Files:** `src/lib/auth/checkJwt.js`

Add a startup check in `src/lib/auth/checkJwt.js` (or wherever auth middleware is initialized) that fails loudly if `JWT_SECRET` is unset or shorter than 16 characters in production mode. Log a clear error and exit.

### 7.6 MITM Certificate Pinning

**Status:** Basic cert generation (`src/mitm/certificates.js`)
**Improvement:** Pin known CA fingerprints

Store the generated MITM CA fingerprint in config. On subsequent requests, verify the upstream certificate chain against the pinned CA. This prevents MITM attacks on the router itself.

## 8. CLI Enhancements

### 8.1 `ccr config` Command

**Status:** Only `start`, `stop`, `status`, `models` commands
**Files:** `cli/src/cli/commands/config.ts` (new)

Add a `ccr config get/set <key> [value]` command that reads/writes to the LowDB `db.json`. Examples:

- `ccr config get logLevel` → `debug`
- `ccr config set logLevel debug`
- `ccr config list` → dump all config keys

### 8.2 `ccr status --json`

**Status:** Text-only status output
**Files:** `cli/src/cli/commands/status.ts`

Add `--json` flag that outputs structured JSON with provider statuses, active connections, and uptime. Useful for scripting and monitoring.

### 8.3 `ccr logs`

**Status:** No log tailing in CLI
**Files:** `cli/src/cli/commands/logs.ts` (new)

Add `ccr logs [--follow] [--lines N]` that reads from `log.txt` (or structured usage DB). `--follow` streams new entries in real-time.

### 8.4 Environment Override Support

**Status:** Env vars read directly
**Files:** `src/lib/config.js` or wherever env vars are loaded

Add support for `9ROUTER_API_KEY=...`, `9ROUTER_JWT_SECRET=...`, etc. as overrides. Document precedence: CLI flag → env var → config file. Implement in the config loading module.

## 9. Cloud Sync & Multi-Device

### 9.1 Conflict Resolution UI

**Status:** Sync logic exists (`src/lib/initCloudSync.js`)
**Improvement:** Show conflicts in UI

When cloud sync detects a conflict (local and remote both changed), show a diff view in the dashboard. Allow user to choose "keep local", "keep remote", or "merge". Store resolved configs in a `syncConflicts` table in `src/lib/db.js`.

### 9.2 Offline Mode Indicator

**Status:** Auto-fallback to local only
**Improvement:** Explicit offline mode

Detect network issues (failed cloud sync calls) and show a banner in the dashboard: "Cloud sync is offline. Changes will sync when connection is restored." Allow user to force offline mode via `ccr config set offlineMode true`.

### 9.3 Selective Sync

**Status:** Full config sync
**Improvement:** Choose what to sync

Allow users to choose which config sections sync: only providers/accounts, only aliases, only combos, or all. Store preference in `src/lib/db.js` sync settings.

## 10. Code Quality & Maintainability

### 10.1 Add JSDoc to All Public Functions

**Status:** Sparse documentation
**Files:** `open-sse/utils/*.js`, `open-sse/services/*.js`, `open-sse/executors/*.js`

Add comprehensive JSDoc blocks to every exported function, including `@param`, `@returns`, `@throws`, and `@example`. This improves IDE autocomplete and generates API docs if `jsdoc` tooling is added.

### 10.2 Centralize Provider Registry

**Status:** Providers referenced by scattered string IDs
**Files:** Create `open-sse/config/providerRegistry.js`

Create a central registry that maps provider type strings to their executor modules, OAuth services, capability configs, and pricing data. This prevents typos and makes provider addition discoverable:

```javascript
export const providers = {
  anthropic: {
    executor: () => import("../executors/anthropicExecutor.js"),
    oauth: AnthropicService,
    capabilities: { supportsTools: true, supportsVision: true },
    pricing: { "claude-3-7-sonnet-20250219": { input: 3.0, output: 15.0 } },
  },
  // ...
};
```

### 10.3 Error Code Standardization

**Status:** Error codes in `open-sse/utils/errorUtils.js`
**Improvement:** Structured error types

Replace string-based error codes with an enum-like object. Create `open-sse/utils/errorCodes.js`:

```javascript
export const ErrorCodes = {
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  AUTH_FAILED: "AUTH_FAILED",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  TRANSLATION_ERROR: "TRANSLATION_ERROR",
  TIMEOUT: "TIMEOUT",
};
```

Use throughout executors and services for consistent client-side error handling.

### 10.4 Migrate to TypeScript (Incremental)

**Status:** Pure JS ESM
**Files:** Start with `open-sse/config/*.js`, `open-sse/utils/*.js`

The project is "ESM only: no TypeScript compilation step required." If adding TS, use `allowJs: true` in `tsconfig` and type-check with `tsc --noEmit`. Start with config and utility files that have the widest import surface. This is a large undertaking — document the strategy in `docs/TYPESCRIPT_MIGRATION.md` before starting.

**Note:** The project intentionally avoids TS compilation. If this suggestion is pursued, evaluate `jiti` or `tsx` as a runtime loader to avoid a build step.

## 11. Observability & Monitoring

### 11.1 OpenTelemetry Integration

**Status:** Basic logging to file
**Files:** Add `src/lib/telemetry.js`

Add OpenTelemetry tracing to track request flow: incoming request → provider selection → translation → upstream call → response translation → outgoing response. Export traces via OTLP to a configurable collector endpoint. This would make the 3-tier fallback path visible in distributed tracing tools.

### 11.2 Prometheus Metrics Endpoint

**Status:** No metrics export
**Files:** Add `src/app/api/metrics/route.js`

Expose `/api/metrics` with Prometheus-format counters/gauges:

- `router_requests_total{provider, model}`
- `router_tokens_total{provider, model, direction}`
- `router_fallback_count_total{from, to}`
- `router_provider_up{provider} 0|1`

### 11.3 Structured JSON Logging

**Status:** Text logging
**Files:** `open-sse/utils/log.js`

Switch to structured JSON logs with fields: `timestamp`, `level`, `requestId`, `provider`, `model`, `durationMs`, `tokensIn`, `tokensOut`, `costUsd`, `error`. Keep human-readable mode for dev via `logLevel=debug`.

## 12. Developer Experience

### 12.1 Test Script in package.json

**Status:** No `test` script
**Files:** `package.json`

Add a `test` script so developers don't need to remember `npx vitest`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 12.2 `ccr test` CLI Command

**Status:** No CLI test runner
**Files:** `cli/src/cli/commands/test.ts` (new)

Add `ccr test` that runs a quick end-to-end health check: verifies local DB connectivity, pings all enabled providers' `/v1/models` endpoint, and reports status. Useful before deploying or after config changes.

### 12.3 Mock Provider Mode

**Status:** No local testing without real providers
**Files:** Add `open-sse/providers/mock.js`

Add a "Mock" provider type that returns canned responses (or echoes back the input). Useful for local development, testing the dashboard UI, and integration tests without burning API credits.

### 12.4 CONTRIBUTING.md

**Status:** No contributor guide
**Files:** `CONTRIBUTING.md` (new)

Document the development workflow: install deps, run dev server, run prebuild, run tests, code style (Prettier/ESLint config reference), provider addition checklist, and how to run the CLI.

## 13. Minor / Quick Wins

- **Add `X-Request-ID` header passthrough** — `src/sse/handlerRegistry.js`: generate UUID per request and log it. Helps correlate logs across the 3-tier fallback path.
- **Configurable timeout per provider** — `open-sse/config/providerModels.js`: some providers (like free Gemini CLI) are slower; allow per-provider timeout override.
- **Model alias auto-completion in dashboard** — `src/app/combos/[id]/edit/page.js`: as user types in model field, suggest known models from `open-s-e/config/providerModels.js`.
- **Provider-specific system prompt override** — `src/app/providers/[id]/edit/page.js`: allow setting per-provider system prompt that gets prepended to every request to that provider.
- **Copy cURL button on dashboard API docs** — Add a "Copy as cURL" button for each endpoint on the dashboard so users can easily test endpoints from their terminal.
- **Show token usage breakdown by provider on usage page** — `src/app/usage/page.js`: bar chart showing which providers consumed the most tokens/cost this billing period.
- **Auto-refresh OAuth tokens on startup** — `open-sse/services/tokenRefresh.js`: scan DB for expired OAuth tokens on router startup and refresh them proactively so the first request doesn't time out.
- **Export usage data to CSV** — `src/app/usage/page.js`: add export button that downloads `usage.json` data as CSV for spreadsheet analysis.
