# Copilot instructions for this repository

This file helps future Copilot sessions understand how to build, run, and navigate the 9Router codebase.

## Build, test, and lint commands

- Install dependencies: `npm install` (or `bun install`).
- Development server: `npm run dev` (Next.js dev server on http://localhost:20128 by default).
- Build production: `npm run build` (Next.js build with --turbo).
- Start production: `npm run start`.
- Format: `npm run format` (Prettier). Check-only: `npm run format:check`.
- Lint: `npm run lint`. Auto-fix: `npm run lint:fix`.

Tests: this repo uses Vitest (see `docs/` and `tests/`), but there is no top-level `test` npm script in package.json. To run tests manually (single file or pattern):

- Run all tests (if vitest installed): `npx vitest` or `npx vitest run`.
- Run a single test file: `npx vitest path/to/file.spec.ts` (or `.test.ts`).
- Run tests matching a name: `npx vitest -t "test name regex"`.

Note: some developer tooling uses Bun (prebuild uses `bun run format`), so `bun` can be used where convenient.

## High-level architecture (big picture)

- Tech stack: Next.js 16 (App Router) frontend + Node server pieces; React 19; Tailwind CSS v4; Node 20+ runtime compatibility.

- Frontend (UI): `src/app/` — Next.js App Router pages and components powering the dashboard for Providers, Combos, Aliases, and Usage views.

- API surface:
  - OpenAI-compatible public endpoint(s): `/v1/*` implemented in server routing logic (see `src/sse/` and `open-sse/`).
  - Management APIs (Next.js server/API routes) under `src/app/api` (or `src/app` per App Router conventions).

- Routing & core execution:
  - `open-sse/` contains the core routing, provider translation, fallback, token refresh, and execution logic shared across the system.
  - `src/sse/` contains server-side glue for chat handling, compatibility layers and integrations with Next.js
  - These layers implement the 3-tier fallback: Subscription → Cheap → Free and format translation between OpenAI, Claude, and Gemini formats.

- Persistence & local files:
  - Configuration persisted with LowDB and stored in `db.json` (default under the app data dir, e.g., `~/.9router` or `%APPDATA%/involvex-claude-router`).
  - Usage stored in `usage.json` and logs in `log.txt` (same app-data location).
  - Some modules use Better-SQLite3 for other storage needs.

- Cloud sync: `cloud/` contains Cloudflare Worker source for optional config sync across devices.

- Scripts & bootstrap:
  - CLI scripts: `scripts/start-router.ps1` is exposed as `ccr` / `claude-router` in package.json `bin` for convenience on Windows.
  - Docker support: `Dockerfile` and `docker build -t 9router .` instructions in docs.

## Key conventions and repo-specific patterns

- App Router & file layout: Project uses Next.js App Router conventions; look for `src/app/` for routes, `src/lib/` for helpers.

- Language & module style: JavaScript ESM modules (no TypeScript compilation step required in repo). Keep imports using the ESM/Next.js style.

- Styling: Tailwind CSS v4 with the new CSS-first `@import "tailwindcss"` pattern; PostCSS plugin present for integration.

- Formatting & linting: Prettier (with organize-imports/packagejson plugins) and ESLint (Next.js flat config). Prebuild hook runs format + lint:fix.

- Persistence: LowDB is the canonical config store. Expect runtime files under the OS app-data directory rather than under the repo; check GEMINI.md and `src/lib` helpers for the exact path resolution.

- Auth & security flags: Environment-driven runtime behaviors — notably `JWT_SECRET` for dashboard protection and `REQUIRE_API_KEY` for API access. Treat these env vars as required for secure features in CI or production.

- Provider pattern: Providers, Combos, and Aliases are core domain concepts — the router holds multiple accounts per provider and selects/round-robins according to configuration. Look to `open-sse/` for translation adapters between provider formats.

- CLI & Windows support: The package exposes PowerShell startup scripts and Windows-friendly `bin` entries; prefer `npm run dev` for cross-platform development but the provided PS1 script simplifies starting the router on Windows.

## Helpful file pointers

- `GEMINI.md` — concise project overview and architecture highlights (read this first).
- `docs/ARCHITECTURE.md` — deeper architecture notes (contains the components and flow diagrams).
- `open-sse/` — core routing, translation, and provider execution logic.
- `src/sse/` — Next.js server integration and compatibility code.
- `src/lib/` — DB helpers, auth, and common utilities.

## Known developer workflows and tips (repository-specific)

- Prebuild runs format + lint:fix. When preparing a production build, run `npm run prebuild` (invoked automatically by `npm run build`).
- If using Bun for speed, be mindful that some commands (like `npm run build` / `next build`) still rely on Node.js tooling; install both Bun and Node per the README if you use Bun locally.

## Integrations & AI assistant config files

- This repo includes `GEMINI.md` (project overview). No `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or other AI assistant config files were found at workspace root when this instruction file was created. If those files are added, consider surfacing them here.

## Where to look next

- `docs/` for architecture and operational details.
- `src/` and `open-sse/` for runtime routing and provider adapters.

---

If you'd like, additions can include detailed test-run examples (specific test file paths) after adding a `test` script to package.json, or more explicit environment variable documentation extracted from `src/lib` or server-init files.
