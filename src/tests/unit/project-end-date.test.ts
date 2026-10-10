/*
 * Optional project end date: blank / null / absent all mean "open-ended",
 * and clearing an existing end date must persist as null.
 */
import { describe, expect, it } from "vitest";
import { projectCreateSchema, projectPatchSchema } from "@/lib/validation";

const base = {
  name: "مشروع",
  startDate: "2026-10-01",
  status: "ACTIVE" as const,
  workingDays: ["SATURDAY" as const],
};

describe("project end date (optional)", () => {
  it("accepts a missing end date (open-ended project)", () => {
    const r = projectCreateSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("accepts a null end date", () => {
    const r = projectCreateSchema.safeParse({ ...base, endDate: null });
    expect(r.success).toBe(true);
  });

  it("accepts an empty string end date (empty date input)", () => {
    const r = projectCreateSchema.safeParse({ ...base, endDate: "" });
    expect(r.success).toBe(true);
  });

  it("accepts a real end date", () => {
    const r = projectCreateSchema.safeParse({ ...base, endDate: "2026-12-31" });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed end date", () => {
    expect(projectCreateSchema.safeParse({ ...base, endDate: "31/12/2026" }).success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const r = projectCreateSchema.safeParse({ ...base, startDate: "2026-10-10", endDate: "2026-10-01" });
    expect(r.success).toBe(false);
  });

  it("allows clearing the end date on patch", () => {
    expect(projectPatchSchema.safeParse({ endDate: null }).success).toBe(true);
    expect(projectPatchSchema.safeParse({ endDate: "" }).success).toBe(true);
    expect(projectPatchSchema.safeParse({}).success).toBe(true);
  });
});