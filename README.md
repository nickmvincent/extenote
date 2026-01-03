# Extenote

📖 **[Documentation](https://nickmvincent.github.io/extenote/)** · 🖼️ **[Screenshot Gallery](https://nickmvincent.github.io/extenote/docs/web-ui)** · 🚀 **[Quickstart](https://nickmvincent.github.io/extenote/docs/quickstart)**

---

Hello! This is a short note from Nick, who worked on the first version of Extenote (heavily using Claude Code, in December 2025 during a period of strong coding agent hype). This a system that was in part inspired by an interest in really pushing recent coding models to their limit (so I can learn for myself, to inform benchmarking work, etc.), but also meant to be something I really want to use (and have been using!).

Like many, I've made half-hearted attempts to build similar systems throughout the years (ad hoc static site generators, various schemes for trying to get all the content I'm interested in into plaintext documents, etc.).

The goal is to have a system that can manage structured notes and bibliographies in Markdown, validate them, and export them to various formats (including static sites), all while being robust enough to outlive any single tool or platform. And furthemore, my hope is that by forcing me to get much of my data in plaintext (with structure/schemas), it will be more future-proof and portable, and potentially more useful for integrating with AI systems (while guarding against some failure modes of AI). This is of course also related to supporting data labor and the pooling of data :).

There are a lot features here -- a lot of docs (the docs themselves are managed as an Extenote project!), a lot of code (and most of it now generated or edited by LLMs, in particular Claude Code + Opus 4.5 as of Dec 2025). 

I have touched almost every section of the code and content manually, and I'm pretty sure there's no truly egregious slop, though there's certainly some LLM twang in some of the docs that I still would like to clean-up (though Opus 4.5 is not too bad on this front. On a meta note, one of the "features" of Extenote is a tool + workflow to guard against hallucination and more banal metadata issues with references).

Please do reach out if you're interested in this project.


<p align="center">
  <img src="https://nickmvincent.github.io/extenote/screenshots/01-dashboard.png" alt="Dashboard" width="600" />
</p>

<details>
<summary>More screenshots</summary>

