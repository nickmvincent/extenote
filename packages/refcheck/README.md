# @extenote/refcheck

Unified bibliographic metadata validation for Extenote. This package provides a consistent way to validate citation entries against authoritative sources (DBLP, Semantic Scholar, OpenAlex, Crossref) across both the CLI and browser extension.

## What is "Checking"?

When you clip a paper to your vault, you capture metadata like title, authors, year, and venue. Over time, this metadata might become outdated or contain errors. **Checking** validates your local metadata against authoritative external sources to ensure accuracy.

### Check Status

Each entry can have one of these statuses:

| Status | Meaning | Action Needed |
|--------|---------|---------------|
| `confirmed` | All fields match the external source | None - entry is validated |
| `mismatch` | Some fields differ from the source | Review and optionally update |
| `not_found` | Entry not found in any source | May need manual verification |
| `error` | API or processing error occurred | Retry later |
| `stale` | Check is older than 30 days | Re-validate for freshness |
| `unchecked` | Never been validated | Run a check |

### What Gets Compared

- **Title**: Compared using word-level similarity (>90% match required)
- **Authors**: Count and last names must match
- **Year**: Must match exactly
- **Venue**: Compared using word-level similarity (>80% match required)
- **DOI**: Must match exactly after normalization

## Installation

```bash
# In the extenote monorepo
bun install
cd packages/refcheck
bun run build
```

## Usage

### Programmatic API

```typescript
import {
  checkEntry,
  getProvider,
  createCheckLog,
  matchPageToVault,
} from '@extenote/refcheck';

// Check a single entry
const entry = {
  id: 'smith2024neural',
  title: 'Neural Networks for Natural Language',
  authors: ['John Smith', 'Jane Doe'],
  year: '2024',
};

const result = await checkEntry(entry, { provider: 'auto' });
console.log(result.checkLog.status); // 'confirmed', 'mismatch', etc.

// Use a specific provider
const dblpResult = await checkEntry(entry, { provider: 'dblp' });
```

### CLI Usage

The CLI's `check` command uses this package internally:

```bash
# Check all entries in a project
extenote check shared-references

# Check with specific provider
extenote check --provider dblp

# Preview without saving
extenote check --dry-run

# Force re-check validated entries
extenote check --force

# Check a single file
extenote check --file references/smith2024.md
```

### Browser Extension Usage

The browser extension uses this package for validation:

1. Navigate to a paper page (arXiv, ACM DL, etc.)
2. If the page matches a vault entry, validation mode activates
3. Click "Update check_log" to save the validation result
4. Click "Fix Mismatches" to update vault with API values

## Providers

### DBLP (`dblp`)
Best for computer science papers. Provides authoritative BibTeX entries.

- Coverage: Computer science conferences and journals
- Strengths: High-quality metadata, official BibTeX
- API: `dblp.org/search/publ/api`

### Semantic Scholar (`s2`)
Broad academic coverage with good abstracts.

- Coverage: All academic fields
- Strengths: Citation data, abstracts, DOI/arXiv ID lookup
- API: `api.semanticscholar.org`

### OpenAlex (`openalex`)
Widest coverage across all academic publishing.

- Coverage: 200M+ works across all fields
- Strengths: Comprehensive, links to other databases
- API: `api.openalex.org`

### Crossref (`crossref`)
Official DOI metadata registry.

- Coverage: All DOI-registered works
- Strengths: Authoritative DOI metadata
- API: `api.crossref.org`

### Auto (`auto`)
Tries providers in order: DBLP → S2 → OpenAlex → Crossref

Use `auto` (the default) for best coverage across different paper types.

## CheckLog Format

The `check_log` field is stored in YAML frontmatter. It supports both automated checks and manual verification:

### Manual Verification

For entries that can't be auto-verified or need human sign-off, use the `manually_verified` field:

```yaml
check_log:
  status: confirmed
  manually_verified:
    verified_at: '2024-12-29T10:30:00.000Z'
    verified_by: human
    notes: Verified against ACM DL
```

This can be set via the web UI's Review page or by editing the frontmatter directly.

### Automated Check Format

```yaml
check_log:
  checked_at: '2024-12-27T10:30:00.000Z'
  checked_with: dblp
  status: confirmed
  paper_id: conf/chi/Smith24
  fields:
    title:
      local: Neural Networks for Natural Language
      remote: Neural Networks for Natural Language
      match: true
    authors:
      local_count: 2
      remote_count: 2
      count_match: true
      details:
        - index: 0
          local: John Smith
          remote: John Smith
          first_match: true
          last_match: true
        - index: 1
          local: Jane Doe
          remote: Jane Doe
          first_match: true
          last_match: true
    year:
      local: '2024'
      remote: '2024'
      match: true
    venue:
      local: CHI
      remote: CHI Conference on Human Factors
      match: true
  remote:
    title: Neural Networks for Natural Language
    authors:
      - John Smith
      - Jane Doe
    year: 2024
    venue: CHI Conference on Human Factors
    doi: 10.1145/1234567.1234568
  external_bibtex:
    source: dblp
    bibtex: |
      @inproceedings{smith2024neural,
        author = {John Smith and Jane Doe},
        title = {Neural Networks for Natural Language},
        booktitle = {CHI},
        year = {2024}
      }
    fetched_at: '2024-12-27T10:30:00.000Z'
```

## API Reference

### Entry Checking

```typescript
// Check single entry
checkEntry(entry: EntryMetadata, options?: CheckOptions): Promise<CheckResult>

// Check multiple entries with rate limiting
checkEntries(
  entries: EntryMetadata[],
  options?: CheckOptions,
  onProgress?: (result, index, total) => void
): Promise<CheckResult[]>
```

### Providers

```typescript
// Get a provider by name
getProvider(name: string): Provider | undefined

// List available providers
getAvailableProviders(): string[]

// Register a custom provider
registerProvider(provider: Provider): void
```

### Field Comparison

```typescript
// Compare fields between local and remote
compareFields(local: EntryMetadata, remote: PaperMetadata): FieldChecks

// Determine overall status
determineStatus(fields: FieldChecks): CheckStatus
```

### CheckLog Utilities

```typescript
// Create a check_log
createCheckLog(options: {
  status: CheckStatus;
  provider: string;
  paperId?: string;
  fields?: FieldChecks;
  remote?: PaperMetadata;
  bibtex?: string;
}): CheckLog

// Check if stale
isStale(checkLog: CheckLog, days?: number): boolean

// Get badge info for UI
getStatusBadge(checkLog: CheckLog | undefined): { text, color, status }
```

### Page Matching (Browser Extension)

```typescript
// Match a page to vault entries
matchPageToVault(
  url: string,
  pageTitle: string,
  entries: VaultEntry[]
): MatchResult | null

// Find related entries
findRelatedEntries(
  entry: VaultEntry,
  allEntries: VaultEntry[],
  limit?: number
): VaultEntry[]
```

## Best Practices

### When to Check

1. **After clipping**: Run a check immediately to validate captured metadata
2. **Periodically**: Re-check entries older than 30 days
3. **Before publishing**: Validate all entries in a project before sharing

### Handling Mismatches

When a mismatch is detected:

1. Review the comparison in `check_log.fields`
2. Check `check_log.remote` for the external values
3. Decide whether to adopt the external values or keep local
4. Use "Fix Mismatches" in the extension or manually update frontmatter

### Rate Limiting

All providers have rate limits. The package uses a 100ms delay between requests by default. For batch operations, consider:

- Processing in smaller batches
- Running during off-peak hours
- Using `--limit` to cap the number of checks

## Contributing

See the main Extenote repository for contribution guidelines.

## License

MIT
