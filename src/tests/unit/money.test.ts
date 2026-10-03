/*
 * Money helper unit tests (pure integer halalas arithmetic, SAR display).
 * Money is handled as integer halalas — never float arithmetic.
 */
import { describe, expect, it } from "vitest";
import { formatSAR, mulRateDays, mulRateHours, sumHalalas, toHalalas } from "@/lib/money";

describe("money helpers", () => {
  it("converts SAR to integer halalas", () => {
    expect(toHalalas(200)).toBe(20000);
    expect(toHalalas("150.50")).toBe(15050);
    expect(toHalalas("0.1")).toBe(10);
  });

  it("200 SAR × 6 days = 120000 halalas", () => {
    expect(mulRateDays(200, 6)).toBe(120000);
  });

  it("150 SAR × 6 days = 90000 halalas", () => {
    expect(mulRateDays(150, 6)).toBe(90000);
  });

  it("supports fractional hours (half day)", () => {
    expect(mulRateHours(200, 0.5)).toBe(10000);
  });

  it("sums halalas across projects", () => {
    expect(sumHalalas([40000, 40000, 40000])).toBe(120000);
  });

  it("formats halalas for Arabic UI display", () => {
    expect(formatSAR(120000)).toBe("1,200.00 ر.س");
    expect(formatSAR(90000)).toBe("900.00 ر.س");
    expect(formatSAR(0)).toBe("0.00 ر.س");
  });
});
