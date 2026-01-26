/**
 * Search hint extraction from URLs
 * Extracts DOIs, arXiv IDs, and other identifiers from common academic site URLs
 * No DOM parsing - purely URL-based
 */

export type HintType = "doi" | "arxiv" | "s2" | "openreview" | "title";

export interface SearchHint {
  type: HintType;
  value: string;
  displayValue: string; // Human-readable version for the search box
}

/**
 * Extract search hint from URL and page title
 */
export function extractSearchHint(url: string, pageTitle: string): SearchHint {
  const urlObj = new URL(url);
  const hostname = urlObj.hostname.toLowerCase();
  const pathname = urlObj.pathname;

  // doi.org direct links
  if (hostname === "doi.org" || hostname === "dx.doi.org") {
    const doi = pathname.replace(/^\//, "");
    if (doi) {
      return { type: "doi", value: doi, displayValue: doi };
    }
  }

  // arXiv
  if (hostname === "arxiv.org" || hostname === "www.arxiv.org") {
    // /abs/2301.12345 or /pdf/2301.12345
    const match = pathname.match(/\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/);
    if (match) {
      return { type: "arxiv", value: match[1], displayValue: `arXiv:${match[1]}` };
    }
    // Old format: /abs/cs/0101010
    const oldMatch = pathname.match(/\/(?:abs|pdf)\/([a-z-]+\/\d+)/);
    if (oldMatch) {
      return { type: "arxiv", value: oldMatch[1], displayValue: `arXiv:${oldMatch[1]}` };
    }
  }

  // ACM Digital Library
  if (hostname === "dl.acm.org") {
    // /doi/10.1145/... or /doi/abs/10.1145/... or /doi/full/10.1145/...
    const match = pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/)?(10\.\d+\/[^\s?#]+)/);
    if (match) {
      return { type: "doi", value: match[1], displayValue: match[1] };
    }
  }

  // IEEE Xplore
  if (hostname === "ieeexplore.ieee.org") {
    // /document/1234567 - we'll use title since document ID isn't directly searchable
    // But check for DOI in URL params
    const doiParam = urlObj.searchParams.get("arnumber");
    // IEEE doesn't put DOI in URL, so fall back to title
  }

  // Semantic Scholar
  if (hostname === "www.semanticscholar.org" || hostname === "semanticscholar.org") {
    // /paper/Title-Words-AuthorName/abc123def456...
    const match = pathname.match(/\/paper\/[^/]+\/([a-f0-9]{40})/i);
    if (match) {
      return { type: "s2", value: match[1], displayValue: `S2:${match[1].slice(0, 8)}...` };
    }
  }

  // OpenReview
  if (hostname === "openreview.net") {
    // /forum?id=xxx or /pdf?id=xxx
    const id = urlObj.searchParams.get("id");
    if (id) {
      return { type: "openreview", value: id, displayValue: `OpenReview:${id}` };
    }
  }

  // Nature, Science, Springer, etc. - look for DOI in path
  if (hostname.includes("nature.com") || hostname.includes("science.org") || hostname.includes("springer.com")) {
    const doiMatch = pathname.match(/(10\.\d+\/[^\s?#]+)/);
    if (doiMatch) {
      return { type: "doi", value: doiMatch[1], displayValue: doiMatch[1] };
    }
  }

  // PNAS, Cell, etc.
  if (hostname.includes("pnas.org") || hostname.includes("cell.com")) {
    const doiMatch = pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/)?(10\.\d+\/[^\s?#]+)/);
    if (doiMatch) {
      return { type: "doi", value: doiMatch[1], displayValue: doiMatch[1] };
    }
  }

  // NeurIPS/NIPS proceedings
  if (hostname === "papers.nips.cc" || hostname === "proceedings.neurips.cc") {
    // /paper/2023/hash/abc123-Abstract.html → extract from title
    // These don't have DOIs in URL, fall back to title
  }

  // MLR Press (ICML, AISTATS, etc.)
  if (hostname === "proceedings.mlr.press") {
    // /v139/author21a.html → no DOI in URL
  }

  // DBLP
  if (hostname === "dblp.org" || hostname === "dblp.uni-trier.de") {
    // /rec/conf/... or /rec/journals/... → use title
  }

  // Google Scholar - can't extract much
  if (hostname === "scholar.google.com") {
    // Fall back to title
  }

  // Hugging Face papers
  if (hostname === "huggingface.co" && pathname.startsWith("/papers/")) {
    const arxivMatch = pathname.match(/\/papers\/(\d{4}\.\d{4,5})/);
    if (arxivMatch) {
      return { type: "arxiv", value: arxivMatch[1], displayValue: `arXiv:${arxivMatch[1]}` };
    }
  }

  // Papers With Code
  if (hostname === "paperswithcode.com") {
    // /paper/title-of-paper → use title
  }

  // Clean up page title for fallback
  const cleanTitle = cleanPageTitle(pageTitle, hostname);
  return { type: "title", value: cleanTitle, displayValue: cleanTitle };
}

/**
 * Clean page title by removing common suffixes
 */
function cleanPageTitle(title: string, hostname: string): string {
  let cleaned = title;

  // Remove common site suffixes
  const suffixes = [
    / \| ACM Digital Library$/i,
    / - ACM Digital Library$/i,
    / \| IEEE Xplore$/i,
    / - IEEE Xplore$/i,
    / \| arXiv$/i,
    / \| Semantic Scholar$/i,
    / - Semantic Scholar$/i,
    / \| OpenReview$/i,
    / \| Nature$/i,
    / \| Science$/i,
    / - PNAS$/i,
    / \| PNAS$/i,
    / - ScienceDirect$/i,
    / \| Proceedings of Machine Learning Research$/i,
    / - Hugging Face$/i,
    / \| Papers With Code$/i,
    / - Google Scholar$/i,
  ];

  for (const suffix of suffixes) {
    cleaned = cleaned.replace(suffix, "");
  }

  // Also remove trailing " | Something" patterns
  cleaned = cleaned.replace(/\s*\|\s*[^|]{0,50}$/, "");
  cleaned = cleaned.replace(/\s*-\s*[^-]{0,50}$/, "");

  return cleaned.trim();
}

/**
 * Format query for display based on type
 */
export function formatQueryForDisplay(hint: SearchHint): string {
  return hint.displayValue;
}

/**
 * Get the raw query value to send to APIs
 */
export function getQueryValue(hint: SearchHint): string {
  return hint.value;
}

/**
 * Social platform URL patterns for username extraction
 */
export interface SocialUrlInfo {
  platform: "twitter" | "bluesky" | "mastodon" | "threads" | "linkedin" | "unknown";
  username?: string;
  postId?: string;
  isPost: boolean;
}

/**
 * Parse social media URL to extract username and post ID
 */
export function parseSocialUrl(url: string): SocialUrlInfo {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname;

    // Twitter/X: twitter.com/username or x.com/username/status/postId
    if (hostname === "x.com" || hostname === "twitter.com" || hostname === "www.twitter.com") {
      const match = pathname.match(/^\/([^/]+)(?:\/status\/(\d+))?/);
      if (match && match[1] && !["home", "explore", "notifications", "messages", "i", "search"].includes(match[1])) {
        return {
          platform: "twitter",
          username: match[1],
          postId: match[2],
          isPost: !!match[2],
        };
      }
    }

    // Bluesky: bsky.app/profile/username.bsky.social/post/postId
    if (hostname === "bsky.app") {
      const match = pathname.match(/^\/profile\/([^/]+)(?:\/post\/([a-z0-9]+))?/i);
      if (match) {
        return {
          platform: "bluesky",
          username: match[1],
          postId: match[2],
          isPost: !!match[2],
        };
      }
    }

    // Threads: threads.net/@username/post/postId (check before Mastodon due to /@ pattern)
    if (hostname === "threads.net" || hostname === "www.threads.net") {
      const match = pathname.match(/^\/@([^/]+)(?:\/post\/([^/]+))?/);
      if (match) {
        return {
          platform: "threads",
          username: match[1],
          postId: match[2],
          isPost: !!match[2],
        };
      }
    }

    // Mastodon: mastodon.social/@username/postId or any instance
    if (hostname.includes("mastodon") || pathname.startsWith("/@")) {
      const match = pathname.match(/^\/@([^/]+)(?:\/(\d+))?/);
      if (match) {
        return {
          platform: "mastodon",
          username: match[1],
          postId: match[2],
          isPost: !!match[2],
        };
      }
    }

    // LinkedIn: linkedin.com/in/username or linkedin.com/posts/activity-id
    if (hostname === "linkedin.com" || hostname === "www.linkedin.com") {
      const profileMatch = pathname.match(/^\/in\/([^/]+)/);
      if (profileMatch) {
        return {
          platform: "linkedin",
          username: profileMatch[1],
          isPost: false,
        };
      }
      const postMatch = pathname.match(/^\/posts\/([^/]+)/);
      if (postMatch) {
        return {
          platform: "linkedin",
          postId: postMatch[1],
          isPost: true,
        };
      }
    }

    return { platform: "unknown", isPost: false };
  } catch {
    return { platform: "unknown", isPost: false };
  }
}

/**
 * Check if URL is a PDF (for arXiv PDFs, etc.)
 */
export function isPdfUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();

    // Direct PDF links
    if (pathname.endsWith(".pdf")) return true;

    // ArXiv PDF pages
    if (urlObj.hostname === "arxiv.org" && pathname.includes("/pdf/")) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Extract arXiv ID from PDF URL
 */
export function extractArxivIdFromPdf(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== "arxiv.org") return null;

    const match = urlObj.pathname.match(/\/pdf\/(\d{4}\.\d{4,5}(?:v\d+)?)/);
    if (match) return match[1];

    // Old format
    const oldMatch = urlObj.pathname.match(/\/pdf\/([a-z-]+\/\d+)/i);
    if (oldMatch) return oldMatch[1];

    return null;
  } catch {
    return null;
  }
}
