import { describe, expect, it } from "vitest";
import { calculateDte, getDteStatus, getDteLabel } from "./dte";

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

  it("counts a weekday holiday because no holiday calendar is applied", () => {
    expect(calculateDte(new Date("2026-12-24T12:00:00.000Z"), "2026-12-25")).toBe(1);
  });

  it("returns zero for an expired date", () => {
    expect(calculateDte(new Date("2026-09-18T12:00:00.000Z"), "2026-09-17")).toBe(0);
  });

  it("returns null for an invalid expiration date", () => {
    expect(calculateDte(new Date("2026-09-18T12:00:00.000Z"), "not-a-date")).toBeNull();
  });
});

describe("getDteStatus", () => {
  it("returns 'normal' for DTE > 15", () => {
    expect(getDteStatus(20)).toBe("normal");
    expect(getDteStatus(16)).toBe("normal");
  });

  it("returns 'attention' for DTE 11-15", () => {
    expect(getDteStatus(15)).toBe("attention");
    expect(getDteStatus(11)).toBe("attention");
  });

  it("returns 'alert' for DTE 4-7", () => {
    expect(getDteStatus(7)).toBe("alert");
    expect(getDteStatus(4)).toBe("alert");
  });

  it("returns 'critical' for DTE 1-3", () => {
    expect(getDteStatus(3)).toBe("critical");
    expect(getDteStatus(1)).toBe("critical");
  });

  it("returns 'expired' for DTE 0", () => {
    expect(getDteStatus(0)).toBe("expired");
  });

  it("returns null for null DTE", () => {
    expect(getDteStatus(null)).toBeNull();
  });
});

describe("getDteLabel", () => {
  it("returns label with status for valid DTE", () => {
    expect(getDteLabel(20)).toBe("20 dias (normal)");
    expect(getDteStatus(10)).toBe("attention");
    expect(getDteLabel(10)).toBe("10 dias (atenção)");
  });

  it("returns 'VENCIDA' for DTE 0", () => {
    expect(getDteLabel(0)).toBe("VENCIDA");
  });

  it("returns '-' for null DTE", () => {
    expect(getDteLabel(null)).toBe("-");
  });
});
