/*
 * Attendance day-close workflow tests against the demo store:
 * 10 assigned / 7 present / close → day locked, no rows added, payable stays 7,
 * uniqueness for PRESENT, atomic move, reopen unlock.
 */
import { describe, expect, it } from "vitest";
import { addDays, todayUTC } from "@/lib/dates";
import {
  assignPersonToProject,
  closeAttendanceDay,
  createPerson,
  createProject,
  getDayClose,
  isAttendanceDayClosed,
  listAttendance,
  moveAttendance,
  recordAttendanceBatch,
  recordWeekPayments,
  listWeeks,
  reopenAttendanceDay,
  updatePerson,
} from "@/server/demo";

const SATURDAY = "2026-10-03"; // fixed past Saturday (uniqueness/move flows)
const ALL_DAYS = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

async function setupProject(name: string, n: number, rate = 200) {
  // Dynamic dates: assignments start "today", so the close date must be covered.
  const date = todayUTC();
  const pr = await createProject({ name, startDate: addDays(date, -30), workingDays: ALL_DAYS });
  const people = [];
  for (let i = 0; i < n; i++) {
    const p = await createPerson({ name: `${name} ${i + 1}`, type: "WORKER", currentDailyRate: rate });
    await assignPersonToProject(pr.id, p.id);
    people.push(p);
  }
  return { pr, people, date };
}

