# AGENTS.md

This file provides comprehensive guidance for AI agents working on the Involvex's Claude Router codebase. It consolidates essential information from CLAUDE.md, GEMINI.md, and copilot-instructions.md into a single reference for agent workflows.

---

## Useful Commands

### Installation & Setup

| Command       | Description                             |
| ------------- | --------------------------------------- |
| `npm install` | Install all dependencies                |
| `bun install` | Install dependencies using Bun (faster) |

### Development

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Start development server on port 20128   |
| `npm run build`    | Build for production (includes prebuild) |
| `npm run start`    | Start production server                  |
| `npm run prebuild` | Run format + lint:fix before build       |

### Code Quality

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| `npm run format`       | Format all code with Prettier    |
| `npm run format:check` | Check formatting without changes |
| `npm run lint`         | Run ESLint analysis              |
| `npm run lint:fix`     | Auto-fix ESLint issues           |

### Testing

| Command                           | Description               |
| --------------------------------- | ------------------------- |
| `npx vitest`                      | Run all tests             |
| `npx vitest run`                  | Run all tests once        |
| `npx vitest path/to/file.spec.ts` | Run single test file      |
| `npx vitest -t "test name"`       | Run tests matching a name |

### Docker

| Command                     | Description        |
| --------------------------- | ------------------ |
| `docker build -t 9router .` | Build Docker image |

---

## Technologies

### Core Stack

| Technology | Version | Purpose                                   |
| ---------- | ------- | ----------------------------------------- |
| Next.js    | 16      | App Router framework for frontend and API |
| React      | 19      | UI library                                |
| Node.js    | 20+     | Runtime                                   |
| Bun        | Latest  | Package manager and dev tooling           |

### Styling & UI

| Technology      | Purpose                                        |
| --------------- | ---------------------------------------------- |
| Tailwind CSS v4 | CSS-first styling with `@import "tailwindcss"` |

### State & Persistence

| Technology     | Purpose                               |
| -------------- | ------------------------------------- |
| LowDB          | Server-side configuration persistence |
| Zustand        | Client-side state management          |
| Better-SQLite3 | Additional storage needs              |

### Code Quality

| Technology | Purpose                                      |
| ---------- | -------------------------------------------- |
| ESLint 9   | Linting with flat config                     |
| Prettier   | Code formatting with organize-imports plugin |
| Vitest     | Unit and integration testing                 |

### Infrastructure

| Technology         | Purpose            |
| ------------------ | ------------------ |
| Cloudflare Workers | Cloud sync feature |

---

## Best Practices and Guidelines

### Project Structure

- **Use App Router conventions**: Place routes in `src/app/` and helpers in `src/lib/`
- **Core routing logic**: Found in `open-sse/` for provider translation and fallback
- **Server integration**: Found in `src/sse/` for chat handling and compatibility
- **Cloud sync**: Code lives in `cloud/` for Cloudflare Workers

### Code Standards

- **ESM only**: All source is native ESM JavaScript, no TypeScript compilation step
- **Prebuild enforcement**: Always run format + lint before commits via `npm run prebuild`
- **File organization**: Keep imports using ESM/Next.js style

### Security

- **Environment variables**:
  - `JWT_SECRET` — Required for dashboard protection
  - `REQUIRE_API_KEY` — Required for API access in CI/prod
- **Never commit secrets**: Runtime data goes to user config paths, not repo root

### Provider Patterns

- **Three-tier fallback**: Subscription → Cheap → Free providers
- **Multi-account routing**: Round-robin or priority-based across multiple accounts
- **Format translation**: OpenAI, Claude, and Gemini formats handled in `open-sse/translator/`

### Development Workflow

1. **Before building**: Run `npm run prebuild` to ensure code quality
2. **Use Bun for tooling**: Faster for format/lint, but both Node and Bun needed
3. **Test before committing**: Run relevant tests with Vitest
4. **Small PRs**: Prefer small, reviewable changes for multi-file updates

### Key Files to Reference

| File                              | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `GEMINI.md`                       | Project overview and architecture highlights |
| `CLAUDE.md`                       | Claude-specific guidance                     |
| `.github/copilot-instructions.md` | GitHub Copilot instructions                  |
| `docs/ARCHITECTURE.md`            | Deep architecture documentation              |
| `src/lib/`                        | DB helpers, auth, and utilities              |

### Common Patterns

- **Provider adapters**: Located in `open-sse/translator/` for routing between LLM APIs
- **Configuration persistence**: LowDB stores `db.json` under user app data (`~/.involvex-claude-router` or `%APPDATA%/involvex-claude-router`)
- **Usage tracking**: Stored in `usage.json` and logs in `log.txt`

---

## Environment Configuration

### Required for Production/CI

```bash
JWT_SECRET=your-jwt-secret
REQUIRE_API_KEY=your-api-key
```

### Runtime Paths

- Configuration: `~/.involvex-claude-router/db.json` (Linux/macOS) or `%APPDATA%/involvex-claude-router/db.json` (Windows)
- Usage: Same directory as above, `usage.json`
- Logs: Same directory as above, `log.txt`

---

## Additional Resources

- **Architecture docs**: See `docs/ARCHITECTURE.md` for detailed component diagrams
- **Provider implementation**: See `open-sse/` for translation and execution logic
- **Windows CLI**: Use `scripts/start-router.ps1` or bin entries (`ccr` / `claude-router`)
