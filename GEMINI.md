# GEMINI.md

# involvex-claude-router

involvex-claude-router is a local AI routing gateway and dashboard built on Next.js. It provides a single OpenAI-compatible endpoint (`/v1/*`) and routes traffic across multiple upstream providers with translation, fallback, token refresh, and usage tracking.

## Project Overview

- **Purpose:** Maximize AI subscriptions and minimize costs by auto-routing between Subscription, Cheap, and Free AI models with smart fallback.
- **Main Technologies:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Node.js 20+, Bun, LowDB.
- **Key Features:**
  - **Smart 3-Tier Fallback:** Subscription → Cheap → Free.
  - **Format Translation:** Seamless translation between OpenAI, Claude, and Gemini formats.
  - **Multi-Account Support:** Round-robin or priority-based routing across multiple accounts per provider.
  - **Real-Time Quota Tracking:** Live token count and reset countdowns.
  - **Cloud Sync:** Optional synchronization of configuration across devices via Cloudflare Workers.

## Architecture Highlights

- **Frontend:** Next.js dashboard for management (Providers, Combos, Aliases, Usage).
- **API Surface:** OpenAI-compatible compatibility endpoints (`/v1/*`) and management APIs (`/api/*`).
- **Core Routing:** Shared logic in `src/sse/*` and `open-sse/*` for provider execution, translation, and fallback.
- **Persistence:** Configuration stored in `db.json`, usage in `usage.json`, and request logs in `log.txt` (typically under `~/.involvex-claude-router` or `APPDATA/involvex-claude-router`).

## Building and Running

- **Install Dependencies:** `npm install` (or `bun install`).
- **Development Server:** `npm run dev` (Runs on `http://localhost:20128` by default).
- **Build for Production:** `npm run build`.
- **Start Production Server:** `npm run start`.
- **Linting:** `npm run lint` or `npm run lint:fix`.
- **Formatting:** `bun run format` (uses Prettier).
- **Docker:** `docker build -t 9router .`

## Development Conventions

- **Framework:** Next.js 16 with App Router.
- **Language:** JavaScript (ESM).
- **Styling:** Tailwind CSS 4.
- **State Management:** LowDB for server-side persistence, Zustand for client-side state.
- **Linting:** ESLint 9 (Flat Config) with `eslint-config-next`.
- **Formatting:** Prettier with plugins for organizing imports and package.json sorting.
- **Security:** Dashboard protected by JWT (`JWT_SECRET`). API endpoints support Bearer token auth (`REQUIRE_API_KEY`).

## Directory Structure

- `src/app/`: Next.js dashboard UI and API routes.
- `src/sse/`: Server logic for handling chat requests and compatibility layers.
- `open-sse/`: Core routing, translation, and provider execution logic.
- `cloud/`: Cloudflare Worker source for cloud sync features.
- `docs/`: Technical documentation (Architecture, etc.).
- `src/lib/`: Library functions for DB access, auth, and utilities.
- `tests/`: Vitest unit and integration tests.
