# Extenote Vision

**Extenote** = **Exte**rnalized **Note**s

A content management system for structured Markdown that outlives your current job, laptop, or software.

## Core Idea

Write markdown with YAML schemas, validate and lint, then export to static sites (Astro, Quarto), federated platforms (ATProto), or any format you need. One vault, many outputs.

## User Stories

**As a researcher**, I want to:
- Maintain a curated bibliography in plaintext that I can validate against authoritative sources (DBLP, OpenAlex)
- Catch hallucinated or incorrect metadata in AI-generated references before they enter my work
- Export references to BibTeX, JSON, or directly to my websites

**As a content creator**, I want to:
- Write once in Markdown and publish to multiple destinations (personal site, blogs, federated networks)
- Have a single source of truth for my content that isn't locked into any platform
- Cross-reference content between projects (e.g., my CV linking to my papers)

**As a future-proofer**, I want to:
- Keep all my content in plaintext with explicit schemas so it survives tool/platform changes
- Have my data be portable and AI-ready while guarding against AI failure modes
- Not rely on any single cloud service or proprietary format

## Why This Exists

This system combines features from:
- **Obsidian-like tools** — Markdown vault management with frontmatter
- **Reference managers** — Bibliography validation and export
- **Static site generators** — Multi-target publishing
- **Browser extensions** — Content clipping and reference tracking

The goal: a robust system that manages structured notes and bibliographies, validates them against real-world data, and exports them anywhere — while being simple enough to outlive any single tool.

## What It's Not

- Not a full CMS with databases and user auth
- Not a replacement for Obsidian/Notion/etc. (use those for editing; use Extenote for validation and export)
- Not a writing app (bring your own editor)
