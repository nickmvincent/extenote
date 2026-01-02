# Refcheck Package Design

## Overview

The `refcheck` package provides unified bibliographic metadata validation for Extenote. It enables verification of citation entries against authoritative sources (DBLP, Semantic Scholar, OpenAlex, Crossref) and produces a standardized `check_log` that tracks validation status.

## Goals

1. **Single source of truth** for validation logic used by both CLI and browser extension
2. **Consistent check_log format** across all validation methods
3. **Shared API clients** with proper rate limiting and error handling
4. **Clear documentation** explaining what "checking" means for users

## Package Structure

```
packages/refcheck/
├── src/
│   ├── index.ts              # Main exports
│   ├── types.ts              # Shared type definitions
│   ├── check-log.ts          # CheckLog creation and parsing
│   ├── compare.ts            # Field comparison algorithms
│   ├── normalize.ts          # String normalization utilities
│   ├── providers/
│   │   ├── index.ts          # Provider registry
│   │   ├── base.ts           # BaseProvider interface
│   │   ├── dblp.ts           # DBLP API client
│   │   ├── semantic-scholar.ts
│   │   ├── openalex.ts
│   │   ├── crossref.ts
│   │   └── auto.ts           # Auto-switching provider
│   └── matcher.ts            # Entry matching (URL, DOI, title)
├── package.json
├── tsconfig.json
└── README.md                 # User documentation
```

## Unified CheckLog Format

The check_log is stored in YAML frontmatter and captures the complete validation state:

```typescript
interface CheckLog {
  // When and how the check was performed
  checked_at: string;           // ISO 8601 timestamp
  checked_with: string;         // Provider: "dblp", "s2", "openalex", "crossref", "auto"

  // Overall result
  status: "confirmed" | "mismatch" | "not_found" | "error";

  // External identifier from provider (optional)
  paper_id?: string;            // e.g., DBLP key, S2 paper ID, OpenAlex ID

  // Field-by-field comparison details
  fields: {
    title: FieldCheck;
    authors: AuthorCheck;
    year: FieldCheck & { year_diff?: number };
    venue?: FieldCheck;
    doi?: FieldCheck;
  };

  // Remote values for easy adoption if mismatched
  remote?: {
    title?: string;
    authors?: string[];
    year?: number;
    venue?: string;
    doi?: string;
  };

  // Optional: raw BibTeX from provider
  external_bibtex?: {
    source: string;
    bibtex: string;
    fetched_at: string;
  };
}

interface FieldCheck {
  local: string | null;         // Value from vault
  remote: string | null;        // Value from API
  match: boolean;
  edit_distance?: number;       // Levenshtein distance for text fields
}

interface AuthorCheck {
  local_count: number;
  remote_count: number;
  count_match: boolean;
  details?: AuthorDetail[];     // Per-author comparison
}

interface AuthorDetail {
  index: number;
  local: string;
  remote: string;
  first_match: boolean;
  last_match: boolean;
}
```

## Status Definitions

| Status | Meaning | Badge |
|--------|---------|-------|
| `confirmed` | All checked fields match the provider | Green checkmark |
| `mismatch` | One or more fields differ from provider | Yellow warning |
| `not_found` | Entry not found in provider database | Red X |
| `error` | API or processing error occurred | Red X |

Additionally, entries are considered **stale** if `checked_at` is older than 30 days.

## Provider Priority (Auto Mode)

1. **DBLP** - Best for computer science, provides authoritative BibTeX
2. **Semantic Scholar** - Broad coverage, good abstracts
3. **OpenAlex** - Widest coverage, links to other databases
4. **Crossref** - Official DOI metadata

In auto mode, providers are tried in order until a match is found.

## Field Comparison Algorithms

### Title Comparison
- Normalize: lowercase, remove diacritics, collapse whitespace
- Strict normalize: also remove all punctuation
- Match if Jaccard similarity > 0.9 after strict normalization
- Report Levenshtein edit distance for mismatches

### Author Comparison
- Parse names into first/last components
- Handle formats: "Last, First", "First Last", "First Middle Last"
- Match if count matches AND all authors have matching last names
- Report per-author match details

### Year Comparison
- Exact numeric match after parsing
- Report year difference for mismatches

### Venue Comparison
- Same normalization as title
- Match if Jaccard similarity > 0.8
- Allow abbreviations (e.g., "CHI" matches "CHI Conference on Human Factors")

### DOI Comparison
- Normalize: strip URL prefixes, lowercase
- Exact match required

## Usage Examples

### CLI Usage
```bash
# Check all entries in a project
extenote check shared-references

# Check with specific provider
extenote check --provider dblp

# Dry run (preview without saving)
extenote check --dry-run

# Force re-check already validated entries
extenote check --force

# Check specific file
extenote check --file references/smith2024.md
```

### Browser Extension Usage
1. Navigate to a paper URL (arXiv, ACM DL, etc.)
2. If already in vault, extension shows validation mode
3. Click "Update check_log" to save validation result
4. Click "Fix Mismatches" to adopt API values

### Programmatic Usage
```typescript
import { checkEntry, getProvider, CheckStatus } from '@extenote/refcheck';

const provider = getProvider('auto');
const result = await checkEntry(entry, provider);

if (result.status === CheckStatus.Mismatch) {
  console.log('Mismatched fields:', result.fields);
}
```

## Integration Points

### With @extenote/core
- Core imports refcheck for the `check` command
- Frontmatter read/write uses core's parseMarkdown/stringifyMarkdown

### With extensions/clipper
- Extension bundles refcheck for browser use
- Uses same validation logic and check_log format
- API clients work in browser environment (fetch API)

## Browser Compatibility

All code must work in both Node.js and browser environments:
- Use `fetch` API (not node-fetch or axios)
- No Node.js-specific APIs in provider code
- Bundle with browser-compatible build tools
