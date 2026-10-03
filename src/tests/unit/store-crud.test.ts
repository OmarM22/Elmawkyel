/*
 * Demo-store create/update round-trips (in-memory, node environment).
 * The Prisma store mirrors these shapes (verified by tsc + production smoke).
 */
import { describe, expect, it } from "vitest";
import {
  createPerson,
  createProject,
  getPerson,
  getProject,
  updatePerson,
  updateProject,
} from "@/server/demo";

describe("demo store people CRUD", () => {
  it("creates a person with normalized fields", async () => {
    const p = await createPerson({
      name: "  اختبار إنشاء  ",
      type: "WORKER",
      phone: "",
      currentDailyRate: 175,
    });
    expect(p.id).toMatch(/^p/);
    expect(p.name).toBe("اختبار إنشاء");
    expect(p.phone).toBeNull();
    expect(p.active).toBe(true);
    expect(p.currentDailyRate).toBe(175);
  });

  it("updates rate, phone, and active flag", async () => {
    const created = await createPerson({
      name: "اختبار تعديل",
      type: "CRAFTSMAN",
      phone: "0500000000",
      currentDailyRate: 200,
    });
    const updated = await updatePerson(created.id, {
      currentDailyRate: 250,
      phone: null,
      active: false,
    });
    expect(updated?.currentDailyRate).toBe(250);
    expect(updated?.phone).toBeNull();
    expect(updated?.active).toBe(false);
    // history-safe: fetching again reflects the update
    expect((await getPerson(created.id))?.currentDailyRate).toBe(250);
  });

  it("returns null when updating a missing person", async () => {
    await expect(updatePerson("p-nope", { name: "x" })).resolves.toBeNull();
  });
});

describe("demo store project CRUD", () => {
  it("creates a project with open end date by default", async () => {
    const pr = await createProject({
      name: "اختبار مشروع",
      startDate: "2026-10-01",
      workingDays: ["SUNDAY", "MONDAY"],
    });
    expect(pr.id).toMatch(/^pr/);
    expect(pr.endDate).toBeNull();
    expect(pr.status).toBe("ACTIVE");
    expect(pr.workingDays).toEqual(["SUNDAY", "MONDAY"]);
  });

  it("updates status and working days", async () => {
    const created = await createProject({
      name: "اختبار تعديل مشروع",
      startDate: "2026-09-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
      workingDays: ["SATURDAY"],
    });
    const updated = await updateProject(created.id, {
      status: "ON_HOLD",
      workingDays: ["SATURDAY", "SUNDAY"],
    });
    expect(updated?.status).toBe("ON_HOLD");
    expect(updated?.workingDays).toEqual(["SATURDAY", "SUNDAY"]);
    expect((await getProject(created.id))?.status).toBe("ON_HOLD");
  });

  it("returns null when updating a missing project", async () => {
    await expect(updateProject("pr-nope", { name: "x" })).resolves.toBeNull();
  });
});
