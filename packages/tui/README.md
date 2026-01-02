# Extenote TUI

Terminal User Interface for Extenote vault management with vim-style keybindings.

## Running

From repo root:
```bash
bun run tui
```

Or directly:
```bash
cd packages/tui
bun install
bun run dev
```

## Features

**Pages:**
- **Dashboard** - Vault stats, project list, type/visibility distribution
- **Issues** - Filterable list of validation errors (error/warn/info)
- **Create** - Interactive wizard to create new objects
- **Export** - Interactive wizard to export projects

**Keybindings:**
- `d` - Dashboard
- `i` - Issues
- `c` - Create
- `e` - Export
- `h` / `ESC` - Home (Dashboard)
- `r` - Reload vault
- `q` - Quit (from Dashboard only)

**Issues Page:**
- `1` - Show all issues
- `2` - Show errors only
- `3` - Show warnings only
- `4` - Show info only
- `n` - Next page
- `p` - Previous page

## Architecture

Built with:
- **Ink** - React for terminals
- **@extenote/core** - Core vault logic
- Shells out to CLI commands for create/export operations

## Coverage

TUI covers the common flows (stats, issues, create, export). Use the CLI for advanced options like `--project/--dir` during creation and bibtex/filtered exports.
