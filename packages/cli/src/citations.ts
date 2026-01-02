export interface CitationScanObject {
  body: string;
  frontmatter: Record<string, unknown>;
  filePath: string;
}

/**
 * Detect citation keys referenced in project objects.
 *
 * For Quarto/Pandoc files (.qmd, .md): extracts [@key] patterns from body
 * For other objects: checks frontmatter fields that might link to references
 */
export function detectCitedReferences(objects: CitationScanObject[]): Set<string> {
  const citedKeys = new Set<string>();

  for (const obj of objects) {
    // 1. Scan body for Quarto/Pandoc citations
    if (obj.body) {
      for (const bracketMatch of obj.body.matchAll(/\[([^\]]*@[^\]]+)\]/g)) {
        const bracketContent = bracketMatch[1];
        if (bracketContent.toLowerCase().includes("mailto:")) {
          continue; // skip email addresses inside links
        }
        // Extract all @keys from within the brackets
        for (const keyMatch of bracketContent.matchAll(/@([\w][\w:._-]*)/g)) {
          citedKeys.add(keyMatch[1]);
        }
      }
    }

    // 2. Check frontmatter for reference links
    // Common patterns: references: [key1, key2], citations: [...], bibliography_keys: [...]
    const refFields = ["references", "citations", "bibliography_keys", "cites"];
    for (const field of refFields) {
      const value = obj.frontmatter[field];
      if (Array.isArray(value)) {
        for (const key of value) {
          if (typeof key === "string") {
            citedKeys.add(key);
          }
        }
      } else if (typeof value === "string") {
        citedKeys.add(value);
      }
    }
  }

  return citedKeys;
}
