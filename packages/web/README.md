# @extenote/web

Web UI for browsing and managing Extenote vaults.

## Development

Run both servers with:

```bash
bun run web
```

This starts:
- **API server** on http://localhost:3001 - handles `/api/*` endpoints
- **Vite dev server** on http://localhost:3000 - serves the React frontend

Open http://localhost:3000 in your browser.

### Running servers separately

```bash
# Terminal 1: API server
bun run web:server

# Terminal 2: Vite dev server
bun run web:dev
```

## API Endpoints

### Vault & Data
- `GET /api/vault` - Load vault data (config, schemas, objects, issues) - **cached**
- `GET /api/reload` - Force reload vault (invalidates cache)
- `GET /api/graph` - Get object relationship graph
- `GET /api/crossrefs/:path` - Get cross-references for an object
- `GET /api/websites` - List project websites

### Tags
- `GET /api/tags` - Get tag tree and counts
- `POST /api/tags/preview` - Preview tag mutation
- `POST /api/tags/apply` - Apply tag mutation (invalidates cache)

### Reference Checking
- `GET /api/check/providers` - List available check providers
- `GET /api/check/stats` - Get check statistics
- `POST /api/check` - Run reference check (invalidates cache if not dry-run)

### Other
- `POST /api/create` - Create a new object (invalidates cache)
- `POST /api/export` - Export project to a format
- `GET /api/cache/status` - Get cache status (for debugging)

## Caching

The API server caches the vault state to improve performance. This is especially useful with large vaults containing thousands of files.

### Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `EXTENOTE_CACHE_ENABLED` | Enable/disable caching | `true` |
| `EXTENOTE_CACHE_TTL` | Cache time-to-live in milliseconds | `30000` (30s) |

### Behavior

- Cache is automatically invalidated after operations that modify files:
  - Tag mutations (rename, merge, delete)
  - Creating new objects
  - Reference checks (when not dry-run)
- Use `GET /api/reload` to force a cache refresh
- Use `GET /api/cache/status` to check cache state

### Disabling Cache

```bash
EXTENOTE_CACHE_ENABLED=false bun run web:server
```

## Testing

Run Puppeteer integration tests:

```bash
bun run test:run
```

This will:
1. Start the API server and Vite dev server
2. Run 24 integration tests across all pages
3. Capture screenshots to `tests/screenshots/`
4. Clean up servers when done

Screenshots cover: Dashboard, Search, Graph, Tags, Issues, Export, Create Form, Schemas, Check, Review, Websites, theme toggle, responsive layouts (tablet/mobile), and 404 handling.

## Build

```bash
bun run build
```

Output is in `dist/`.
