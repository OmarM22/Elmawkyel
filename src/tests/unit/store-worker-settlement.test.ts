/*
 * Worker payoff tests against the demo store: cross-project statement,
 * oldest-first allocation, overpayment rejection, auto-settle on full pay.
 */
import { describe, expect, it } from "vitest";
import { addDays, todayUTC } from "@/lib/dates";
import {
  assignPersonToProject,
  createPerson,
  createProject,
  getWorkerStatement,
  listWeeks,
  payWorker,
  recordAttendanceBatch,
} from "@/server/demo";

const DATE = todayUTC();
const START = addDays(DATE, -30);

async function setupTwoProjects() {
  const a = await createProject({ name: "تصفية أ", startDate: START, workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] });
  const b = await createProject({ name: "تصفية ب", startDate: START, workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] });
  const p = await createPerson({ name: "تصفية عامل", type: "WORKER", currentDailyRate: 200 });
  await assignPersonToProject(a.id, p.id);
  await assignPersonToProject(b.id, p.id);
  await recordAttendanceBatch({
    projectId: a.id,
    date: DATE,
    createdBy: "u1",
    records: [{ personId: p.id, status: "PRESENT" }],
  });
  await recordAttendanceBatch({
    projectId: b.id,
    date: DATE,
    createdBy: "u1",
    records: [{ personId: p.id, status: "LEAVE" }],
  });
  return { a, b, p };
}

describe("worker payoff", () => {
  it("builds a cross-project statement with totals", async () => {
    const { p } = await setupTwoProjects();
    const st = await getWorkerStatement(p.id);
    expect(st.personName).toBe("تصفية عامل");
    expect(st.dues).toHaveLength(1); // only project A has dues
    expect(st.totalDue).toBe(20000);
    expect(st.totalPaid).toBe(0);
    expect(st.totalRemaining).toBe(20000);
  });

  it("allocates partial payment to the oldest due first", async () => {
    const { p } = await setupTwoProjects();
    const res = await payWorker(p.id, 5000, undefined, "u1");
    expect(res.applied).toBe(1);
    expect(res.allocations).toHaveLength(1);
    expect(res.allocations[0].amountHalalas).toBe(5000);
    const st = await getWorkerStatement(p.id);
    expect(st.totalPaid).toBe(5000);
    expect(st.totalRemaining).toBe(15000);
  });

  it("rejects overpayment and settles fully on exact pay", async () => {
    const { a, p } = await setupTwoProjects();
    await expect(payWorker(p.id, 20001, undefined, "u1")).rejects.toThrow("المتبقي");
    const full = await payWorker(p.id, 20000, "نهائي", "u1");
    expect(full.statement.totalRemaining).toBe(0);
    const weeks = await listWeeks(a.id);
    expect(weeks[0].status).toBe("SETTLED");
    expect(weeks[0].payments).toHaveLength(1);
    expect(weeks[0].payments[0].notes).toBe("نهائي");
  });

  it("throws not-found for a missing person", async () => {
    await expect(getWorkerStatement("p-nope")).rejects.toThrow("الشخص غير موجود");
    await expect(payWorker("p-nope", 100, undefined, "u1")).rejects.toThrow("الشخص غير موجود");
  });
});
