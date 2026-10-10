/*
 * Project deletion rules: history-free projects delete cleanly (assignments
 * removed with them); attendance / payments / closed days block deletion.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  assignPersonToProject,
  closeAttendanceDay,
  createProject,
  deleteProject,
  getProject,
  listAttendance,
  listOpenAssignments,
  recordAttendanceBatch,
} from "@/server/demo";

const DATE = "2026-10-03"; // Saturday
const ALL_DAYS = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

async function freshProject(name: string) {
  return createProject({ name, startDate: "2026-10-01", workingDays: ALL_DAYS });
}

describe("Project deletion", () => {
  beforeEach(async () => {
    // Best-effort cleanup so tests stay independent inside one demo session.
    for (const p of (await listAttendance()).map((a) => a.projectId)) {
      try {
        await deleteProject(p);
      } catch {
        // history-bound project — leave it
      }
    }
  });

  it("deletes a history-free project and removes its assignments", async () => {
    const project = await freshProject("مشروع بدون سجل");
    await assignPersonToProject(project.id, "p1");
    expect((await listOpenAssignments()).some((a) => a.projectId === project.id)).toBe(true);

    await expect(deleteProject(project.id)).resolves.toBe(true);
    expect(await getProject(project.id)).toBeNull();
    expect((await listOpenAssignments()).some((a) => a.projectId === project.id)).toBe(false);
  });

  it("blocks deletion when attendance exists", async () => {
    const project = await freshProject("مشروع بحضور");
    await recordAttendanceBatch({
      projectId: project.id,
      date: DATE,
      records: [{ personId: "p1", status: "PRESENT" }],
      createdBy: "u1",
    });

    await expect(deleteProject(project.id)).rejects.toThrow("لا يمكن حذف هذا المشروع");
    expect(await getProject(project.id)).not.toBeNull();
  });

  it("force-deletes a project with attendance and wipes its rows", async () => {
    const project = await freshProject("مشروع بحضور - حذف نهائي");
    // p2 + a fresh date: p1 on DATE is already PRESENT in the blocked project
    // above (one payable project per person per date).
    await recordAttendanceBatch({
      projectId: project.id,
      date: "2026-10-05",
      records: [{ personId: "p2", status: "PRESENT" }],
      createdBy: "u1",
    });
    expect((await listAttendance({ projectId: project.id })).length).toBeGreaterThan(0);

    await expect(deleteProject(project.id, { force: true })).resolves.toBe(true);
    expect(await getProject(project.id)).toBeNull();
    expect(await listAttendance({ projectId: project.id })).toHaveLength(0);
  });

  it("force-deletes a project whose day is closed", async () => {
    const project = await freshProject("مشروع بيوم مغلق - حذف نهائي");
    await closeAttendanceDay(project.id, DATE, "u1");

    await expect(deleteProject(project.id, { force: true })).resolves.toBe(true);
    expect(await getProject(project.id)).toBeNull();
  });

  it("blocks deletion when the day is closed even with no rows", async () => {
    const project = await freshProject("مشروع بيوم مغلق");
    await closeAttendanceDay(project.id, DATE, "u1");

    await expect(deleteProject(project.id)).rejects.toThrow("لا يمكن حذف هذا المشروع");
    expect(await getProject(project.id)).not.toBeNull();
  });

  it("throws for a missing project", async () => {
    await expect(deleteProject("nope")).rejects.toThrow("المشروع غير موجود");
  });
});
