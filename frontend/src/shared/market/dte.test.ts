import { describe, expect, it } from "vitest";
import { calculateDte } from "./dte";

describe("calculateDte", () => {
  it("returns zero when expiration is today", () => {
    expect(calculateDte(new Date("2026-09-18T12:00:00.000Z"), "2026-09-18")).toBe(0);
  });

  it("counts weekdays after today through expiration", () => {
    expect(calculateDte(new Date("2026-09-14T12:00:00.000Z"), "2026-09-18")).toBe(4);
  });

  it("excludes weekends", () => {
    expect(calculateDte(new Date("2026-09-18T12:00:00.000Z"), "2026-09-21")).toBe(1);
  });

  it("returns zero for an expired date", () => {
    expect(calculateDte(new Date("2026-09-18T12:00:00.000Z"), "2026-09-17")).toBe(0);
  });

  it("returns null for an invalid expiration date", () => {
    expect(calculateDte(new Date("2026-09-18T12:00:00.000Z"), "not-a-date")).toBeNull();
  });
});