describe("attendance day close", () => {
  it("closes with 7 present of 10 assigned: locks the day, adds no rows", async () => {
    const { pr, people, date } = await setupProject("إغلاق", 10);
    await recordAttendanceBatch({
      projectId: pr.id,
      date,
      createdBy: "u1",
      records: people.slice(0, 7).map((p) => ({ personId: p.id, status: "PRESENT" as const })),
    });
    expect(await isAttendanceDayClosed(pr.id, date)).toBe(false);
    const closed = await closeAttendanceDay(pr.id, date, "u1");
    expect(closed).toEqual({ closed: true });
    expect(await isAttendanceDayClosed(pr.id, date)).toBe(true);
    const status = await getDayClose(pr.id, date);
    expect(status).toMatchObject({ projectId: pr.id, date, closedBy: "u1" });

    const rows = await listAttendance({ projectId: pr.id });
    const present = rows.filter((r) => r.status === "PRESENT");
    expect(rows).toHaveLength(7);
    expect(present).toHaveLength(7);
    // payable days = 7
    expect(present.reduce((s, r) => s + Math.round(r.dailyRate * 100) * r.hours, 0)).toBe(140000);
  });

  it("rejects closing a non-working day without writing anything", async () => {
    // Empty working days: every date is a rest day, regardless of today.
    const pr = await createProject({ name: "عطلة مشروع", startDate: "2026-09-01", workingDays: [] });
    const p = await createPerson({ name: "عطلة شخص", type: "WORKER", currentDailyRate: 150 });
    await assignPersonToProject(pr.id, p.id);
    await expect(closeAttendanceDay(pr.id, todayUTC(), "u1")).rejects.toThrow("أيام عمل");
    expect(await listAttendance({ projectId: pr.id })).toHaveLength(0);
  });

  it("blocks recording on closed days and restores on reopen", async () => {
    const { pr, people, date } = await setupProject("قفل", 2);
    await recordAttendanceBatch({
      projectId: pr.id,
      date,
      createdBy: "u1",
      records: [{ personId: people[0].id, status: "PRESENT" }],
    });
    await closeAttendanceDay(pr.id, date, "u1");
    await expect(
      recordAttendanceBatch({
        projectId: pr.id,
        date,
        createdBy: "u1",
        records: [{ personId: people[1].id, status: "PRESENT" }],
      }),
    ).rejects.toThrow("مغلق");
    const reopened = await reopenAttendanceDay(pr.id, date);
    expect(reopened).toEqual({ reopened: true });
    expect(await isAttendanceDayClosed(pr.id, date)).toBe(false);
    // manual record survived; recording works again
    const rows = await listAttendance({ projectId: pr.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("PRESENT");
    const retry = await recordAttendanceBatch({
      projectId: pr.id,
      date,
      createdBy: "u1",
      records: [{ personId: people[1].id, status: "PRESENT" }],
    });
    expect(retry.recorded).toBe(1);
  });

  it("keeps historical rate snapshots across close and rate changes", async () => {
    const { pr, people, date } = await setupProject("أجر", 1, 200);
    await recordAttendanceBatch({
      projectId: pr.id,
      date,
      createdBy: "u1",
      records: [{ personId: people[0].id, status: "PRESENT" }],
    });
    await updatePerson(people[0].id, { currentDailyRate: 250 });
    await closeAttendanceDay(pr.id, date, "u1");
    const rows = await listAttendance({ projectId: pr.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].dailyRate).toBe(200);
  });

  it("blocks closing a settled week", async () => {
    const { pr, people, date } = await setupProject("مسوّى", 1);
    await recordAttendanceBatch({
      projectId: pr.id,
      date,
      createdBy: "u1",
      records: [{ personId: people[0].id, status: "PRESENT" }],
    });
    const weekId = (await listWeeks(pr.id))[0].id;
    await recordWeekPayments(weekId, {
      payments: [{ personId: people[0].id, amountHalalas: 20000 }],
      createdBy: "u1",
    });
    await expect(closeAttendanceDay(pr.id, date, "u1")).rejects.toThrow("مسوّى");
  });
});

describe("UNIQUE(person, date) for PRESENT", () => {
  it("skips a second payable mark with conflict info", async () => {
    const a = await createProject({ name: "تفرد أ", startDate: "2026-09-01", workingDays: ["SATURDAY"] });
    const b = await createProject({ name: "تفرد ب", startDate: "2026-09-01", workingDays: ["SATURDAY"] });
    const p = await createPerson({ name: "تفرد شخص", type: "WORKER", currentDailyRate: 150 });
    await assignPersonToProject(a.id, p.id);
    await assignPersonToProject(b.id, p.id);
    await recordAttendanceBatch({
      projectId: a.id,
      date: SATURDAY,
      createdBy: "u1",
      records: [{ personId: p.id, status: "PRESENT" }],
    });
    const res = await recordAttendanceBatch({
      projectId: b.id,
      date: SATURDAY,
      createdBy: "u1",
      records: [{ personId: p.id, status: "PRESENT" }],
    });
    expect(res.recorded).toBe(0);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatchObject({ personId: p.id, existingProjectId: a.id, existingProjectName: "تفرد أ" });
    expect(await listAttendance({ projectId: b.id })).toHaveLength(0);
  });

  it("allows LEAVE alongside PRESENT elsewhere", async () => {
    const a = await createProject({ name: "مختلط أ", startDate: "2026-09-01", workingDays: ["SATURDAY"] });
    const b = await createProject({ name: "مختلط ب", startDate: "2026-09-01", workingDays: ["SATURDAY"] });
    const p = await createPerson({ name: "مختلط شخص", type: "WORKER", currentDailyRate: 150 });
    await assignPersonToProject(a.id, p.id);
    await assignPersonToProject(b.id, p.id);
    await recordAttendanceBatch({
      projectId: a.id,
      date: SATURDAY,
      createdBy: "u1",
      records: [{ personId: p.id, status: "PRESENT" }],
    });
    const res = await recordAttendanceBatch({
      projectId: b.id,
      date: SATURDAY,
      createdBy: "u1",
      records: [{ personId: p.id, status: "LEAVE" }],
    });
    expect(res.recorded).toBe(1);
    expect(res.skipped).toHaveLength(0);
  });

  it("moves a PRESENT mark preserving the snapshot, and blocks locked sides", async () => {
    const a = await createProject({ name: "نقل أ", startDate: "2026-09-01", workingDays: ["SATURDAY"] });
    const b = await createProject({ name: "نقل ب", startDate: "2026-09-01", workingDays: ["SATURDAY"] });
    const p = await createPerson({ name: "نقل شخص", type: "WORKER", currentDailyRate: 150 });
    await assignPersonToProject(a.id, p.id);
    await assignPersonToProject(b.id, p.id);
    await recordAttendanceBatch({
      projectId: a.id,
      date: SATURDAY,
      createdBy: "u1",
      records: [{ personId: p.id, status: "PRESENT" }],
    });
    await updatePerson(p.id, { currentDailyRate: 180 });
    const { moved } = await moveAttendance({ personId: p.id, date: SATURDAY, toProjectId: b.id });
    expect(moved.projectId).toBe(b.id);
    expect(moved.dailyRate).toBe(150); // original snapshot preserved
    expect(await listAttendance({ projectId: a.id })).toHaveLength(0);
    // closed source blocks the move
    await recordAttendanceBatch({
      projectId: a.id,
      date: SATURDAY,
      createdBy: "u1",
      records: [{ personId: p.id, status: "LEAVE" }],
    });
    await closeAttendanceDay(b.id, SATURDAY, "u1");
    await expect(moveAttendance({ personId: p.id, date: SATURDAY, toProjectId: a.id })).rejects.toThrow(
      "مغلق",
    );
  });
});
