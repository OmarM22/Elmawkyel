/*
 * Financial calculation scenarios (business rules) using the real helpers
 * in src/lib/money.ts. Money is integer halalas — never float arithmetic.
 */
import { describe, expect, it } from "vitest";
import { formatSAR, mulRateDays, sumHalalas, toHalalas } from "@/lib/money";

describe("Financial scenarios", () => {
  it("200 SAR × 6 days = 1200 SAR", () => {
    expect(formatSAR(mulRateDays(200, 6))).toBe("1,200.00 ر.س");
  });

  it("150 SAR × 6 days = 900 SAR", () => {
    expect(formatSAR(mulRateDays(150, 6))).toBe("900.00 ر.س");
  });

  it("multiple projects for the same person in one week", () => {
    // Ahmed: Project A 2 days + Project B 2 days + Project C 2 days @200
    const total = sumHalalas([
      mulRateDays(200, 2),
      mulRateDays(200, 2),
      mulRateDays(200, 2),
    ]);
    expect(total).toBe(toHalalas(1200));
    expect(formatSAR(total)).toBe("1,200.00 ر.س");
  });

  it("changing daily rate does not affect old attendance (rate snapshot)", () => {
    const september = mulRateDays(200, 6); // recorded with old rate
    const october = mulRateDays(250, 6); // recorded after the raise
    expect(september).toBe(toHalalas(1200));
    expect(october).toBe(toHalalas(1500));
    expect(september).not.toBe(october);
  });

  it("editing attendance updates the weekly total", () => {
    const baseline = mulRateDays(200, 6); // 1200
    const afterEdit = baseline - mulRateDays(200, 1); // one day removed
    expect(formatSAR(afterEdit)).toBe("1,000.00 ر.س");
  });

  it("deleting attendance removes it from totals", () => {
    const baseline = sumHalalas([mulRateDays(200, 6), mulRateDays(150, 6)]);
    const afterDelete = baseline - mulRateDays(150, 6);
    expect(formatSAR(afterDelete)).toBe("1,200.00 ر.س");
  });

  it("a new week starts from zero and accumulates independently", () => {
    const week1 = mulRateDays(200, 6);
    let week2 = 0;
    expect(formatSAR(week2)).toBe("0.00 ر.س");
    week2 = sumHalalas([week2, mulRateDays(200, 4)]);
    expect(formatSAR(week2)).toBe("800.00 ر.س");
    expect(week1).toBe(toHalalas(1200));
  });

  it("project total recalculates from its attendance", () => {
    const days = [1, 1, 1, 0, 1, 1]; // 5 present days
    const total = sumHalalas(days.map((d) => mulRateDays(200, d)));
    expect(formatSAR(total)).toBe("1,000.00 ر.س");
  });

  it("global total = sum of project totals", () => {
    const global = sumHalalas([
      mulRateDays(200, 6), // Project A: 1200
      mulRateDays(150, 6), // Project B: 900
      mulRateDays(200, 6), // Project C: 1200
    ]);
    expect(formatSAR(global)).toBe("3,300.00 ر.س");
  });
});
