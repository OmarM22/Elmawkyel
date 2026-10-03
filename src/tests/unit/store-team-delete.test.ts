/*
 * Workforce assignment + restricted delete tests against the demo store.
 */
import { describe, expect, it } from "vitest";
import {
  assignPersonToProject,
  createPerson,
  createProject,
  deletePerson,
  getProjectTeam,
  recordAttendanceBatch,
  recordWeekPayments,
  listWeeks,
  unassignPersonFromProject,
} from "@/server/demo";

describe("project team assignment", () => {
  it("assigns idempotently and lists the team", async () => {
    const p = await createPerson({ name: "فريق أحمد", type: "WORKER", currentDailyRate: 150 });
    const pr = await createProject({ name: "فريق مشروع", startDate: "2026-09-01", workingDays: ["SUNDAY"] });
    expect(await getProjectTeam(pr.id)).toHaveLength(0);
    await assignPersonToProject(pr.id, p.id);
    await assignPersonToProject(pr.id, p.id); // idempotent
    const team = await getProjectTeam(pr.id);
    expect(team).toHaveLength(1);
    expect(team[0]).toMatchObject({ personId: p.id, name: "فريق أحمد" });
  });

  it("unassign preserves history via end date and allows reassign", async () => {
    const p = await createPerson({ name: "إعادة تعيين", type: "WORKER", currentDailyRate: 150 });
    const pr = await createProject({ name: "إعادة مشروع", startDate: "2026-09-01", workingDays: ["SUNDAY"] });
    await assignPersonToProject(pr.id, p.id);
    await unassignPersonFromProject(pr.id, p.id);
    expect(await getProjectTeam(pr.id)).toHaveLength(0);
    await unassignPersonFromProject(pr.id, p.id); // idempotent no-op
    await assignPersonToProject(pr.id, p.id);
    expect(await getProjectTeam(pr.id)).toHaveLength(1);
  });

  it("rejects unknown project or person", async () => {
    const p = await createPerson({ name: "مجهول", type: "WORKER", currentDailyRate: 150 });
    await expect(assignPersonToProject("pr-nope", p.id)).rejects.toThrow("المشروع غير موجود");
    const pr = await createProject({ name: "مجهول مشروع", startDate: "2026-09-01", workingDays: ["SUNDAY"] });
    await expect(assignPersonToProject(pr.id, "p-nope")).rejects.toThrow("الشخص غير موجود");
  });
});

describe("restricted person delete", () => {
  it("deletes a history-free person", async () => {
    const p = await createPerson({ name: "حذف نظيف", type: "WORKER", currentDailyRate: 150 });
    await expect(deletePerson(p.id)).resolves.toBe(true);
  });

  it("blocks deletion with attendance history", async () => {
    const p = await createPerson({ name: "حذف محظور", type: "WORKER", currentDailyRate: 150 });
    const pr = await createProject({ name: "حذف مشروع", startDate: "2026-09-01", workingDays: ["SUNDAY"] });
    await recordAttendanceBatch({
      projectId: pr.id,
      date: "2026-10-03",
      createdBy: "u1",
      records: [{ personId: p.id, status: "PRESENT" }],
    });
    await expect(deletePerson(p.id)).rejects.toThrow("لا يمكن حذف");
  });

  it("blocks deletion with an open assignment, allows after unassign + cleanup", async () => {
    const p = await createPerson({ name: "حذف معين", type: "WORKER", currentDailyRate: 150 });
    const pr = await createProject({ name: "حذف معين مشروع", startDate: "2026-09-01", workingDays: ["SUNDAY"] });
    await assignPersonToProject(pr.id, p.id);
    await expect(deletePerson(p.id)).rejects.toThrow("لا يمكن حذف");
    await unassignPersonFromProject(pr.id, p.id);
    // Ended assignment alone is cleaned up with the person (no financial history).
    await expect(deletePerson(p.id)).resolves.toBe(true);
  });

  it("blocks deletion with payments", async () => {
    const p = await createPerson({ name: "حذف مدفوع", type: "WORKER", currentDailyRate: 150 });
    const pr = await createProject({ name: "حذف مدفوع مشروع", startDate: "2026-09-01", workingDays: ["SUNDAY"] });
    await recordAttendanceBatch({
      projectId: pr.id,
      date: "2026-10-03",
      createdBy: "u1",
      records: [{ personId: p.id, status: "PRESENT" }],
    });
    const weekId = (await listWeeks(pr.id))[0].id;
    await recordWeekPayments(weekId, { payments: [{ personId: p.id, amountHalalas: 15000 }], createdBy: "u1" });
    await expect(deletePerson(p.id)).rejects.toThrow("لا يمكن حذف");
  });

  it("throws not-found for a missing person", async () => {
    await expect(deletePerson("p-nope")).rejects.toThrow("الشخص غير موجود");
  });
});
