#!/usr/bin/env bun
/**
 * Generate narrative documentation from annotated test files.
 *
 * Annotations:
 *   @narrative {id}         - Groups tests into a narrative (on describe block)
 *   @title {text}           - Document title
 *   @description {text}     - Overview paragraph (can be multi-line)
 *   @narrative-step {n}     - Orders steps within narrative (on it block)
 *   @explanation {text}     - Prose explaining this step (can be multi-line)
 *   @code-highlight         - Include test code in output
 *
 * Usage:
 *   bun run scripts/generate-narrative-docs.ts
 *   bun run scripts/generate-narrative-docs.ts --check  # Verify docs are current
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, relative, basename } from "path";

// Configuration
const TEST_DIRS = ["packages/core/tests", "packages/refcheck/tests", "packages/cli/tests"];
const OUTPUT_DIR = "../extenote-pub/content/extenote-docs/narratives";
const BASE_ORDER = 20; // Start narrative docs at order 20

interface NarrativeStep {
  stepNumber: number;
  testName: string;
  explanation: string;
  codeHighlight: boolean;
  testCode?: string;
  lineNumber: number;
}

interface Narrative {
  id: string;
  title: string;
  description: string;
  steps: NarrativeStep[];
  sourceFile: string;
  relativePath: string;
}

interface ParsedBlock {
  type: "describe" | "it";
  name: string;
  comment: string;
  code: string;
  lineNumber: number;
}

/**
 * Parse JSDoc-style comment for annotation tags
 */
function parseAnnotations(comment: string): Record<string, string> {
  const annotations: Record<string, string> = {};

  // Match @tag followed by content until next @tag or end
  const tagPattern = /@(\w+[-\w]*)\s+([^@]*?)(?=@\w+|\*\/|$)/gs;
  let match;

  while ((match = tagPattern.exec(comment)) !== null) {
    const tag = match[1].trim();
    const value = match[2].trim().replace(/\s*\*\s*/g, " ").trim();
    annotations[tag] = value;
  }

  // Also check for flags (tags without values)
  const flagPattern = /@(code-highlight)\b/g;
  while ((match = flagPattern.exec(comment)) !== null) {
    annotations[match[1]] = "true";
  }

  return annotations;
}

/**
 * Extract describe and it blocks with their preceding comments
 */
