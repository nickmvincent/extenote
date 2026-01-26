# Privacy Policy for Extenote Web Clipper

**Last updated:** January 2025

## Overview

Extenote Web Clipper is a browser extension that helps you save web pages as structured markdown files. This privacy policy explains what data the extension accesses and how it's used.

## Data Collection

**We do not collect any personal data.**

The extension does not:
- Track your browsing activity
- Send analytics or telemetry
- Store data on external servers
- Use cookies for tracking
- Share any information with third parties

## Data Access

### Page Content
When you click the extension icon, the extension reads:
- Page title and URL
- Citation meta tags (for academic papers)
- Selected text (if any)

This data is used solely to populate the clipping form and is not transmitted anywhere except:
- **Academic APIs** (DBLP, Semantic Scholar, OpenAlex, Crossref) to search for paper metadata
- **Your local Extenote server** (if you use API mode)

### Local Storage
The extension stores your settings (mode, default tags, API URL) in your browser's local storage. This data never leaves your browser.

## External Services

### Academic APIs
When you search for paper metadata, the extension queries:
- **DBLP** (dblp.org)
- **Semantic Scholar** (semanticscholar.org)
- **OpenAlex** (openalex.org)
- **Crossref** (crossref.org)

Only the search query (DOI, arXiv ID, or title) is sent to these services. No personal information is transmitted.

### Archive.org
If you enable the Archive.org feature, the page URL is submitted to the Wayback Machine to create an archive. No personal information is transmitted.

### Local API Server
In API mode, the extension communicates with your locally running Extenote server (typically localhost:3001). This server runs on your machine and stores data in your local vault.

## Permissions Explained

- **activeTab**: Required to read page content for metadata extraction. Only activates when you click the extension icon.
- **storage**: Required to save your settings locally.
- **downloads**: Required to save markdown files in download mode.
- **contextMenus**: Required to add right-click clip options.
- **host_permissions (*://*/*)**: Required to extract metadata from any website you choose to clip.

## Data Security

All data processing happens locally in your browser. The extension does not have any backend servers and cannot access data you haven't explicitly chosen to clip.

## Open Source

This extension is open source. You can review the code at:
https://github.com/nmvincent/extenote

## Changes to This Policy

If this privacy policy changes, updates will be noted in the extension's changelog and this document will be updated accordingly.

## Contact

For questions about this privacy policy, please open an issue on the GitHub repository or contact the maintainer.
