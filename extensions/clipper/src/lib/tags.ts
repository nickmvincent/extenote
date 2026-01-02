/**
 * Smart tag suggestion service
 * Analyzes title/abstract to suggest relevant tags from existing taxonomy
 */

import type { PageMetadata } from "./types";

// Known tag taxonomy based on user's content analysis
export const TAG_TAXONOMY = {
  // Top-level topic tags (most common)
  topics: [
    "ml-methods",
    "data-governance",
    "ai-society",
    "language-models",
    "data-infrastructure",
    "ai-safety",
    "legal-policy",
    "fairness",
    "privacy",
    "training-dynamics",
    "interpretability",
    "adversarial",
    "benchmark",
    "data-attribution",
    "survey",
    "foundational",
    "regulation",
    "content-ecosystems",
    "data-labor",
    "copyright",
    "unlearning",
    "memorization",
  ],

  // Collection prefixes (research themes)
  collections: [
    "collection:data-leverage",
    "collection:ugc-value",
  ],

  // Domain-specific tags (dc: prefix)
  domains: [
    "dc:fairness-data",
    "dc:data-valuation",
    "dc:data-poisoning",
    "dc:scaling-laws",
    "dc:privacy-memorization",
    "dc:influence-functions",
    "dc:data-selection",
    "dc:data-augmentation",
    "dc:causal-inference",
    "dc:active-learning",
    "dc:machine-unlearning",
  ],

  // Venue/conference tags
  venues: [
    "icml",
    "neurips",
    "facct",
    "chi",
    "aaai",
    "usenix",
    "cscw",
    "iclr",
    "aistats",
  ],
};

// Keyword to tag mappings for smart suggestions
const KEYWORD_MAPPINGS: Record<string, string[]> = {
  // ML Methods
  "machine learning": ["ml-methods"],
  "deep learning": ["ml-methods"],
  "neural network": ["ml-methods"],
  "transformer": ["ml-methods", "language-models"],
  "gradient": ["ml-methods", "training-dynamics"],
  "optimization": ["ml-methods", "training-dynamics"],
  "training": ["ml-methods", "training-dynamics"],

  // Language Models
  "language model": ["language-models"],
  "llm": ["language-models"],
  "gpt": ["language-models"],
  "bert": ["language-models"],
  "chatgpt": ["language-models", "ai-society"],
  "large language": ["language-models"],
  "foundation model": ["language-models", "foundational"],

  // Data Governance
  "data governance": ["data-governance"],
  "data management": ["data-governance"],
  "data sharing": ["data-governance"],
  "consent": ["data-governance", "privacy"],
  "data rights": ["data-governance", "legal-policy"],

  // AI Society
  "societal": ["ai-society"],
  "society": ["ai-society"],
  "impact": ["ai-society"],
  "ethical": ["ai-society"],
  "ethics": ["ai-society"],
  "responsible ai": ["ai-society"],
  "ai governance": ["ai-society", "data-governance"],

  // Privacy
  "privacy": ["privacy"],
  "differential privacy": ["privacy", "ml-methods"],
  "memorization": ["privacy", "memorization", "dc:privacy-memorization"],
  "extraction attack": ["privacy", "adversarial"],
  "membership inference": ["privacy", "adversarial"],

  // Fairness
  "fairness": ["fairness", "dc:fairness-data"],
  "bias": ["fairness"],
  "discrimination": ["fairness"],
  "equity": ["fairness"],
  "algorithmic fairness": ["fairness", "ml-methods"],

  // Data Attribution/Valuation
  "data valuation": ["data-attribution", "dc:data-valuation"],
  "shapley": ["data-attribution", "dc:data-valuation"],
  "influence function": ["data-attribution", "dc:influence-functions"],
  "data attribution": ["data-attribution"],
  "contribution": ["data-attribution"],

  // Data Infrastructure
  "dataset": ["data-infrastructure"],
  "data pipeline": ["data-infrastructure"],
  "data format": ["data-infrastructure"],
  "web crawl": ["data-infrastructure"],
  "common crawl": ["data-infrastructure"],

  // AI Safety
  "safety": ["ai-safety"],
  "alignment": ["ai-safety"],
  "harmful": ["ai-safety"],
  "toxic": ["ai-safety"],
  "jailbreak": ["ai-safety", "adversarial"],

  // Unlearning
  "unlearning": ["unlearning", "dc:machine-unlearning"],
  "machine unlearning": ["unlearning", "dc:machine-unlearning"],
  "forget": ["unlearning"],

  // Training Dynamics
  "scaling law": ["training-dynamics", "dc:scaling-laws"],
  "emergent": ["training-dynamics"],
  "in-context learning": ["training-dynamics", "language-models"],

  // Legal/Policy
  "copyright": ["legal-policy", "copyright"],
  "gdpr": ["legal-policy", "privacy"],
  "regulation": ["legal-policy", "regulation"],
  "policy": ["legal-policy"],
  "law": ["legal-policy"],

  // Data Leverage (user's research area)
  "data leverage": ["collection:data-leverage", "data-governance"],
  "collective action": ["collection:data-leverage"],
  "data strike": ["collection:data-leverage"],
  "data coalition": ["collection:data-leverage"],

  // UGC Value
  "user-generated content": ["collection:ugc-value", "content-ecosystems"],
  "ugc": ["collection:ugc-value"],
  "wikipedia": ["collection:ugc-value", "content-ecosystems"],
  "stack overflow": ["collection:ugc-value", "content-ecosystems"],
  "reddit": ["content-ecosystems"],

  // Data Selection
  "data selection": ["dc:data-selection", "ml-methods"],
  "curriculum learning": ["dc:data-selection", "training-dynamics"],
  "active learning": ["dc:active-learning", "ml-methods"],
  "coreset": ["dc:data-selection"],

  // Adversarial
  "adversarial": ["adversarial"],
  "attack": ["adversarial"],
  "poisoning": ["adversarial", "dc:data-poisoning"],
  "backdoor": ["adversarial", "dc:data-poisoning"],

  // Benchmark
  "benchmark": ["benchmark"],
  "evaluation": ["benchmark"],
  "leaderboard": ["benchmark"],
};

