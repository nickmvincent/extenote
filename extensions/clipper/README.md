# Extenote Web Clipper

Browser extension to save web pages as markdown objects for Extenote.

## Features

### Clipping
- **API-First Search**: Queries DBLP and Semantic Scholar by default; OpenAlex and Crossref available as optional secondary sources
- **Smart Detection**: Automatically extracts DOIs and arXiv IDs from URLs
- **Auto-Select**: Automatically chooses the best result based on completeness
- **Editable Metadata**: Review and edit all fields before saving
- **Tag Suggestions**: AI-powered tag suggestions based on content

### Validation (v0.2+)
- **Validate Existing Entries**: Compare vault entries with fresh API data
- **Field Comparison**: Side-by-side view of vault vs API values
- **Update check_log**: Persist validation results to track entry quality
- **Fix Mismatches**: One-click update of mismatched fields
- **Status Badge**: Color-coded icon shows validation status at a glance
  - ✓ Green: Confirmed
  - ! Yellow: Mismatch detected
  - ? Gray: Unchecked or stale (>30 days)
  - ✗ Red: Not found or error
- **Validation Queue**: Browse and process entries needing validation

## Installation (Firefox)

1. Build the extension:
   ```bash
   cd extenote/extensions/clipper
   bun install
   bun run build
   ```

2. Load in Firefox:
   - Open `about:debugging` in Firefox
   - Click "This Firefox" in the sidebar
   - Click "Load Temporary Add-on..."
   - Navigate to `extenote/extensions/clipper/dist/` and select `manifest.json`

## Modes

### Download Mode (Default)
- Saves markdown files directly to your browser's download folder
- Files go to `shared-references/` subdirectory by default
- No API connection required

### API Mode
- Connect to a running Extenote web server
- Saves directly to your vault
- Enables validation features
- Shows live vault matching

To enable API mode:
1. Start the Extenote web server (from the repo root): `bun run web:server`
2. Open extension options
3. Switch to "API mode"
4. Enter API URL (default: `http://localhost:3001`)

## Usage

### Clipping a New Page
1. Navigate to a paper on any website
2. Click the Extenote Clipper icon (or press `Alt+Shift+C`)
3. The popup shows a pre-filled search query (DOI, arXiv ID, or title)
4. (Optional) Check "OpenAlex" or "Crossref" to include additional sources
5. Click "Search" to query metadata APIs
6. Review the auto-selected best result (or select a different source)
7. Edit fields if needed
8. Click "Save to Vault"

**Search Sources:**
- **DBLP** (default): Best for computer science papers
- **Semantic Scholar** (default): Good coverage across fields, includes abstracts
- **OpenAlex** (optional): Broad academic coverage, sometimes less accurate
- **Crossref** (optional): Official DOI metadata, good for verification

### Validating Existing Entries
When you visit a page that's already in your vault:
1. The popup automatically shows validation mode
2. Fresh API data is fetched and compared to vault
3. Field-by-field comparison shows matches (✓) and mismatches (✗)
4. Click "Update check_log" to save validation status
5. Click "Fix Mismatches" to update vault with API values
6. Click "Clip as New" to create a separate entry

### Using the Validation Queue
1. Click "Queue" in the popup footer
2. Browse entries that haven't been validated
3. Click an entry to open its URL
4. Validate using the normal validation flow
5. Click "Refresh" to update the queue

## API Caching

The extension caches responses from external APIs (DBLP, Semantic Scholar, OpenAlex, Crossref) to reduce redundant network requests and improve responsiveness.

**Cache Behavior:**
- **TTL**: 10 minutes (academic metadata rarely changes)
- **Storage**: Two-tier caching:
  - In-memory Map for fast access within session
  - IndexedDB for persistence across extension restarts
- **Automatic**: No configuration needed; caching is transparent

**Benefits:**
- Faster repeated searches for the same paper
- Reduced load on external APIs
- Works offline for recently searched papers

**Cache Management:**
- Cache automatically expires after 10 minutes
- Restarting the browser clears the memory cache (IndexedDB persists)
- No manual cache clearing UI (yet)

## API Endpoints

The clipper uses these Extenote web API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vault` | GET | List all vault objects |
| `/api/create` | POST | Create a new object |
| `/api/object` | GET | Get single object by path or ID |
| `/api/write` | POST | Update frontmatter of existing file |
| `/api/validation-queue` | GET | Get entries needing validation |

## Configuration

Open extension options to configure:

- **Mode**: Download or API
- **API URL**: Server URL for API mode (default: `http://localhost:3001`)
- **Default Project**: Project for new entries
- **Default Schema**: Schema type for clipped pages (default: `bibtex_entry`)
- **Default Tags**: Tags to add to all clipped pages (default: `clipped`)
- **Download Subdirectory**: Subdirectory for downloads (default: `shared-references/`)

## Development

```bash
# Install dependencies
bun install

# Build once
bun run build

# Watch for changes
bun run watch

# Clean dist
bun run clean
```

## File Structure

```
src/
├── background/
│   └── service-worker.ts    # Badge updates, vault matching
├── content/
│   └── index.ts             # Minimal content script (URL + title)
├── lib/
│   ├── api.ts               # Extenote API client
│   ├── cache.ts             # API response caching (memory + IndexedDB)
│   ├── crossref.ts          # Crossref search (optional)
│   ├── dblp.ts              # DBLP search
│   ├── duplicates.ts        # Duplicate detection
│   ├── markdown.ts          # Markdown generation
│   ├── openalex.ts          # OpenAlex search (optional)
│   ├── search-hint.ts       # URL pattern matching
│   ├── semantic-scholar.ts  # Semantic Scholar search
│   ├── storage.ts           # Config storage
│   ├── tags.ts              # Tag suggestions
│   ├── types.ts             # TypeScript types
│   └── vault.ts             # Vault matching logic
├── popup/
│   ├── popup.html           # Main UI
│   ├── popup.css            # Styles
│   └── popup.ts             # Search, validation, queue logic
└── options/
    ├── options.html
    ├── options.css
    └── options.ts
```

## Keyboard Shortcuts

- `Alt+Shift+C`: Open clipper popup

## Version History

### v0.2.0 (Current)
- API-first architecture (replaces DOM scraping)
- Multi-source search (DBLP, OpenAlex, Semantic Scholar)
- Validation workflow for existing entries
- Validation status badge
- Batch validation queue
- Field comparison and fix features

### v0.1.x
- Initial release with DOM-based extractors
- Site-specific parsers for arXiv, ACM DL, etc.
