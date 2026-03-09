# @extenote/semble-sync

Standalone Semble sync library for two-way syncing markdown-frontmatter objects to `semble.so` / ATProto.

This package contains the Semble implementation extracted from `@extenote/core`, with lightweight types so it can be reused by other tools without pulling in all core internals.

## Install

```bash
bun add @extenote/semble-sync
```

## Exports

- `SembleClient`
- `syncWithSemble()`
- `validateSembleConfig()`
- `listCollections()`
- `computeObjectHash()`

## Basic Usage

```ts
import { syncWithSemble } from "@extenote/semble-sync";

const result = await syncWithSemble({
  objects,
  config,
  sembleConfig: {
    enabled: true,
    identifier: "your.handle.bsky.social",
    password: process.env.SEMBLE_APP_PASSWORD,
    types: ["bibtex_entry"],
    publicOnly: true,
    syncTag: "semble",
  },
  cwd: process.cwd(),
  project: "shared-references",
  options: {
    dryRun: true,
    mergeStrategy: "skip-conflicts",
  },
});
```

## Input Shape

`syncWithSemble()` intentionally depends on lightweight interfaces:

- `SyncObject`: markdown object with `frontmatter`, `visibility`, and path metadata
- `SyncExtenoteConfig`: minimal project/source configuration for pull output paths
- `SembleConfig`: auth and filtering options (`types`, `publicOnly`, `syncTag`, etc.)

See [`src/types.ts`](./src/types.ts) for the full contract.

## Migration Notes

- Existing imports from `@extenote/core` still work via compatibility re-exports.
- For direct Semble integrations (custom CLIs, plugins, automations), prefer importing from `@extenote/semble-sync`.

This package is intentionally framework-agnostic and can be consumed by `@extenote/core`, CLI tools, or other sync orchestrators.
