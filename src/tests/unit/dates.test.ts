/*
 * UTC date arithmetic stays correct in every timezone.
 * Run with TZ=Asia/Riyadh too: local-midnight math would fail these.
 */
import { describe, expect, it } from "vitest";
import { addDays, todayUTC } from "@/lib/dates";

describe("UTC date helpers", () => {
  it("adds 6 days for the weekly window", () => {
    expect(addDays("2026-10-03", 6)).toBe("2026-10-09");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("goes backwards", () => {
    expect(addDays("2026-10-03", -6)).toBe("2026-09-27");
  });

  it("returns today as YYYY-MM-DD", () => {
    expect(todayUTC()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
