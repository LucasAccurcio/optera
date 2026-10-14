import { describe, expect, it } from "vitest";
import { isValidDecimalInput, normalizeDecimalInput } from "./decimal-input";

describe("decimal input", () => {
  it("normalizes a comma decimal and trims external spaces", () => {
    expect(normalizeDecimalInput(" 22,04 ")).toBe("22.04");
  });

  it("preserves a point decimal", () => {
    expect(normalizeDecimalInput("2.04")).toBe("2.04");
  });

  it("rejects conflicting or repeated separators", () => {
    expect(isValidDecimalInput("1.234,56")).toBe(false);
    expect(isValidDecimalInput("1,234.56")).toBe(false);
    expect(isValidDecimalInput("1,2,3")).toBe(false);
  });

  it("accepts a decimal with either separator and up to six places", () => {
    expect(isValidDecimalInput("22,04")).toBe(true);
    expect(isValidDecimalInput("22.04")).toBe(true);
    expect(isValidDecimalInput("0,123456")).toBe(true);
    expect(isValidDecimalInput("0.1234567")).toBe(false);
  });
});
