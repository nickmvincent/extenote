# Extenote Status

Last verified: 2026-01-02

## Health Summary

| Metric | Status |
|--------|--------|
| Build | Passing |
| Lint | Clean |
| Tests | 537/537 passing |
| Vault | 827 objects, 3 issues |

```bash
# Quick health check
bun run build && bun run lint && bun run test
bun run cli -- status
```

---

## Current Capabilities

**Version:** 0.1.0 (all packages)

**Core:**
- Schema-driven Markdown objects with YAML frontmatter
- Multi-project vault with cross-project linking (12 projects configured)
- Linting and validation with autofix
- Export to JSON, Markdown, HTML, BibTeX, ATProto
- Reference checking against DBLP, OpenAlex, Crossref, Semantic Scholar
- Tag management with taxonomy validation
- Website building (Astro, Quarto) and deployment
- Backup/undo for destructive operations

**Interfaces:**
- CLI: 23 commands
- Web UI: browsing, refcheck, tags, graphs, settings
- Browser extension (clipper): reference clipping + bookmark saving
- TUI: basic browsing and export

---

## Architecture

```
+---------+  +---------+  +---------+  +---------+
|   CLI   |  |   TUI   |  |   Web   |  | Clipper |
+----+----+  +----+----+  +----+----+  +----+----+
     |            |            |            |
     +------------+-----+------+------------+
                        |
                 +------v------+
                 | @extenote/  |
                 |    core     |
                 +-------------+
```

**Principle:** All business logic lives in `@extenote/core`. Interfaces only contain UI/UX code.

---

## Feature Parity

| Feature | CLI | TUI | Web | Clipper |
|---------|-----|-----|-----|---------|
| Vault loading | Y | Y | Y | Y (API) |
| Object listing | Y | Y | Y | - |
| Object creation | Y | Y | Y | Y |
| Lint/fix | Y | Y | - | - |
| Export | Y | Y | Y | - |
| Refcheck | Y | - | Y | Y |
| Tag management | Y | - | Y | - |
| Build/Deploy | Y | - | - | - |
| Undo/backup | Y | - | - | - |

---

## Known Issues

### Current Vault Issues (3)
```
ERROR AGENTS.md - Missing type in frontmatter
ERROR CHI 2026 PC.md - Missing type in frontmatter
ERROR CSCW 2026 Review.md - Missing type in frontmatter
```

### Technical Debt
- [ ] Web integration tests have timing issues (25 failures) - low priority
- [ ] Caching inconsistency: Web caches, CLI/TUI reload fresh
- [ ] Error handling varies across interfaces

### Experimental Features
- Semble sync (ATProto) - works but lightly tested
- Discussion publishing - works but lightly tested

---

## Roadmap

**Near-term:**
- VS Code extension with schema autocomplete
- Broken link detection (internal + external)
- Bulk accept/reject mismatches in refcheck UI

**Medium-term:**
- Plugin system for custom validators
- Vault caching in core (shared by all interfaces)
- PDF export via Pandoc

**Long-term:**
- Collaborative editing
- Mobile companion app

---

## Todos

Active development tasks. Update this section when starting/completing significant work.

### In Progress
- (none currently)

### Backlog
- [ ] Fix vault issues (3 files missing type)
- [ ] Stabilize web integration tests
- [ ] Unify caching strategy across interfaces
- [ ] Add VS Code extension

---

## File Locations

| Task | Location |
|------|----------|
| Add CLI command | `packages/cli/src/commands/` |
| Add API endpoint | `packages/web/server/handlers/` |
| Add core function | `packages/core/src/` + export in `index.ts` |
| Add TUI page | `packages/tui/src/pages/` |
| Add schema | `schemas/*.yaml` |
| Add project config | `projects/*.yaml` |

---

## Projects Configured

cb4i, data-counterfactuals, data-leverage-blogs, data-licenses, data-napkin-math, discussions, extenote-docs, paidf-mini-book, personal-website, private-content, ranking-book, shared-references
