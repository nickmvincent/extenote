import { describe, it, expect } from "bun:test";
import { truncate, capitalize, pluralize } from "../src/util/text";

describe("web text utils", () => {
  it("truncates long text", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  it("does not truncate short text", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("capitalizes text", () => {
    expect(capitalize("hello")).toBe("Hello");
    expect(capitalize("")).toBe("");
  });

  it("pluralizes correctly", () => {
    expect(pluralize(1, "apple")).toBe("apple");
    expect(pluralize(2, "apple")).toBe("apples");
    expect(pluralize(0, "apple")).toBe("apples");
    expect(pluralize(2, "box", "boxes")).toBe("boxes");
  });
});
