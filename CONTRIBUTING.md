# Contributing to 9router (involvex-claude-router)

Thanks for your interest in contributing! This document covers everything you need to get started.

## Prerequisites

- **Node.js** 20+ (required for Next.js and all server-side code)
- **Bun** >= 1.3.0 (required for package management, formatting, and linting)
- **PowerShell 7+** on Windows (for CLI commands)

Install Bun:

```bash
# macOS
brew install bun

# Windows
powershell -c "iwr https://bun.sh/install.ps1 -UseBasicParsing | iex"

# Linux
curl -fsSL https://bun.sh/install | bash
```

## Setup

```bash
# Install dependencies (from repo root)
bun install

# Or using npm
npm install
```

## Development

Start the development server:

```bash
npm run dev
```

The dashboard will be available at `http://localhost:20128`.

### Project Structure

| Directory   | Purpose                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`      | Next.js app: dashboard UI, API routes (`/api/*` and `/v1/*`), Zustand stores, shared components, hooks, constants                                           |
| `open-sse/` | Shared routing core: translators (`translator/`), executors (`executors/`), handlers (`handlers/`), services (`services/`), config, utilities, transformers |
| `cli/`      | CLI tool (`ccr` / `claude-router`) written in TypeScript                                                                                                    |
| `cloud/`    | Cloudflare Worker for cloud sync                                                                                                                            |
| `src/mitm/` | Local HTTPS MITM proxy for intercepting tool calls                                                                                                          |
| `tests/`    | Vitest unit and integration tests                                                                                                                           |

### Key Patterns

- **ESM only**: All source is native ESM. No TypeScript compilation step for `src/` or `open-sse/`.
- **Provider adapters**: Routing/translation between LLM APIs (OpenAI, Claude, Gemini, Codex, Kiro, etc.) is handled in `open-sse/translator/`.
- **Three-tier fallback**: Requests try paid (OAuth providers), then cheap (API key), then free (CLI-based providers).
- **Config persistence**: LowDB stores config in `db.json` under the OS app data directory (`~/.9router` on Linux/macOS, `%APPDATA%\9router` on Windows).
- **Usage tracking**: `src/lib/usageDb.js` tracks request history, active requests, and cost via `src/shared/constants/pricing.js`.

## Code Style

All code is formatted with Prettier and linted with ESLint (flat config with `eslint-config-next`).

```bash
# Format all code
npm run format

# Check formatting without changes
npm run format:check

# Lint
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Prebuild: format + lint fix (runs automatically before `npm run build`)
npm run prebuild
```

### Import Style

Use the `@/` alias for internal imports (configured in `jsconfig.json`):

```javascript
import { getExecutor } from "open-sse/executors/index.js";
import { handleChat } from "@/sse/handlers/chat.js";
import { cn } from "@/shared/utils/cn";
```

## Testing

Tests use Vitest. Run all tests:

```bash
# Run tests once
npm run test:run

# Watch mode
npm run test

# With coverage
npm run test:coverage

# Run a single test file
npx vitest path/to/file.test.js
```

### Writing Tests

1. Place test files in `tests/unit/` or `tests/integration/`
2. Follow the existing pattern in `tests/unit/embeddingsCore.test.js` — mock external dependencies (executors, proxyFetch), import the module under test
3. Use descriptive `describe`/`it` blocks with clear assertions
4. Run `npm run test:run` before committing

### Test Mocks

The existing tests mock `open-sse/executors/index.js` to avoid UUID and native dependency issues:

```javascript
vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: vi.fn(() => ({
    refreshCredentials: vi.fn().mockResolvedValue(null),
  })),
  hasSpecializedExecutor: vi.fn(() => false),
}));
```

## CLI Development

The CLI is in `cli/` and written in TypeScript. It's compiled with Bun:

```bash
# Build CLI
bun run --cwd cli build

# Lint CLI
npm run lint:cli

# Format CLI
npm run format:cli
```

The CLI commands live in `cli/src/cli/commands/` and are registered in `cli/src/cli/index.ts`.

**Available commands:**

- `ccr start` — Start the router dev server
- `ccr stop` — Stop the router
- `ccr status [--json]` — Show router status (or machine-readable JSON)
- `ccr models <list|add|remove>` — Manage models
- `ccr config <list|get|set|delete> [key] [value]` — Manage config (reads `db.json`)
- `ccr logs [--follow] [--lines N]` — View router logs

## Building for Production

```bash
# Full production build (includes format + lint:fix)
npm run build

# This runs:
# 1. bun run format  (prettier)
# 2. bun run lint:fix (eslint)
# 3. next build --turbo
# 4. bun run build:cli
```

## Adding a New Provider

1. **API Key provider**: Add to `APIKEY_PROVIDERS` in `src/shared/constants/providers.js` and add pricing in `src/shared/constants/pricing.js`
2. **OAuth provider**: Add to `OAUTH_PROVIDERS`, create service in `src/lib/oauth/services/`, register in `src/lib/oauth/services/index.js`
3. **CLI-based provider (free)**: Register executor in `open-sse/executors/index.js`, add OAuth service
4. **OpenAI-compatible**: Uses `DefaultExecutor` automatically — just add to `APIKEY_PROVIDERS`
5. Add provider config (baseUrl, format, headers) in `open-sse/config/constants.js` under `PROVIDERS`

## Environment Variables

| Variable          | Required   | Purpose                               |
| ----------------- | ---------- | ------------------------------------- |
| `JWT_SECRET`      | Production | Dashboard authentication              |
| `REQUIRE_API_KEY` | Production | Require API key for `/v1/*` endpoints |

## Pull Request Guidelines

1. Keep PRs small and focused (prefer < 200 lines)
2. Run `npm run prebuild` before committing
3. Add tests for new features or bug fixes
4. Update this file if you add new commands, scripts, or patterns
