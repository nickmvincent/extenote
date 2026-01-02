# Extenote Agent Instructions

## start here

1. read this file
2. read `README.md` for project structure, packages, and full docs table
3. scan `projects/*.yaml` to see where each project's content and website code lives
4. if you need extenote feature details, read docs at `../extenote-pub/content/extenote-docs/`

## quick routing (what repo?)

- tooling/code changes: `extenote/`
- content edits: `extenote-pub/content/<vault>/`
- website changes: `extenote-pub/websites/<site>/`
- private content: `extenote-priv/` (only if explicitly requested)

## env + roots

- content comes from `EXTENOTE_CONTENT_ROOT`
- private content comes from `EXTENOTE_PRIVATE_ROOT`
- `.env` lives in `extenote/`

## code entry points

- CLI: `extenote/packages/cli/src/`
  - commands are in `commands/` subdirectory (one file per command)
  - main entry: `index.ts` (just imports and registers commands)
- core logic: `extenote/packages/core/src/`
  - shared constants: `constants.ts`
  - plugins: `plugins/` (discussion, network, refcheck, semble)
- web UI: `extenote/packages/web/src/`
  - API server: `server.ts` with handlers in `server/handlers/`
  - cache logic: `server/cache.ts`
- refcheck: `extenote/packages/refcheck/src/`
- TUI: `extenote/packages/tui/src/`
- schemas: `extenote/schemas/`
- project configs: `extenote/projects/*.yaml`

## architecture principle

**All business logic lives in `@extenote/core`. All interfaces (CLI, TUI, Web) consume core.**

```
CLI ──┐
TUI ──┼──→ @extenote/core
Web ──┘
```

- Never put reusable logic in cli/tui/web — move it to core
- Interfaces should only contain UI/UX code specific to that interface
- If web or tui needs something from cli, that code belongs in core

## build outputs

- do not edit `dist/` files; edit `src/` and rebuild

## minimal checks (by change type)

- content-only: `bun run cli -- validate <project>`
- schemas/config: `bun run lint` + `bun run test`
- CLI/core/web changes: `bun run lint` + `bun run test` (add targeted CLI run if relevant)

## fast search tips

- find object by slug: `rg -n "slug:" extenote-pub/content/`
- find type: `rg -n "type:" extenote-pub/content/`
- find config: `rg -n "<project>" extenote/projects/*.yaml`

## vault size warning

content vaults can be large. before reading an entire vault:
- ask which vault(s) are relevant
- use targeted searches (grep/glob) before reading full directories
- check project configs to understand vault scope

## finding content + website code

each project config (`projects/*.yaml`) tells you:
- `sources` — where the content markdown lives
- `build.websiteDir` — which website directory renders this content
- `includes` — other projects this one depends on

example: to find shared-references content and its website:
```bash
# content lives at:
../extenote-pub/content/shared-references/

# website code lives at:
../extenote-pub/websites/shared-references-astro/
```

## common tasks

### working on tooling code
start in `packages/` — core logic is in `packages/core/`. see README.md for package list.

### working on content
1. check `projects/<project>.yaml` for content source paths
2. navigate to the content directory
3. edit markdown files with typed frontmatter

### working on a website
1. check `projects/<project>.yaml` for `build.websiteDir`
2. navigate to `../extenote-pub/websites/<websiteDir>/`
3. website usually reads from `../../content/<project>/`

### adding a new reference
1. create markdown file in `../extenote-pub/content/shared-references/`
2. use bibtex_entry schema (see `schemas/bibtex_entry.yaml`)
3. run `bun run cli -- validate shared-references` to check
4. optionally run refcheck to verify against dblp/openalex

### cli commands
```bash
bun run cli -- status                    # project health overview
bun run cli -- validate <project>        # validate against schemas
bun run cli -- lint <project>            # lint content
bun run cli -- build <project>           # build website
bun run cli -- deploy <project>          # deploy to configured host
bun run cli -- export <project> --json   # export to json
bun run cli -- refcheck <project>        # verify references against dblp/openalex
```

### running interfaces
```bash
bun run cli -- <command>   # cli
bun run tui                # terminal ui
bun run web                # web app (localhost:3000 api, localhost:3001 vite)
```

### testing
```bash
bun run lint               # typescript checks
bun run test               # unit tests
bun test integration       # integration tests (in packages/core/tests/)
```

## key patterns

### markdown objects
every markdown file has typed yaml frontmatter. schemas define valid fields. the cli validates content against schemas.

### project configs
yaml files in `projects/` define:
- content sources (local paths)
- includes (other projects to pull in, e.g. shared-references)
- build config (astro vs quarto, pre-render steps)
- deploy config (cloudflare pages, github pages, etc.)
- discussion providers (github, whitewind/atproto)
- semble sync (atproto card sharing for bibtex entries)

### cross-project references
objects can reference other objects across projects. shared-references is commonly included by other projects for citations.

### discussions integration
projects can auto-create discussion threads on github or atproto (whitewind). check `discussion:` block in project configs.

### reference verification
the refcheck package verifies bibliographic entries against dblp and openalex. some entries may have hallucinated metadata — if you spot issues, flag them.

### tag management
tags are hierarchical (e.g. `ai/llm/alignment`). use the web app tag merge feature to consolidate tags across the library.

## current projects

| project | content | website | notes |
|---------|---------|---------|-------|
| shared-references | annotated bibliography | astro | included by most other projects |
| personal-website | cv, projects | astro | nickmvincent.com |
| data-licenses | data licensing research | astro | datacounterfactuals.org |
| data-counterfactuals | data counterfactuals book | astro | datacounterfactuals.org |
| data-leverage-blogs | blog posts | quarto | data leverage topics |
| paidf-mini-book | paid for data book | quarto | mini-book format |
| extenote-docs | extenote documentation | astro | this project's docs |
| cb4i | conferences book | astro | computer science conferences |
| private-content | letters, internal | n/a | not deployed |

## style notes

- prefer terse, practical changes over elaborate refactors
- avoid over-engineering — only add what's needed for the current task
- when checking docs, look for outdated info or redundancy
- if you find hallucinated references (wrong author/year/venue), flag or fix them
- run `bun run cli -- status` to check overall project health

## multi-repo contributor workflow

### current setup (single author)

all content lives in `extenote-pub/` for simplicity:
- single git history for all public content
- easy cross-project referencing (shared-references used by multiple sites)
- consistent tooling across all projects

### when contributors join

consider splitting content into separate repos when:
- multiple external contributors submit changes regularly
- projects have different access/ownership requirements
- you need independent versioning/release cycles

**splitting options:**

1. **per-project repos** — each vault gets its own repo
   - pros: fine-grained permissions, focused history
   - cons: harder cross-referencing, more repos to manage

2. **shared core + separate projects** — keep shared-references in extenote-pub, split other projects
   - pros: common bibliography stays unified
   - cons: some coordination overhead

3. **git submodules** — mono-repo structure with submodules for separate histories
   - pros: appears unified locally, separate remote histories
   - cons: submodule complexity

### cross-repo referencing after split

update project configs to point to new locations via env vars:

```yaml
sources:
  - id: external-refs
    type: local
    root: ${SHARED_REFS_ROOT:-../shared-references-content}
```

## user preferences

default vault: shared-references
frequently used: personal-website, data-licenses, shared-references
