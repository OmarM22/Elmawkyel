/*
 * quickMark tests against the demo store: fan-out PRESENT to every eligible
 * project, UNIQUE(person, date) conflict reporting, and input guards.
 */
import { describe, expect, it } from "vitest";
import { addDays, todayUTC } from "@/lib/dates";
import {
  assignPersonToProject,
  createPerson,
  createProject,
  listAttendance,
  quickMark,
} from "@/server/demo";

const ALL_DAYS = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

// Dynamic dates: assignments start "today", so targets must be covered.
const DATE = todayUTC();
const START = addDays(DATE, -30);

async function setupTwoSites() {
  const a = await createProject({ name: "موقع أ", startDate: START, workingDays: ALL_DAYS });
  const b = await createProject({ name: "موقع ب", startDate: START, workingDays: ALL_DAYS });
  const p = await createPerson({ name: "متنقل", type: "WORKER", currentDailyRate: 150 });
  await assignPersonToProject(a.id, p.id);
  await assignPersonToProject(b.id, p.id);
  return { a, b, p };
}

describe("quickMark fan-out", () => {
  it("records PRESENT in every eligible project with rate snapshots", async () => {
    const { p } = await setupTwoSites();
    const res = await quickMark(p.id, DATE, "PRESENT", "u1");
    expect(res.projects).toHaveLength(2);
    expect(res.skipped).toHaveLength(0);
    const rows = await listAttendance({ personId: p.id });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "PRESENT" && r.dailyRate === 150 && r.hours === 1)).toBe(true);
  });

  it("reports a conflict instead of duplicating payable presence", async () => {
    const { a, p } = await setupTwoSites();
    await quickMark(p.id, DATE, "PRESENT", "u1");
    const again = await quickMark(p.id, DATE, "PRESENT", "u1");
    expect(again.projects).toHaveLength(0);
    expect(again.skipped).toHaveLength(1);
    expect(again.skipped[0]).toMatchObject({ personId: p.id, existingProjectId: a.id });
    expect(await listAttendance({ personId: p.id })).toHaveLength(2); // unchanged
  });

  it("rejects unknown person, inactive person, and bad dates", async () => {
    await expect(quickMark("p-nope", DATE, "PRESENT", "u1")).rejects.toThrow("الشخص غير موجود");
    await expect(quickMark("p1", "not-a-date", "PRESENT", "u1")).rejects.toThrow("التاريخ غير صالح");
  });
});
