# Contributing to Extenote

Thanks for your interest in contributing!

## Getting Started

1. Fork the repo and clone locally
2. Run `bun install` to install dependencies
3. Copy `.env.example` to `.env` and configure paths
4. Run `bun run test` to verify setup

## Development

```bash
bun run build     # Build all packages
bun run lint      # Type checking
bun run test      # Run tests
bun run cli -- <cmd>  # Test CLI commands
bun run web       # Start web UI (localhost:3000 API, localhost:3001 Vite)
bun run tui       # Start terminal UI
```

## Architecture

All business logic lives in `@extenote/core`. Interfaces (CLI, TUI, Web) only contain UI code.

```
CLI ---\
TUI ----+---> @extenote/core
Web ---/
```

**Adding features:**
- Reusable logic: `packages/core/src/`
- CLI commands: `packages/cli/src/commands/`
- API endpoints: `packages/web/src/server/handlers/`
- TUI pages: `packages/tui/src/pages/`

**Configuration:**
- Schemas: `schemas/*.yaml`
- Project configs: `projects/*.yaml`

## Testing Requirements

**Before submitting:**
- `bun run lint` must pass
- `bun run test` must pass

**When to run what:**
- Content changes: `bun run cli -- validate <project>`
- Schema/config changes: `bun run lint && bun run test`
- Code changes: `bun run lint && bun run test`

## Pull Requests

- Keep changes focused and minimal
- Write clear commit messages describing the "why"
- Don't over-engineer: only add what's needed for the task
- Avoid adding features or refactoring code beyond what's requested

## Code Style

- TypeScript throughout
- Prefer small, focused functions
- Export from `packages/core/src/index.ts` if needed elsewhere
- No unused exports or dead code

## Content Contributions

Content lives in `extenote-pub/content/`. Each file has YAML frontmatter validated against schemas.

**Adding references:**
1. Create file in `extenote-pub/content/shared-references/`
2. Use frontmatter from `schemas/bibtex_entry.yaml`
3. Run `bun run cli -- validate shared-references`
4. Optionally verify with `bun run cli -- refcheck shared-references`

## Questions?

Open an issue for bugs or feature requests.
