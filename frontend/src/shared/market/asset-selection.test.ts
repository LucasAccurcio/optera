import { describe, expect, it } from "vitest";
import { normalizeAssetInput, tickerForAssetSelection } from "./asset-selection";

describe("asset selection", () => {
  it("returns the first four characters only after an explicit selection", () => {
    expect(tickerForAssetSelection("BBSE3", true)).toBe("BBSE");
    expect(tickerForAssetSelection("BBSE3", false)).toBe("");
  });

  it("normalizes asset input to uppercase without whitespace", () => {
    expect(normalizeAssetInput(" petr 4 ")).toBe("PETR4");
  });
});
