import { describe, it, expect } from "bun:test";
import { countIssueSeverities, countObjectTypes, countVisibility } from "../src/util/stats";

describe("tui stats helpers", () => {
  it("counts issue severities correctly", () => {
    const issues: any[] = [
      { severity: "error" },
      { severity: "error" },
      { severity: "warn" },
      { severity: "info" },
    ];
    const counts = countIssueSeverities(issues);
    expect(counts.error).toBe(2);
    expect(counts.warn).toBe(1);
    expect(counts.info).toBe(1);
  });

  it("handles empty issues list", () => {
    const counts = countIssueSeverities([]);
    expect(counts.error).toBe(0);
    expect(counts.warn).toBe(0);
    expect(counts.info).toBe(0);
  });

  it("counts object types", () => {
    const objects = [
      { type: "note" },
      { type: "note" },
      { type: "blog" },
    ] as any[];
    const counts = countObjectTypes(objects);
    expect(counts.note).toBe(2);
    expect(counts.blog).toBe(1);
    expect(counts.other).toBeUndefined();
  });

  it("counts visibility", () => {
    const objects = [
      { visibility: "public" },
      { visibility: "private" },
      { visibility: "public" },
    ] as any[];
    const counts = countVisibility(objects);
    expect(counts.public).toBe(2);
    expect(counts.private).toBe(1);
  });
});