function parseTestFile(content: string, filePath: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = content.split("\n");

  // Pattern to find describe/it blocks
  // Uses backreference to match closing quote with same type as opening quote
  const blockPattern = /^(\s*)(describe|it)\s*\(\s*(["'`])(.*?)\3\s*,/;

  let currentComment = "";
  let commentStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track JSDoc comments
    if (line.includes("/**")) {
      currentComment = line;
      commentStartLine = i;
    } else if (currentComment && !line.includes("*/")) {
      currentComment += "\n" + line;
    } else if (currentComment && line.includes("*/")) {
      currentComment += "\n" + line;
    }

    // Check for describe/it
    const match = line.match(blockPattern);
    if (match) {
      const type = match[2] as "describe" | "it";
      const name = match[4];

      // Extract the test code for 'it' blocks (simplified - just grab until closing)
      let code = "";
      if (type === "it") {
        let braceCount = 0;
        let started = false;
        for (let j = i; j < lines.length && j < i + 50; j++) {
          const codeLine = lines[j];
          if (codeLine.includes("{")) {
            started = true;
            braceCount += (codeLine.match(/{/g) || []).length;
          }
          if (codeLine.includes("}")) {
            braceCount -= (codeLine.match(/}/g) || []).length;
          }
          code += codeLine + "\n";
          if (started && braceCount === 0) break;
        }
      }

      blocks.push({
        type,
        name,
        comment: currentComment,
        code: code.trim(),
        lineNumber: i + 1,
      });

      // Reset comment after using it
      if (currentComment.includes("@narrative") || currentComment.includes("@explanation")) {
        currentComment = "";
      }
    }

    // Clear comment if we hit a non-comment, non-whitespace line that isn't describe/it
    if (!line.trim().startsWith("*") && !line.trim().startsWith("/") && line.trim() && !match) {
      if (!line.includes("describe") && !line.includes("it(")) {
        currentComment = "";
      }
    }
  }

  return blocks;
}

/**
 * Build narratives from parsed blocks
 */
function buildNarratives(blocks: ParsedBlock[], filePath: string, cwd: string): Narrative[] {
  const narratives = new Map<string, Narrative>();
  let currentNarrativeId: string | null = null;

  for (const block of blocks) {
    const annotations = parseAnnotations(block.comment);

    if (block.type === "describe" && annotations.narrative) {
      currentNarrativeId = annotations.narrative;
      narratives.set(currentNarrativeId, {
        id: currentNarrativeId,
        title: annotations.title || block.name,
        description: annotations.description || "",
        steps: [],
        sourceFile: filePath,
        relativePath: relative(cwd, filePath),
      });
    }

    if (block.type === "it" && annotations["narrative-step"] && currentNarrativeId) {
      const narrative = narratives.get(currentNarrativeId);
      if (narrative) {
        narrative.steps.push({
          stepNumber: parseInt(annotations["narrative-step"], 10),
          testName: block.name,
          explanation: annotations.explanation || "",
          codeHighlight: annotations["code-highlight"] === "true",
          testCode: block.code,
          lineNumber: block.lineNumber,
        });
      }
    }
  }

  // Sort steps within each narrative
  for (const narrative of narratives.values()) {
    narrative.steps.sort((a, b) => a.stepNumber - b.stepNumber);
  }

  return Array.from(narratives.values());
}

/**
 * Generate markdown for a narrative
 */
function generateMarkdown(narrative: Narrative, order: number): string {
  const slug = narrative.id.replace(/\//g, "-");

  let md = `---
type: doc
title: "${narrative.title}"
visibility: public
order: ${order}
generated: true
sourceTests:
  - ${narrative.relativePath}
---

# ${narrative.title}

${narrative.description}

`;

  for (const step of narrative.steps) {
    md += `## Step ${step.stepNumber}: ${step.testName}\n\n`;

    if (step.explanation) {
      md += `${step.explanation}\n\n`;
    }

    md += `**Test:** \`${step.testName}\`\n`;
    md += `**File:** \`${narrative.relativePath}:${step.lineNumber}\`\n\n`;

    if (step.testCode) {
      md += "```typescript\n";
      md += step.testCode;
      md += "\n```\n\n";
    }
  }

  md += `---\n\n*This documentation is generated from test annotations. Edit the source test file to update.*\n`;

  return md;
}

/**
 * Count total test cases in test directories
 */
function countTotalTests(testDirs: string[], cwd: string): number {
  let total = 0;
  for (const testDir of testDirs) {
    const fullDir = join(cwd, testDir);
    if (!existsSync(fullDir)) continue;

    const files = readdirSync(fullDir).filter((f) => f.endsWith(".test.ts"));
    for (const file of files) {
      const content = readFileSync(join(fullDir, file), "utf-8");
      const matches = content.match(/^\s*it\s*\(/gm);
      if (matches) total += matches.length;
    }
  }
  return total;
}

/**
 * Generate index page for all narratives
 */
function generateIndex(narratives: Narrative[], totalTests: number): string {
  // Group by category (first part of id)
  const byCategory = new Map<string, Narrative[]>();

  for (const n of narratives) {
    const category = n.id.split("/")[0];
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(n);
  }

  // Count total narrative steps
  const totalSteps = narratives.reduce((sum, n) => sum + n.steps.length, 0);
  const coveragePercent = Math.round((totalSteps / totalTests) * 100);

  // Define category order and descriptions
  const categoryOrder = ["check", "validation", "crossref", "tags", "lint", "export", "refcheck", "backup"];
  const categoryDescriptions: Record<string, string> = {
    check: "Reference verification and metadata matching",
    validation: "Schema and field validation",
    crossref: "Links, citations, and backlinks",
    tags: "Hierarchical tag management",
    lint: "Content linting rules",
    export: "Exporting to external formats",
    refcheck: "Verifying references against DBLP and OpenAlex",
    backup: "Undo and backup system",
  };

  let md = `---
type: doc
title: "Narrative Tests"
visibility: public
order: ${BASE_ORDER}
---

# Narrative Tests

Learn how Extenote works by walking through annotated test cases. Each narrative explains a feature through the tests that validate it.

## Coverage

**${totalSteps}** of **${totalTests}** tests (${coveragePercent}%) are documented in narratives across **${narratives.length}** topics.

Narratives are organized by feature area, starting with foundational concepts (validation, string matching) and building toward higher-level features (cross-references, exports).

`;

  // Sort categories by defined order
  const sortedCategories = Array.from(byCategory.keys()).sort((a, b) => {
    const aIdx = categoryOrder.indexOf(a);
    const bIdx = categoryOrder.indexOf(b);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  for (const category of sortedCategories) {
    const items = byCategory.get(category)!;
    const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1);
    const description = categoryDescriptions[category] || "";

    md += `## ${categoryTitle}\n\n`;
    if (description) {
      md += `*${description}*\n\n`;
    }

    for (const n of items) {
      const slug = n.id.replace(/\//g, "-");
      const stepCount = n.steps.length;
      md += `- [${n.title}](/extenote/docs/narratives/${slug}) (${stepCount} steps) - ${n.description.split(".")[0]}.\n`;
    }
    md += "\n";
  }

  md += `---\n\n*These documents are generated from test annotations. Run \`bun run generate:narratives\` to regenerate.*\n`;

  return md;
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes("--check");
  const cwd = process.cwd();

  console.log("Scanning test files for narrative annotations...\n");

  const allNarratives: Narrative[] = [];

  for (const testDir of TEST_DIRS) {
    const fullDir = join(cwd, testDir);
    if (!existsSync(fullDir)) continue;

    const files = readdirSync(fullDir).filter((f) => f.endsWith(".test.ts"));

    for (const file of files) {
      const filePath = join(fullDir, file);
      const content = readFileSync(filePath, "utf-8");
      const blocks = parseTestFile(content, filePath);
      const narratives = buildNarratives(blocks, filePath, cwd);

      if (narratives.length > 0) {
        console.log(`  ${file}: found ${narratives.length} narrative(s)`);
        allNarratives.push(...narratives);
      }
    }
  }

  if (allNarratives.length === 0) {
    console.log("\nNo narratives found. Add @narrative annotations to test files.\n");
    console.log("Example:");
    console.log(`
/**
 * @narrative validation/dates
 * @title Date Validation
 * @description How date fields are validated.
 */
describe("date validation", () => {
  /**
   * @narrative-step 1
   * @explanation ISO dates are the standard format.
   */
  it("accepts ISO dates", () => { ... });
});
`);
    return;
  }

  console.log(`\nFound ${allNarratives.length} narrative(s) total.\n`);

  // Count total tests for coverage stats
  const totalTests = countTotalTests(TEST_DIRS, cwd);
  const totalSteps = allNarratives.reduce((sum, n) => sum + n.steps.length, 0);
  console.log(`Coverage: ${totalSteps} of ${totalTests} tests (${Math.round((totalSteps / totalTests) * 100)}%)\n`);

  // Ensure output directory exists
  const outputPath = join(cwd, OUTPUT_DIR);
  if (!existsSync(outputPath)) {
    mkdirSync(outputPath, { recursive: true });
  }

  // Generate files
  const generatedFiles: string[] = [];

  // Generate index
  const indexContent = generateIndex(allNarratives, totalTests);
  const indexPath = join(outputPath, "index.md");
  generatedFiles.push(indexPath);

  // Generate each narrative
  let order = BASE_ORDER + 1;
  for (const narrative of allNarratives) {
    const slug = narrative.id.replace(/\//g, "-");
    const content = generateMarkdown(narrative, order);
    const filePath = join(outputPath, `${slug}.md`);
    generatedFiles.push(filePath);
    order++;
  }

  if (checkMode) {
    // In check mode, compare generated content with existing files
    let hasChanges = false;

    const existingIndexContent = existsSync(indexPath)
      ? readFileSync(indexPath, "utf-8")
      : "";
    if (existingIndexContent !== indexContent) {
      console.log(`CHANGED: ${relative(cwd, indexPath)}`);
      hasChanges = true;
    }

    for (const narrative of allNarratives) {
      const slug = narrative.id.replace(/\//g, "-");
      const content = generateMarkdown(narrative, BASE_ORDER + 1 + allNarratives.indexOf(narrative));
      const filePath = join(outputPath, `${slug}.md`);

      const existingContent = existsSync(filePath)
        ? readFileSync(filePath, "utf-8")
        : "";
      if (existingContent !== content) {
        console.log(`CHANGED: ${relative(cwd, filePath)}`);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      console.log("\nNarrative docs are out of sync. Run 'bun run generate:narratives' to update.");
      process.exit(1);
    } else {
      console.log("All narrative docs are up to date.");
    }
  } else {
    // Write files
    writeFileSync(indexPath, indexContent);
    console.log(`Generated: ${relative(cwd, indexPath)}`);

    for (const narrative of allNarratives) {
      const slug = narrative.id.replace(/\//g, "-");
      const content = generateMarkdown(narrative, BASE_ORDER + 1 + allNarratives.indexOf(narrative));
      const filePath = join(outputPath, `${slug}.md`);
      writeFileSync(filePath, content);
      console.log(`Generated: ${relative(cwd, filePath)}`);
    }

    console.log(`\nGenerated ${generatedFiles.length} file(s).`);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
