import { describe, expect, it } from "vitest";
import { claimInitialRefresh } from "./initial-refresh";

describe("initial quote refresh guard", () => {
  it("claims only the automatic refresh while allowing later manual calls", () => {
    const guard = { current: false };

    expect(claimInitialRefresh(guard)).toBe(true);
    expect(claimInitialRefresh(guard)).toBe(false);
    guard.current = false;
    expect(claimInitialRefresh(guard)).toBe(true);
  });
});
