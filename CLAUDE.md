# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Core Development Commands

- **Install dependencies:**
  - `npm install` _or_ `bun install`
- **Format code (Prettier):**
  - `npm run format` — formats all
  - `npm run format:check` — check only
- **Lint with ESLint:**
  - `npm run lint`
  - `npm run lint:fix`
- **Development server:**
  - `npm run dev` (Next.js, port 20128)
- **Production build:**
  - `npm run build` (calls `prebuild` for lint+format)
- **Start production server:**
  - `npm run start`
- **Testing (Vitest):**
  - Run all: `npx vitest` or `npx vitest run`
  - Single file: `npx vitest path/to/file.spec.ts`
  - By name: `npx vitest -t "test name"`

_Both Node and Bun should be installed for all workflows to function fully._

---

## High-Level Architecture & Structure

- **Next.js App Router** (frontend and API):
  - `src/app/` — dashboard UI, Next.js API route handlers
  - `src/sse/` — real-time server chat logic, API endpoints
  - `open-sse/` — translation, routing, provider adapters for LLM APIs
  - `cloud/` — Cloudflare Worker code for device sync
  - `src/lib/` — shared helpers (DB, auth, config)
  - `tests/`, `docs/` — testing and documentation

### Central Patterns

- **Provider Adapter Pattern:** Routing/translation between LLM APIs (OpenAI, Claude, Gemini) is handled in `open-sse/translator/` via adapters.
- **Three-tier fallback:** Requests try paid (Subscription), then Cheap, then Free providers.
- **Persistent config:** Managed via LowDB in user app data (never checked into repo).
- **Multi-account logic:** All providers support multiple accounts, with rotation and failover built-in.
- **CLI entrypoints** available via npm/yarn bin scripts and PowerShell for Windows.

---

## Key Conventions & Tooling

- **ESM only:** All source is native ESM (JavaScript or TypeScript), no `tsc` build step.
- **Lint/format enforced on build via `prebuild`** (see package.json).
- **Require JWT_SECRET for dashboard, REQUIRE_API_KEY for API.** CI and prod must define these.
- **Tailwind CSS v4:** Use CSS-first @import styling.
- **No persistent files should live in the repo root**—runtime data goes to user config paths.

---

## Copilot & Workflow Notes

- GitHub Copilot instructions live in `.github/copilot-instructions.md`. Key rules:
  - Reference actual runner scripts and commands in outputs.
  - Avoid test code generation that relies on test frameworks not present in package.json.
  - For multi-file changes, prefer small, reviewable PRs referencing intended workflows.
- See `GEMINI.md` for implementation, translation, and edge-case patterns for API routing.
- Where you see fallback or provider selection logic, always check for explicit CI/prod requirements and edge-case handling (auth, missing keys, downtime).

---

## For Documentation & Next Steps

- For architecture/usage, see `GEMINI.md`, `docs/ARCHITECTURE.md`.
- Update this file with new workflow requirements, patterns, or major integrations affecting how agents collaborate across the codebase.