| Search | Graph View |
|--------|------------|
| ![Search](https://nickmvincent.github.io/extenote/screenshots/04-search-with-query.png) | ![Graph](https://nickmvincent.github.io/extenote/screenshots/05-graph-default.png) |

| Tags | Review Queue |
|------|--------------|
| ![Tags](https://nickmvincent.github.io/extenote/screenshots/07-tags.png) | ![Review](https://nickmvincent.github.io/extenote/screenshots/18-review.png) |

</details>

I currently have 10 distinct projects "managed" with Extenote. See e.g.
- nickmvincent.com (personal website)
- datalicenses.org
- datacounterfactuals.org, a new "education resource" site the concept of "data counterfactuals" to unify a lot of "technical" data-centric work and "social" collective action, leverage-related work
- some writing materials (public AI data flywheel notes turned into a "mini-book", an archive of the data leverage blog)

I'm also using the tool to manage a "private repo" of tasks and projects.

Some other things this tool does:
  - It's multi-interface (relatively easy to support now with coding agents): CLI, Web UI (with graph visualization, search, tag management), and TUI - all consuming the same core library
  - Reference verification: Checks bibliographic entries against DBLP, OpenAlex, Semantic Scholar to catch hallucinations/errors
  - Projects can reference each other (e.g., shared-references used by personal-website, data-counterfactuals, etc.)
  - Tag taxonomy: Hierarchical tags with validation (specific tags require parent broad tags)
  - Discussion sync: Auto-creates GitHub Discussions and ATProto/Whitewind posts for content
  - Multiple deploy targets: Cloudflare Pages, GitHub Pages, FTP, etc.
  - Exporting data easily
  - Some flashy web ui features (e.g., graph visualization of content relationships -- not that useful, search across vaults -- also not that useful because you can just search your files, tag merge tools -- actually useful, review queue for curation -- extremely useful so far)

Ok, without further ado, the formal README:

---

**Extenote** = **Exte**rnalized **Note**s — a content management system for structured Markdown that outlives your current job, laptop, or software.

Write markdown with YAML schemas, validate and lint, then export to static sites (Astro, Quarto), federated platforms (ATProto), or any format you need. One vault, many outputs.

## Project Structure

This repo is part of a multi-repo setup kept in a parent directory (`extenote-project/`):

```
extenote-project/
├── extenote/                  # This repo — core tooling (code)
├── extenote-pub/              # Public content + websites
└── extenote-priv/             # Private content
```

### Separation of Concerns

| Concern | Solution |
|---------|----------|
| **Code vs. content** | Tooling changes (`extenote/`) don't pollute content commit history |
| **Public vs. private** | Private content stays in a separate repo with restricted access |
| **Multi-vault editing** | Single parent directory for easy cross-referencing in editors |
| **Independent deployment** | Websites and content can be versioned/deployed separately from tooling |

## Quick Start

```bash
bun install && bun run build
echo 'EXTENOTE_CONTENT_ROOT=../extenote-pub/content' > .env
bun run cli -- status   # or: bun run tui / bun run web
```

## Documentation

Full documentation is available at **[nickmvincent.github.io/extenote](https://nickmvincent.github.io/extenote/)**.

**For coding agents and LLMs:** Documentation source is at `../extenote-pub/content/extenote-docs/`. Key files:

| Document | Purpose |
|----------|---------|
| [Quickstart](https://nickmvincent.github.io/extenote/docs/quickstart) | Setup, workflow, command reference |
| [Configuration](https://nickmvincent.github.io/extenote/docs/configuration) | Project and schema YAML configuration |
| [CLI Reference](https://nickmvincent.github.io/extenote/docs/cli) | Complete CLI command reference |
| [Web UI Gallery](https://nickmvincent.github.io/extenote/docs/web-ui) | Web interface screenshots and guide |
| [Architecture](https://nickmvincent.github.io/extenote/docs/architecture) | System architecture, key concepts |
| [Interfaces](https://nickmvincent.github.io/extenote/docs/interfaces) | CLI vs TUI vs Web comparison |
| [FAQ](https://nickmvincent.github.io/extenote/docs/faq) | Frequently asked questions |
| [Reference Check](https://nickmvincent.github.io/extenote/docs/reference-check) | Bibliographic verification (DBLP, OpenAlex) |
| [Clipper](https://nickmvincent.github.io/extenote/docs/clipper) | Browser extension for reference validation |
| [Tags](https://nickmvincent.github.io/extenote/docs/tags) | Tag management and hierarchies |
| [Cross-Project Linking](https://nickmvincent.github.io/extenote/docs/cross-project-linking) | Linking objects between projects |
| [Computed Data](https://nickmvincent.github.io/extenote/docs/computed-data) | Derived data (cited_in, cross_refs) |
| [Discussions](https://nickmvincent.github.io/extenote/docs/discussions) | Discussion plugins (GitHub, ATProto) |
| [Testing](https://nickmvincent.github.io/extenote/docs/testing) | Manual testing guide |
| [Known Issues](https://nickmvincent.github.io/extenote/docs/known-issues) | Limitations and workarounds |

**Project Meta-Docs:**

| Document | Purpose |
|----------|---------|
| [VISION.md](./VISION.md) | High-level vision and user stories |
| [STATUS-ROADMAP-TODOS.md](./STATUS-ROADMAP-TODOS.md) | Current status, roadmap, and active todos |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution guidelines |

## Packages

| Package | README | Description |
|---------|--------|-------------|
| `@extenote/core` | [packages/core/README.md](./packages/core/README.md) | Validation, lint, export |
| `@extenote/cli` | [packages/cli/README.md](./packages/cli/README.md) | CLI commands |
| `@extenote/web` | [packages/web/README.md](./packages/web/README.md) | Web UI |
| `@extenote/refcheck` | [packages/refcheck/README.md](./packages/refcheck/README.md) | Reference checking (DBLP, OpenAlex) |
| `@extenote/tui` | [packages/tui/README.md](./packages/tui/README.md) | Terminal UI |

## Configuration

Project configs live in `projects/*.yaml` and schema definitions in `schemas/*.yaml`. Each project config can include:
- Content sources and visibility rules
- Build configuration (Astro, Quarto, or custom)
- Deploy configuration (Cloudflare Pages, GitHub Pages, Vercel, Netlify)

See the [Configuration docs](https://nickmvincent.github.io/extenote/docs/configuration) for the full reference.

### Content Repos

**`extenote-pub/`** — Public-facing Markdown vaults and static site generators:
- **`content/`** — Public Markdown vaults (`shared-references/`, `personal-website/`, `data-licenses/`, etc.)
- **`websites/`** — Astro/Quarto frontends that consume content

**`extenote-priv/`** — Private Markdown vaults (reference letters, internal memos, etc.)

Content vaults are pointed to via environment variables (`EXTENOTE_CONTENT_ROOT`, `EXTENOTE_PRIVATE_ROOT`). See your `.env` file.

## Cross-Repo References

- Tooling reads content via `EXTENOTE_CONTENT_ROOT` env var
- Websites default to `../../content/<name>` relative paths
- Private content uses `EXTENOTE_PRIVATE_ROOT` for separate source configuration

## Testing

```bash
bun run lint    # TypeScript checks
bun run test    # Unit tests
```

## Motivation

Extenote unifies multiple content projects (annotated bibliographies, memos, CV entries, mini-books) into a single workflow: write Markdown with typed frontmatter in your editor of choice, validate against schemas, then export to static sites or federated platforms. One vault, many outputs.

## ATProto / Semble Integration

Extenote can sync content to the ATProto network via [Semble](https://docs.cosmik.network), a research-focused layer built on Bluesky's protocol.

### What Works Now

- **Bidirectional sync** of bibliography entries as Semble "cards" (URL type)
- **Multi-collection support**: Objects auto-grouped by project + `collection:*` tags
- **Change detection** via content hashing + ATProto CID comparison
- **Conflict handling** with configurable merge strategies (local-wins, remote-wins, skip)
- **Selective sync**: Filter by type, visibility, or custom frontmatter tags
- **CLI commands**: `sync --list`, `sync <project>`, `sync --dry-run`, etc.

### Vision

The ATProto integration is part of a broader goal: your content should exist in multiple places, not locked to any single platform. Alongside git repos and static sites, federated protocols offer another publication target—one where your references can be discovered, shared, and discussed on an open network.

Future directions include richer document types beyond URL cards and tighter integration with ATProto-native discussion and annotation features.

### Configuration Example

```yaml
# In projects/shared-references.yaml
semble:
  enabled: true
  identifier: yourhandle.bsky.social
  syncTag: semble        # Only sync objects with `semble: true`
  types: [bibtex_entry]
  publicOnly: true
```

See the [Configuration docs](https://nickmvincent.github.io/extenote/docs/configuration) for the full Semble configuration reference.