export interface TagSuggestion {
  tag: string;
  confidence: number; // 0-1
  reason: string;
}

/**
 * Suggest tags based on paper metadata
 */
export function suggestTags(metadata: PageMetadata): TagSuggestion[] {
  const suggestions: Map<string, TagSuggestion> = new Map();

  // Combine title and abstract for analysis
  const text = [
    metadata.title,
    metadata.abstract || "",
    metadata.venue || "",
  ].join(" ").toLowerCase();

  // Check each keyword mapping
  for (const [keyword, tags] of Object.entries(KEYWORD_MAPPINGS)) {
    if (text.includes(keyword.toLowerCase())) {
      for (const tag of tags) {
        const existing = suggestions.get(tag);
        if (existing) {
          // Increase confidence if multiple keywords match
          existing.confidence = Math.min(1, existing.confidence + 0.2);
          existing.reason += `, "${keyword}"`;
        } else {
          suggestions.set(tag, {
            tag,
            confidence: 0.6,
            reason: `matched "${keyword}"`,
          });
        }
      }
    }
  }

  // Check venue for conference tags
  const venue = (metadata.venue || "").toLowerCase();
  for (const confTag of TAG_TAXONOMY.venues) {
    if (venue.includes(confTag)) {
      suggestions.set(confTag, {
        tag: confTag,
        confidence: 0.9,
        reason: "venue match",
      });
    }
  }

  // Add arxiv category as tag if present
  if (metadata.tags) {
    for (const tag of metadata.tags) {
      if (tag.match(/^[a-z]+\.[a-z]+$/i)) {
        // ArXiv category like cs.lg
        suggestions.set(tag, {
          tag: tag.toLowerCase(),
          confidence: 0.8,
          reason: "arxiv category",
        });
      }
    }
  }

  // Sort by confidence and return top suggestions
  return Array.from(suggestions.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

/**
 * Get all known tags for autocomplete
 */
export function getAllKnownTags(): string[] {
  return [
    ...TAG_TAXONOMY.topics,
    ...TAG_TAXONOMY.collections,
    ...TAG_TAXONOMY.domains,
    ...TAG_TAXONOMY.venues,
  ];
}

/**
 * Validate if a tag matches the taxonomy
 */
export function isKnownTag(tag: string): boolean {
  return getAllKnownTags().includes(tag);
}
