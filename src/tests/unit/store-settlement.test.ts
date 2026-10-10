/*
 * Settlement workflow tests against the demo store:
 * week derivation, partial/full payment, overpayment rejection,
 * settled-week edit blocking.
 */
import { describe, expect, it } from "vitest";
import {
  createPerson,
  createProject,
  listWeeks,
  recordAttendanceBatch,
  recordWeekPayments,
  voidWeekPayment,
} from "@/server/demo";

describe("settlement workflow", () => {
  it("derives one week with correct dues from attendance", async () => {
    const p1 = await createPerson({ name: "تسوية أحمد", type: "CRAFTSMAN", currentDailyRate: 200 });
    const p2 = await createPerson({ name: "تسوية محمد", type: "WORKER", currentDailyRate: 150 });
    const pr = await createProject({ name: "تسوية مشروع", startDate: "2026-09-01", workingDays: ["SATURDAY"] });
    // 2026-09-01 + 32 days = week 5
    await recordAttendanceBatch({
      projectId: pr.id,
      date: "2026-10-03",
      createdBy: "u1",
      records: [
        { personId: p1.id, status: "PRESENT" },
        { personId: p2.id, status: "PRESENT" },
      ],
    });
    const weeks = await listWeeks(pr.id);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekNumber).toBe(5);
    expect(weeks[0].status).toBe("OPEN");
    expect(weeks[0].days).toBe(2);
    expect(weeks[0].halalas).toBe(35000);
    expect(weeks[0].paidHalalas).toBe(0);
    expect(weeks[0].dues).toHaveLength(2);
  });

  it("accepts partial payment and stays OPEN, then settles on full payment", async () => {
    const p1 = await createPerson({ name: "جزئي أحمد", type: "CRAFTSMAN", currentDailyRate: 200 });
    const p2 = await createPerson({ name: "جزئي محمد", type: "WORKER", currentDailyRate: 150 });
    const pr = await createProject({ name: "جزئي مشروع", startDate: "2026-09-01", workingDays: ["SATURDAY"] });
    await recordAttendanceBatch({
      projectId: pr.id,
      date: "2026-10-03",
      createdBy: "u1",
      records: [
        { personId: p1.id, status: "PRESENT" },
        { personId: p2.id, status: "PRESENT" },
      ],
    });
    const weekId = (await listWeeks(pr.id))[0].id;

    const partial = await recordWeekPayments(weekId, {
      payments: [{ personId: p1.id, amountHalalas: 20000 }],
      createdBy: "u1",
    });
    expect(partial.applied).toBe(1);
    expect(partial.week.status).toBe("OPEN");
    expect(partial.week.paidHalalas).toBe(20000);

    await expect(
      recordWeekPayments(weekId, { payments: [{ personId: p1.id, amountHalalas: 1 }], createdBy: "u1" }),
    ).rejects.toThrow("المتبقي");

    const full = await recordWeekPayments(weekId, {
      payments: [{ personId: p2.id, amountHalalas: 15000 }],
      createdBy: "u1",
    });
    expect(full.week.status).toBe("SETTLED");
    expect(full.week.paidHalalas).toBe(35000);
  });

  it("blocks attendance edits on settled weeks", async () => {
    const p1 = await createPerson({ name: "مغلق أحمد", type: "CRAFTSMAN", currentDailyRate: 200 });
    const pr = await createProject({ name: "مغلق مشروع", startDate: "2026-09-01", workingDays: ["SATURDAY"] });
    await recordAttendanceBatch({
      projectId: pr.id,
      date: "2026-10-03",
      createdBy: "u1",
      records: [{ personId: p1.id, status: "PRESENT" }],
    });
    const weekId = (await listWeeks(pr.id))[0].id;
    await recordWeekPayments(weekId, {
      payments: [{ personId: p1.id, amountHalalas: 20000 }],
      createdBy: "u1",
    });
    await expect(
      recordAttendanceBatch({
        projectId: pr.id,
        date: "2026-10-03",
        createdBy: "u1",
        records: [{ personId: p1.id, status: "LEAVE" }],
      }),
    ).rejects.toThrow("مسوّى");
  });

  it("voids a payment and reopens the week when a balance reappears", async () => {
    const p1 = await createPerson({ name: "إلغاء أحمد", type: "CRAFTSMAN", currentDailyRate: 200 });
    const pr = await createProject({ name: "إلغاء مشروع", startDate: "2026-09-01", workingDays: ["SUNDAY"] });
    await recordAttendanceBatch({
      projectId: pr.id,
      date: "2026-10-03",
      createdBy: "u1",
      records: [{ personId: p1.id, status: "PRESENT" }],
    });
    const weekId = (await listWeeks(pr.id))[0].id;
    const settled = await recordWeekPayments(weekId, {
      payments: [{ personId: p1.id, amountHalalas: 20000 }],
      createdBy: "u1",
    });
    expect(settled.week.status).toBe("SETTLED");
    const paymentId = settled.week.payments[0].id;
    const voided = await voidWeekPayment(weekId, paymentId, "u1");
    expect(voided.week.status).toBe("OPEN");
    expect(voided.week.paidHalalas).toBe(0);
    await expect(voidWeekPayment(weekId, paymentId, "u1")).rejects.toThrow("الدفعة غير موجودة");
  });
});
