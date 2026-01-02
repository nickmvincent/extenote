# Extenote CLI

## Commands

### Content Management
- `status` — vault summary (objects, issues, visibility mix)
- `issues [--limit N]` — severity-sorted inbox (20 by default)
- `lint [--fix]` — lint objects and optionally auto-fix issues
- `create <schema> [slug]` — scaffold markdown using schema requirements
- `creator [--schema name] [--dir path]` — guided creator wizard
- `export-project <project> --format json|markdown|html|atproto|bibtex [-o dir]` — export project content
- `refcheck [project]` — validate bibliographic references (alias: `check`)
- `guide [--project name]` — print ready-to-run create/export commands

### Build & Deploy
- `build [project]` — build website(s) for projects
  - `build --list` — list buildable projects
  - `build <project>` — build single project
  - `build all` — build all configured projects
  - `build --dry-run` — preview build steps without executing
  - `build --verbose` — show detailed build output

- `deploy [project]` — deploy website(s) to hosting platforms
  - `deploy --list` — list deployable projects
  - `deploy <project>` — deploy single project
  - `deploy all` — deploy all configured projects
  - `deploy --dry-run` — preview deploy commands

### Discussions
- `discussions create [project]` — create discussion threads
- `discussions list [pattern]` — list existing discussion links
- `discussions validate` — validate provider configurations

### Semble Sync
- `sync [project]` — sync with Semble (ATProto research network)
  - `sync --list` — list projects with Semble config
  - `sync --list-collections` — list your Semble collections
  - `sync --validate` — validate Semble configuration
  - `sync <project>` — bidirectional sync
  - `sync <project> --push-only` — push local changes only
  - `sync <project> --pull-only` — pull remote cards only
  - `sync <project> --dry-run` — preview without changes
  - `sync <project> --force` — force re-sync all objects
  - `sync <project> --merge-strategy <strategy>` — conflict resolution
  - `sync <project> --sync-deletes` — delete remote cards for deleted local files
  - `sync <project> --relink-collection` — link existing cards to collection

## Usage

```bash
bun run --cwd packages/cli build
bun run cli -- status
bun run cli -- build --list
bun run cli -- deploy data-leverage-blogs
bun run cli -- sync my-project --dry-run
```

Use `--cwd` to point at any Extenote workspace.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SEMBLE_APP_PASSWORD` | App password for Semble/ATProto authentication |
| `ATPROTO_APP_PASSWORD` | Alternative name for ATProto password |
| `GITHUB_TOKEN` | Token for GitHub discussions integration |
