# @extenote/core

Core library for Extenote vault operations: configuration loading, schema validation, content export, and plugin systems.

## Installation

```bash
bun add @extenote/core
```

## API

### Vault Loading

```typescript
import { loadVault, loadConfig, loadSchemas } from '@extenote/core';

// Load complete vault state
const vault = await loadVault({ cwd: process.cwd() });
console.log(vault.objects.length, 'objects');
console.log(vault.issues.length, 'issues');

// Load config only
const config = await loadConfig({ cwd: process.cwd() });

// Load schemas only
const schemas = await loadSchemas(config, process.cwd());
```

### Export

```typescript
import { exportContent } from '@extenote/core';

await exportContent({
  format: 'json',  // json | markdown | html | atproto | bibtex
  outputDir: 'dist/export',
  objects: vault.objects,
  config: vault.config,
  schemas: vault.schemas
});
```

### Linting

```typescript
import { lintObjects } from '@extenote/core';

const result = await lintObjects(objects, config, { fix: true });
console.log(result.issues);      // validation issues
console.log(result.updatedFiles); // files modified by autofix
```

### Build & Deploy

```typescript
import { buildProject, deployProject } from '@extenote/core';

const buildResult = await buildProject(project, {
  cwd: process.cwd(),
  websitesDir: '../extenote-pub/websites',
  verbose: true
});

const deployResult = await deployProject(project, {
  websitesDir: '../extenote-pub/websites'
});
```

## Plugins

### Semble (ATProto Sync)

```typescript
import { syncWithSemble, validateSembleConfig } from '@extenote/core';

const result = await syncWithSemble({
  objects,
  config,
  sembleConfig: project.semble,
  cwd: process.cwd(),
  project: 'my-project'
});
```

### Discussions

```typescript
import { publishDiscussions, publishProjectDiscussion } from '@extenote/core';

// Per-object discussions
const result = await publishDiscussions({
  objects,
  discussionConfig: config.discussion
});

// Project-level discussion
const projectResult = await publishProjectDiscussion({
  projectName: 'my-project',
  discussionConfig: config.discussion
});
```

### Check (Bibliography Verification)

```typescript
import { checkBibtexEntries, getAvailableProviders } from '@extenote/core';

const providers = getAvailableProviders(); // ['auto', 'dblp', 'openalex']

const report = await checkBibtexEntries(objects, {
  provider: 'auto',
  dryRun: false
});
```

## Types

Key types exported from `@extenote/core`:

- `VaultState` - Complete vault with config, schemas, objects, issues
- `VaultObject` - A markdown file with parsed frontmatter
- `ExtenoteConfig` - Configuration from `projects/*.yaml`
- `LoadedSchema` - Schema definition from `schemas/*.yaml`
- `VaultIssue` - Validation or lint issue
- `ProjectProfile` - Per-project configuration
- `BuildConfig` / `DeployConfig` - Build and deploy settings

See `src/types.ts` for full type definitions.

## Directory Structure

```
src/
├── index.ts          # Public API exports
├── types.ts          # Type definitions
├── config.ts         # Config loading from projects/
├── schemas.ts        # Schema loading from schemas/
├── vault.ts          # Vault assembly
├── validation.ts     # Object validation
├── lint.ts           # Lint rules
├── build.ts          # Build & deploy
├── exporters/        # Export format handlers
├── plugins/          # Plugin systems
│   ├── semble/       # ATProto sync
│   ├── discussion/   # Discussion threads
│   ├── network/      # Network data generation
│   └── check/        # Bibliography verification
└── sources/          # Content source loaders
```
