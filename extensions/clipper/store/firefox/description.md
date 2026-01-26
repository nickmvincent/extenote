# Extenote Web Clipper

**Clip web pages as structured markdown for your knowledge base**

## Features

### Reference Clipping
- **Multi-source search**: Query DBLP, Semantic Scholar, OpenAlex, and Crossref simultaneously
- **Smart detection**: Automatically extracts DOI, arXiv ID from academic paper URLs
- **Auto-select best result**: Picks the most complete metadata source
- **Editable metadata**: Fine-tune title, authors, venue, year, DOI, and tags
- **Tag suggestions**: AI-powered tag recommendations based on content

### Bookmark Saving
- **Quick save**: Clip any page with minimal friction
- **Platform detection**: Automatically recognizes Twitter/X, Bluesky, Mastodon, GitHub, etc.
- **Selection capture**: Include selected text as quotes
- **Social parsing**: Extract post content and author info from social platforms

### Validation Mode (API)
- **Vault integration**: Check if pages already exist in your vault
- **Field comparison**: Compare vault data with fresh API data
- **One-click fixes**: Update mismatched fields automatically
- **Batch validation**: Queue-based workflow for library maintenance

### Advanced Features
- **Keyboard shortcuts**: j/k navigation, 1-5 source select, Ctrl+S save
- **Quick save mode**: One-click clipping with defaults
- **Batch clipping**: Clip multiple tabs at once
- **Archive.org integration**: Save pages to Wayback Machine
- **Context menus**: Right-click to clip pages, selections, or links

## Modes

### Download Mode (V1)
Save markdown files directly via browser downloads. Configure your download folder to point to your vault.

### API Mode (V2)
Connect to a running Extenote web server for:
- Direct vault integration
- Live duplicate detection
- Validation workflows
- Project selection

## Privacy

This extension:
- Only accesses page content when you click the extension icon
- Stores your settings locally in browser storage
- Sends search queries only to public academic APIs (DBLP, Semantic Scholar, etc.)
- In API mode, communicates only with your local Extenote server

No data is collected, tracked, or sent to third parties.

## Permissions

- **activeTab**: Read page content for metadata extraction
- **storage**: Save your settings
- **downloads**: Save markdown files (download mode)
- **contextMenus**: Right-click clip options

## Source Code

Open source: https://github.com/nmvincent/extenote
