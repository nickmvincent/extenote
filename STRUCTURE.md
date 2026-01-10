# Extenote Structure

Quick reference for navigating the codebase. See CLAUDE.md for detailed instructions.

## Package Dependency Graph

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     CLI     │     │     TUI     │     │     Web     │
│ (commands)  │     │  (ink/react)│     │(react+bun)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Core     │
                    │  (business  │
                    │   logic)    │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
       ┌─────────┐   ┌─────────┐   ┌─────────┐
       │ Semble  │   │Discussion│   │ Network │
       │ Plugin  │   │  Plugin  │   │ Plugin  │
       └─────────┘   └─────────┘   └─────────┘
```

**Rule:** All business logic lives in `@extenote/core`. Interfaces (CLI, TUI, Web) only contain UI code.

## Data Flow

```
Content (markdown files)
         │
         ▼
    ┌─────────┐
    │ loadVault│ ← reads from EXTENOTE_CONTENT_ROOT
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │ validate │ ← checks against schemas/*.yaml
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │  lint   │ ← cross-ref checks, tag validation
    └────┬────┘
         │
         ├──────────────────┬──────────────────┐
         ▼                  ▼                  ▼
    ┌─────────┐        ┌─────────┐        ┌─────────┐
    │ export  │        │  build  │        │  deploy │
    │ (json)  │        │(astro/  │        │(cf/gh/  │
    │         │        │ quarto) │        │ vercel) │
    └─────────┘        └─────────┘        └─────────┘
```

## Directory Map

```
packages/
├── core/src/
│   ├── index.ts          # Public API exports
│   ├── types.ts          # All TypeScript types
│   ├── errors.ts         # Domain error classes
│   ├── constants.ts      # Environment defaults
│   ├── vault.ts          # Content loading
│   ├── validation.ts     # Schema validation
│   ├── lint.ts           # Cross-ref & tag linting
│   ├── build.ts          # Build orchestration
│   ├── tags.ts           # Tag management
│   ├── citations.ts      # Citation tracking
│   ├── crossref.ts       # Wiki-link parsing
│   └── plugins/
│       ├── semble/       # ATProto card sync
│       ├── discussion/   # GitHub/Whitewind threads
│       ├── network/      # Network page generation
│       └── refcheck/     # DBLP/OpenAlex validation
│
├── cli/src/
│   ├── index.ts          # Entry point
│   └── commands/
│       ├── utils.ts      # Shared CLI utilities
│       ├── init.ts       # System setup
│       ├── doctor.ts     # Health check
│       ├── status.ts     # Project status
│       ├── content/      # Content commands
│       │   ├── view.ts
│       │   ├── list.ts
│       │   ├── edit.ts
│       │   ├── search.ts
│       │   ├── create.ts
│       │   ├── export.ts
│       │   ├── lint.ts
│       │   ├── issues.ts
│       │   └── tags.ts
│       └── project/      # Project commands
│           ├── build.ts
│           ├── deploy.ts
│           ├── websites.ts
│           ├── sync.ts
│           ├── discussions.ts
│           ├── sync-citations.ts
│           └── refcheck.ts
│
├── web/src/
│   ├── server.ts         # Bun HTTP server
│   ├── server/
│   │   ├── cache.ts      # Vault caching
│   │   └── handlers/     # API endpoint handlers
│   └── components/       # React UI components
│
├── tui/src/
│   ├── index.ts          # Entry point
│   └── pages/            # Terminal UI pages
│
└── refcheck/src/         # Standalone reference checker
    ├── index.ts
    └── providers/        # DBLP, OpenAlex, etc.
```

## Extension Points

### Adding a new CLI command

1. Create file in `packages/cli/src/commands/content/` or `project/`
2. Export `registerXxxCommand(program: Command)` function
3. Import and register in `commands/index.ts`

### Adding a new plugin

1. Create directory in `packages/core/src/plugins/<name>/`
2. Create `index.ts` with exported functions
3. Add exports to `packages/core/src/index.ts`

### Adding a new schema field

1. Edit relevant schema in `schemas/*.yaml`
2. Update TypeScript types if needed in `packages/core/src/types.ts`
3. Run `bun run lint` to verify

### Adding a new project

1. Create `projects/<name>.yaml` with sources, build, deploy config
2. Create content directory in `extenote-pub/content/<name>/`
3. Create website directory in `extenote-pub/websites/<name>-astro/` (if needed)

## Key Types

```typescript
// Core content unit
interface VaultObject {
  slug: string;
  frontmatter: Record<string, unknown>;
  content: string;
  filePath: string;
  sourceId: string;
}

// Validation result
interface VaultIssue {
  slug: string;
  severity: "error" | "warning" | "info";
  message: string;
  field?: string;
}

// Project configuration
interface ExtenoteConfig {
  name: string;
  sources: SourceConfig[];
  schemas?: string[];
  build?: BuildConfig;
  deploy?: DeployConfig;
}
```

## Common Operations

| Task | Entry Point | Key Function |
|------|-------------|--------------|
| Load content | `core/vault.ts` | `loadVault()` |
| Validate | `core/validation.ts` | `validateObjects()` |
| Lint | `core/lint.ts` | `lintObjects()` |
| Export JSON | `core/exporters/` | `exportContent()` |
| Build site | `core/build.ts` | `buildProject()` |
| Check refs | `core/plugins/refcheck/` | `checkBibtexEntries()` |
| Manage tags | `core/tags.ts` | `renameTag()`, `mergeTags()` |
