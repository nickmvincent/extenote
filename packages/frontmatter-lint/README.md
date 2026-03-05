# @extenote/frontmatter-lint

Reusable frontmatter schema validator and linter for markdown files.

## CLI

```bash
frontmatter-lint check <content-dir> --schema-dir <schema-dir>
```

Key options:
- `--fix` add missing visibility field using default visibility
- `--json` machine-readable output
- `--include <glob>` include pattern (repeatable)
- `--exclude <glob>` exclude pattern (repeatable)

## Library

```ts
import { lintFrontmatter, loadSchemas } from "@extenote/frontmatter-lint";
```
