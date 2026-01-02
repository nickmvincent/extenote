import { describe, it, expect } from "bun:test";
import {
  extractSearchHint,
  formatQueryForDisplay,
  getQueryValue,
} from "../src/lib/search-hint.js";

describe("extractSearchHint", () => {
  it("detects DOI from doi.org URLs", () => {
    const hint = extractSearchHint("https://doi.org/10.1145/1234.5678", "Ignored");
    expect(hint).toEqual({
      type: "doi",
      value: "10.1145/1234.5678",
      displayValue: "10.1145/1234.5678",
    });
  });

  it("detects arXiv IDs from arxiv.org URLs", () => {
    const hint = extractSearchHint("https://arxiv.org/abs/2301.12345v2", "Ignored");
    expect(hint).toEqual({
      type: "arxiv",
      value: "2301.12345v2",
      displayValue: "arXiv:2301.12345v2",
    });
  });

  it("detects OpenReview IDs from URLs", () => {
    const hint = extractSearchHint("https://openreview.net/forum?id=abc123", "Ignored");
    expect(hint).toEqual({
      type: "openreview",
      value: "abc123",
      displayValue: "OpenReview:abc123",
    });
  });

  it("falls back to a cleaned title when no hint is found", () => {
    const hint = extractSearchHint(
      "https://example.com/paper",
      "Paper Title | ACM Digital Library"
    );
    expect(hint).toEqual({
      type: "title",
      value: "Paper Title",
      displayValue: "Paper Title",
    });
  });
});

describe("query helpers", () => {
  it("returns display and raw values", () => {
    const hint = extractSearchHint("https://doi.org/10.1000/xyz", "Ignored");
    expect(formatQueryForDisplay(hint)).toBe("10.1000/xyz");
    expect(getQueryValue(hint)).toBe("10.1000/xyz");
  });
});
