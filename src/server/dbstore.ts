/*
 * Real-database store (PostgreSQL via Prisma).
 *
 * Same function shapes as src/server/demo.ts — routes import from
 * src/server/store.ts, which picks this module when USE_DEMO_DATA=false.
 *
 * Money: Prisma Decimal columns convert to plain numbers at the boundary
 * (`.toNumber()`); all arithmetic stays in integer halalas upstream.
 * Dates: @db.Date columns convert to "YYYY-MM-DD" strings at the boundary.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AttendanceConflict,
  AttendanceRow,
  DayCloseInfo,
  OpenAssignment,
  PersonRow,
  PersonType,
  ProjectRow,
  ProjectStatus,
  TeamMember,
  UserRow,
  WeekSummary,
  WorkerStatement,
} from "@/types";
import { weekBounds } from "./weekcalc";
import type { AttendanceInput, StoredUser } from "./demo";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function toPerson(p: {
  id: string;
  name: string;
  type: "CRAFTSMAN" | "WORKER";
  phone: string | null;
  active: boolean;
  currentDailyRate: Prisma.Decimal;
}): PersonRow {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    phone: p.phone,
    active: p.active,
    currentDailyRate: p.currentDailyRate.toNumber(),
  };
}

function toProject(p: {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  status: "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
  workingDays: string[];
}): ProjectRow {
  return {
    id: p.id,
    name: p.name,
    startDate: toDateStr(p.startDate),
    endDate: p.endDate ? toDateStr(p.endDate) : null,
    status: p.status,
    workingDays: [...p.workingDays],
  };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function findUserByLogin(login: string): Promise<StoredUser | null> {
  const key = login.trim();
  if (!key) return null;
  const u = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: key, mode: "insensitive" } },
        { email: { equals: key, mode: "insensitive" } },
      ],
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    passwordHash: u.passwordHash,
  };
}

export async function listUsers(): Promise<UserRow[]> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
  }));
}

/** No-op if the id does not exist (demo parity). */
export async function upgradePasswordHash(id: string, hash: string): Promise<void> {
  try {
    await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
  } catch {
    // missing row — nothing to upgrade
  }
}

export async function setUserActive(id: string, active: boolean): Promise<boolean> {
  try {
    await prisma.user.update({ where: { id }, data: { active } });
    return true;
  } catch {
    return false;
  }
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: "ADMIN"; active?: boolean; passwordHash?: string },
): Promise<UserRow | null> {
  try {
    const u = await prisma.user.update({
      where: { id },
      data: {
        name: patch.name !== undefined ? patch.name.trim() : undefined,
        role: patch.role,
        active: patch.active,
        passwordHash: patch.passwordHash,
      },
    });
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function createUser(args: {
  username: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "ADMIN";
}): Promise<UserRow> {
  try {
    const u = await prisma.user.create({
      data: {
        username: args.username.trim(),
        email: args.email.trim(),
        name: args.name.trim(),
        passwordHash: args.passwordHash,
        role: args.role,
        active: true,
      },
    });
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String((err.meta?.target as string[] | undefined)?.join(",") ?? "");
      if (target.includes("username")) throw new Error("اسم المستخدم مسجل بالفعل");
      if (target.includes("email")) throw new Error("البريد الإلكتروني مسجل بالفعل");
      throw new Error("بيانات مسجلة بالفعل");
    }
    throw err;
  }
}

// ─── People / projects ───────────────────────────────────────────────────────

export async function listPeople(activeOnly = false): Promise<PersonRow[]> {
  const rows = await prisma.person.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { name: "asc" },
  });
  return rows.map(toPerson);
}

export async function getPerson(id: string): Promise<PersonRow | null> {
  const p = await prisma.person.findUnique({ where: { id } });
  return p ? toPerson(p) : null;
}

export async function listProjects(): Promise<ProjectRow[]> {
  const rows = await prisma.project.findMany({ orderBy: { name: "asc" } });
  return rows.map(toProject);
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const p = await prisma.project.findUnique({ where: { id } });
  return p ? toProject(p) : null;
}

// ─── Attendance (source of truth) ────────────────────────────────────────────

/**
 * Deterministic project week containing `dateStr`, derived from the project
 * start date: weekNumber = floor(daysSinceStart / 7) + 1. The week row is
 * created on first use (find-or-create by the @@unique(projectId, weekNumber)).
 */
async function weekIdFor(
  projectId: string,
  projectStart: string,
  dateStr: string,
): Promise<{ id: string; status: "OPEN" | "CLOSED" | "SETTLED" }> {
  const bounds = weekBounds(projectStart, dateStr);
  const week = await prisma.week.upsert({
    where: { projectId_weekNumber: { projectId, weekNumber: bounds.weekNumber } },
    update: {},
    create: {
      projectId,
      weekNumber: bounds.weekNumber,
      startDate: toDate(bounds.start),
      endDate: toDate(bounds.end),
    },
    select: { id: true, status: true },
  });
  return week;
}

/** Find the assignment covering the date, or provision one at current rate. */
async function assignmentIdFor(
  personId: string,
  projectId: string,
  dateStr: string,
  currentRate: number,
): Promise<string> {
  const d = toDate(dateStr);
  const existing = await prisma.projectAssignment.findFirst({
    where: {
      personId,
      projectId,
      startDate: { lte: d },
      OR: [{ endDate: null }, { endDate: { gte: d } }],
    },
    orderBy: { startDate: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.projectAssignment.create({
    data: { personId, projectId, dailyRate: currentRate, startDate: d },
    select: { id: true },
  });
  return created.id;
}

export async function listAttendance(filter: {
  projectId?: string;
  personId?: string;
  from?: string;
  to?: string;
} = {}): Promise<AttendanceRow[]> {
  const rows = await prisma.dailyAttendance.findMany({
    where: {
      projectId: filter.projectId,
      personId: filter.personId,
      date: {
        gte: filter.from ? toDate(filter.from) : undefined,
        lte: filter.to ? toDate(filter.to) : undefined,
      },
    },
    include: {
      person: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });
  return rows.map((a) => ({
    id: a.id,
    personId: a.personId,
    personName: a.person.name,
    projectId: a.projectId,
    projectName: a.project.name,
    date: toDateStr(a.date),
    status: a.status,
    dailyRate: a.dailyRate.toNumber(),
    hours: a.hours.toNumber(),
    notes: a.notes,
  }));
}

export async function recordAttendanceBatch(args: {
  projectId: string;
  date: string;
  records: AttendanceInput[];
  createdBy: string;
}): Promise<{ recorded: number; updated: number; skipped: AttendanceConflict[] }> {
  const project = await prisma.project.findUnique({
    where: { id: args.projectId },
    select: { id: true, startDate: true },
  });
  if (!project) throw new Error("المشروع غير موجود");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("التاريخ غير صالح");
  const day = toDate(args.date);
  const closed = await prisma.attendanceDayClose.findUnique({
    where: { projectId_date: { projectId: args.projectId, date: day } },
    select: { id: true },
  });
  if (closed) throw new Error("اليوم مغلق — لا يمكن التسجيل أو التعديل");

  const week = await weekIdFor(args.projectId, toDateStr(project.startDate), args.date);
  if (week.status === "SETTLED") throw new Error("لا يمكن التسجيل — الأسبوع مسوّى");
  const weekId = week.id;
  let recorded = 0;
  let updated = 0;
  const skipped: AttendanceConflict[] = [];
  for (const r of args.records) {
    const person = await getPerson(r.personId);
    if (!person || !person.active) continue;
    if (r.status === "PRESENT") {
      const clash = await prisma.dailyAttendance.findFirst({
        where: { personId: r.personId, date: day, status: "PRESENT", projectId: { not: args.projectId } },
        include: { project: { select: { name: true } } },
      });
      if (clash) {
        skipped.push({
          personId: person.id,
          personName: person.name,
          date: args.date,
          existingProjectId: clash.projectId,
          existingProjectName: clash.project.name,
        });
        continue;
      }
    }
    const existing = await prisma.dailyAttendance.findUnique({
      where: {
        personId_projectId_date: { personId: r.personId, projectId: args.projectId, date: day },
      },
      select: { id: true },
    });
    const notes = r.notes?.trim() ? r.notes.trim() : null;
    if (existing) {
      await prisma.dailyAttendance.update({
        where: { id: existing.id },
        data: { status: r.status, notes },
      });
      updated += 1;
    } else {
      const assignmentId = await assignmentIdFor(
        person.id,
        args.projectId,
        args.date,
        person.currentDailyRate,
      );
      await prisma.dailyAttendance.create({
        data: {
          personId: person.id,
          projectId: args.projectId,
          assignmentId,
          weekId,
          date: day,
          status: r.status,
          dailyRate: person.currentDailyRate,
          hours: r.status === "PRESENT" ? 1 : 0,
          notes,
          createdBy: args.createdBy,
        },
      });
      recorded += 1;
    }
  }
  return { recorded, updated, skipped };
}

/** Person detail with per-project aggregation derived from attendance. */
export async function getPersonDetail(id: string) {
  const person = await getPerson(id);
  if (!person) return null;
  const rows = await prisma.dailyAttendance.findMany({
    where: { personId: id, status: "PRESENT" },
    include: { project: { select: { name: true } } },
  });
  const byProject = new Map<string, { name: string; days: number; halalas: number; rate: number }>();
  for (const a of rows) {
    const rate = a.dailyRate.toNumber();
    const e = byProject.get(a.projectId) ?? { name: a.project.name, days: 0, halalas: 0, rate };
    e.days += 1;
    e.halalas += Math.round(rate * 100) * a.hours.toNumber();
    e.rate = rate;
    byProject.set(a.projectId, e);
  }
  return {
    ...person,
    assignments: [...byProject.entries()].map(([projectId, v]) => ({
      id: `${id}-${projectId}`,
      projectId,
      projectName: v.name,
      dailyRate: v.rate,
      days: v.days,
      totalHalalas: v.halalas,
      period: "كل الفترات",
    })),
  };
}

type DayName =
  | "SATURDAY"
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY";

export async function createPerson(args: {
  name: string;
  type: PersonType;
  phone?: string | null;
  currentDailyRate: number;
  active?: boolean;
}): Promise<PersonRow> {
  const p = await prisma.person.create({
    data: {
      name: args.name.trim(),
      type: args.type,
      phone: args.phone?.trim() ? args.phone.trim() : null,
      active: args.active ?? true,
      currentDailyRate: args.currentDailyRate,
    },
  });
  return toPerson(p);
}

function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

export async function updatePerson(
  id: string,
  patch: {
    name?: string;
    type?: PersonType;
    phone?: string | null;
    currentDailyRate?: number;
    active?: boolean;
  },
): Promise<PersonRow | null> {
  try {
    const p = await prisma.person.update({
      where: { id },
      data: {
        name: patch.name !== undefined ? patch.name.trim() : undefined,
        type: patch.type,
        phone: patch.phone !== undefined ? (patch.phone?.trim() ? patch.phone.trim() : null) : undefined,
        currentDailyRate: patch.currentDailyRate,
        active: patch.active,
      },
    });
    return toPerson(p);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function createProject(args: {
  name: string;
  startDate: string;
  endDate?: string | null;
  status?: ProjectStatus;
  workingDays: string[];
}): Promise<ProjectRow> {
  const p = await prisma.project.create({
    data: {
      name: args.name.trim(),
      startDate: toDate(args.startDate),
      endDate: args.endDate?.trim() ? toDate(args.endDate.trim()) : null,
      status: args.status ?? "ACTIVE",
      workingDays: args.workingDays as DayName[],
    },
  });
  return toProject(p);
}

export async function updateProject(
  id: string,
  patch: {
    name?: string;
    startDate?: string;
    endDate?: string | null;
    status?: ProjectStatus;
    workingDays?: string[];
  },
): Promise<ProjectRow | null> {
  try {
    const p = await prisma.project.update({
      where: { id },
      data: {
        name: patch.name !== undefined ? patch.name.trim() : undefined,
        startDate: patch.startDate !== undefined ? toDate(patch.startDate) : undefined,
        endDate:
          patch.endDate !== undefined ? (patch.endDate?.trim() ? toDate(patch.endDate.trim()) : null) : undefined,
        status: patch.status,
        workingDays: (patch.workingDays as DayName[] | undefined),
      },
    });
    return toProject(p);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function toWeekSummary(
  projectName: string,
  week: {
    id: string;
    projectId: string;
    weekNumber: number;
    startDate: Date;
    endDate: Date;
    status: "OPEN" | "CLOSED" | "SETTLED";
    attendances: { personId: string; person: { name: string; type: "CRAFTSMAN" | "WORKER" }; dailyRate: unknown; hours: unknown }[];
    payments: { id: string; personId: string; person: { name: string }; amount: unknown; paidAt: Date; notes: string | null }[];
  },
): WeekSummary {
  const byPerson = new Map<string, { name: string; type: "CRAFTSMAN" | "WORKER"; days: number; due: number }>();
  for (const a of week.attendances) {
    const rate = (a.dailyRate as { toNumber: () => number }).toNumber();
    const hours = (a.hours as { toNumber: () => number }).toNumber();
    const e = byPerson.get(a.personId) ?? { name: a.person.name, type: a.person.type, days: 0, due: 0 };
    e.days += 1;
    e.due += Math.round(rate * 100) * hours;
    byPerson.set(a.personId, e);
  }
  const paidByPerson = new Map<string, number>();
  const payments = week.payments.map((p) => {
    const amount = (p.amount as { toNumber: () => number }).toNumber();
    paidByPerson.set(p.personId, (paidByPerson.get(p.personId) ?? 0) + amount);
    return {
      id: p.id,
      personId: p.personId,
      personName: p.person.name,
      amountHalalas: amount,
      paidAt: p.paidAt.toISOString(),
      notes: p.notes,
    };
  });
  const dues = [...byPerson.entries()].map(([personId, v]) => ({
    personId,
    personName: v.name,
    type: v.type,
    days: v.days,
    dueHalalas: v.due,
    paidHalalas: paidByPerson.get(personId) ?? 0,
  }));
  return {
    id: week.id,
    projectId: week.projectId,
    projectName,
    weekNumber: week.weekNumber,
    startDate: toDateStr(week.startDate),
    endDate: toDateStr(week.endDate),
    status: week.status,
    days: week.attendances.length,
    halalas: dues.reduce((s, d) => s + d.dueHalalas, 0),
    paidHalalas: dues.reduce((s, d) => s + d.paidHalalas, 0),
    dues,
    payments,
  };
}

export async function listWeeks(projectId: string): Promise<WeekSummary[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new Error("المشروع غير موجود");
  const weeks = await prisma.week.findMany({
    where: { projectId },
    orderBy: { weekNumber: "asc" },
    include: {
      attendances: {
        where: { status: "PRESENT" },
        include: { person: { select: { name: true, type: true } } },
      },
      payments: { include: { person: { select: { name: true } } } },
    },
  });
  // Weeks without present attendance carry no dues — same as the demo store.
  return weeks.filter((w) => w.attendances.length > 0).map((w) => toWeekSummary(project.name, w));
}

export async function recordWeekPayments(
  weekId: string,
  args: {
    payments: { personId: string; amountHalalas: number }[];
    notes?: string;
    createdBy: string;
  },
): Promise<{ week: WeekSummary; applied: number }> {
  const week = await prisma.week.findUnique({
    where: { id: weekId },
    include: {
      project: { select: { name: true } },
      attendances: {
        where: { status: "PRESENT" },
        include: { person: { select: { name: true, type: true } } },
      },
      payments: { include: { person: { select: { name: true } } } },
    },
  });
  if (!week) throw new Error("الأسبوع غير موجود");
  if (week.status !== "OPEN") throw new Error("الأسبوع مسوّى بالفعل");
  if (args.payments.length === 0) throw new Error("لا توجد مدفوعات");

  const summary = toWeekSummary(
    week.project.name,
    week as Parameters<typeof toWeekSummary>[1],
  );
  for (const p of args.payments) {
    if (!Number.isInteger(p.amountHalalas) || p.amountHalalas <= 0) {
      throw new Error("مبلغ الدفعة غير صالح");
    }
    const due = summary.dues.find((d) => d.personId === p.personId);
    if (!due) throw new Error("لا مستحقات لهذا الشخص في الأسبوع");
    if (p.amountHalalas > due.dueHalalas - due.paidHalalas) {
      throw new Error(`المبلغ يتجاوز المتبقي لـ ${due.personName}`);
    }
  }

  const notes = args.notes?.trim() ? args.notes.trim() : null;
  const fullyPaid = summary.dues.every((d) => {
    const extra = args.payments.find((p) => p.personId === d.personId)?.amountHalalas ?? 0;
    return d.paidHalalas + extra >= d.dueHalalas;
  });

  await prisma.$transaction([
    ...args.payments.map((p) =>
      prisma.payment.create({
        data: {
          personId: p.personId,
          projectId: week.projectId,
          weekId,
          amount: p.amountHalalas,
          notes,
          createdBy: args.createdBy,
        },
      }),
    ),
    ...(fullyPaid
      ? [prisma.week.update({ where: { id: weekId }, data: { status: "SETTLED" } })]
      : []),
    prisma.auditLog.create({
      data: {
        entityType: "Week",
        entityId: weekId,
        action: "SETTLE",
        newValues: { payments: args.payments, createdBy: args.createdBy },
        performedBy: args.createdBy,
      },
    }),
  ]);

  const fresh = await prisma.week.findUnique({
    where: { id: weekId },
    include: {
      attendances: {
        where: { status: "PRESENT" },
        include: { person: { select: { name: true, type: true } } },
      },
      payments: { include: { person: { select: { name: true } } } },
    },
  });
  if (!fresh) throw new Error("الأسبوع غير موجود");
  return {
    week: toWeekSummary(week.project.name, fresh as Parameters<typeof toWeekSummary>[1]),
    applied: args.payments.length,
  };
}

/**
 * Void a payment (ADMIN-only correction path). Reopens the week when a
 * balance reappears; writes an audit entry either way.
 */
export async function voidWeekPayment(
  weekId: string,
  paymentId: string,
  performedBy: string,
): Promise<{ week: WeekSummary }> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, weekId: true },
  });
  if (!payment || payment.weekId !== weekId) throw new Error("الدفعة غير موجودة");
  const week = await prisma.week.findUnique({
    where: { id: weekId },
    select: { id: true, project: { select: { name: true } } },
  });
  if (!week) throw new Error("الأسبوع غير موجود");

  await prisma.$transaction([
    prisma.payment.delete({ where: { id: paymentId } }),
    prisma.auditLog.create({
      data: {
        entityType: "Week",
        entityId: weekId,
        action: "VOID",
        newValues: { paymentId, performedBy },
        performedBy,
      },
    }),
  ]);

  const fresh = await prisma.week.findUnique({
    where: { id: weekId },
    include: {
      attendances: {
        where: { status: "PRESENT" },
        include: { person: { select: { name: true, type: true } } },
      },
      payments: { include: { person: { select: { name: true } } } },
    },
  });
  if (!fresh) throw new Error("الأسبوع غير موجود");
  const summary = toWeekSummary(week.project.name, fresh as Parameters<typeof toWeekSummary>[1]);
  const status = summary.dues.every((d) => d.paidHalalas >= d.dueHalalas) ? "SETTLED" : "OPEN";
  if (status !== fresh.status) {
    await prisma.week.update({ where: { id: weekId }, data: { status } });
    summary.status = status;
  }
  return { week: summary };
}

export async function assignPersonToProject(
  projectId: string,
  personId: string,
): Promise<{ personId: string; projectId: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, startDate: true },
  });
  if (!project) throw new Error("المشروع غير موجود");
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, currentDailyRate: true },
  });
  if (!person) throw new Error("الشخص غير موجود");
  const latest = await prisma.projectAssignment.findFirst({
    where: { personId, projectId },
    orderBy: { startDate: "desc" },
  });
  if (latest && latest.endDate === null) return { personId, projectId };
  const today = toDateStr(new Date());
  const projectStart = toDateStr(project.startDate);
  const startDate = today > projectStart ? today : projectStart;
  const clash = await prisma.projectAssignment.findFirst({
    where: { personId, projectId, startDate: toDate(startDate) },
  });
  if (clash) {
    await prisma.projectAssignment.update({ where: { id: clash.id }, data: { endDate: null } });
    return { personId, projectId };
  }
  try {
    await prisma.projectAssignment.create({
      data: {
        personId,
        projectId,
        dailyRate: person.currentDailyRate.toNumber(),
        startDate: toDate(startDate),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { personId, projectId }; // raced duplicate — treat as assigned
    }
    throw err;
  }
  return { personId, projectId };
}

export async function unassignPersonFromProject(
  projectId: string,
  personId: string,
): Promise<{ personId: string; projectId: string }> {
  await prisma.projectAssignment.updateMany({
    where: { personId, projectId, endDate: null },
    data: { endDate: toDate(toDateStr(new Date())) },
  });
  return { personId, projectId };
}

/** Every open assignment with denormalized names (quick-mark feed). */
export async function listOpenAssignments(): Promise<OpenAssignment[]> {
  const rows = await prisma.projectAssignment.findMany({
    where: { endDate: null },
    include: {
      person: { select: { id: true, name: true, active: true } },
      project: { select: { id: true, name: true, status: true, workingDays: true } },
    },
    orderBy: { person: { name: "asc" } },
  });
  return rows.map((a) => ({
    personId: a.person.id,
    personName: a.person.name,
    personActive: a.person.active,
    projectId: a.project.id,
    projectName: a.project.name,
    projectStatus: a.project.status,
    workingDays: [...a.project.workingDays],
  }));
}

export async function getProjectTeam(projectId: string): Promise<TeamMember[]> {
  const rows = await prisma.projectAssignment.findMany({
    where: { projectId, endDate: null },
    include: { person: { select: { id: true, name: true, type: true, active: true } } },
    orderBy: { person: { name: "asc" } },
  });
  return rows.map((a) => ({
    personId: a.person.id,
    name: a.person.name,
    type: a.person.type,
    active: a.person.active,
  }));
}

/**
 * Hard-delete a person only when nothing references them.
 * Blocked (restrict) by attendance, payments, or any open assignment.
 * Ended assignments without other history are removed with the person.
 */
export async function deletePerson(id: string): Promise<true> {
  const [attendance, payments, openAssignments, person] = await Promise.all([
    prisma.dailyAttendance.count({ where: { personId: id } }),
    prisma.payment.count({ where: { personId: id } }),
    prisma.projectAssignment.count({ where: { personId: id, endDate: null } }),
    prisma.person.findUnique({ where: { id }, select: { id: true } }),
  ]);
  if (!person) throw new Error("الشخص غير موجود");
  if (attendance + payments + openAssignments > 0) {
    throw new Error("لا يمكن حذف هذا الشخص — توجد سجلات مرتبطة به. عطّله بدلاً من ذلك.");
  }
  await prisma.$transaction([
    prisma.projectAssignment.deleteMany({ where: { personId: id } }),
    prisma.person.delete({ where: { id } }),
  ]);
  return true;
}

/**
 * Hard-delete a project. Without `force`, blocked (restrict) by attendance,
 * payments, or a closed day. `force` (ADMIN-only, enforced at the API) wipes
 * the project's payment and attendance rows first — permanent. FK order:
 * payment → attendance → dayClose → assignment → week → project.
 */
export async function deleteProject(id: string, opts: { force?: boolean } = {}): Promise<true> {
  const [attendance, payments, closes, project] = await Promise.all([
    prisma.dailyAttendance.count({ where: { projectId: id } }),
    prisma.payment.count({ where: { projectId: id } }),
    prisma.attendanceDayClose.count({ where: { projectId: id } }),
    prisma.project.findUnique({ where: { id }, select: { id: true } }),
  ]);
  if (!project) throw new Error("المشروع غير موجود");
  if (attendance + payments + closes > 0 && !opts.force) {
    throw new Error("لا يمكن حذف هذا المشروع — توجد سجلات حضور أو مدفوعات مرتبطة به. ألغِه بدلاً من ذلك.");
  }
  await prisma.$transaction([
    prisma.payment.deleteMany({ where: { projectId: id } }),
    prisma.dailyAttendance.deleteMany({ where: { projectId: id } }),
    prisma.attendanceDayClose.deleteMany({ where: { projectId: id } }),
    prisma.projectAssignment.deleteMany({ where: { projectId: id } }),
    prisma.week.deleteMany({ where: { projectId: id } }),
    prisma.project.delete({ where: { id } }),
  ]);
  return true;
}

// ─── Attendance day close ────────────────────────────────────────────────────

const JS_DAY_TO_NAME = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export async function getDayClose(projectId: string, date: string): Promise<DayCloseInfo | null> {
  const c = await prisma.attendanceDayClose.findUnique({
    where: { projectId_date: { projectId, date: toDate(date) } },
  });
  if (!c) return null;
  return { projectId, date, closedBy: c.closedBy, closedAt: c.closedAt.toISOString() };
}

export async function isAttendanceDayClosed(projectId: string, date: string): Promise<boolean> {
  const c = await prisma.attendanceDayClose.findUnique({
    where: { projectId_date: { projectId, date: toDate(date) } },
    select: { id: true },
  });
  return c !== null;
}

export async function closeAttendanceDay(
  projectId: string,
  date: string,
  closedBy: string,
): Promise<{ closed: true }> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("المشروع غير موجود");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("التاريخ غير صالح");
  const dayName = JS_DAY_TO_NAME[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
  if (!project.workingDays.includes(dayName as (typeof project.workingDays)[number])) {
    throw new Error("لا يمكن الإغلاق — هذا اليوم ليس من أيام عمل المشروع");
  }
  const day = toDate(date);
  const already = await prisma.attendanceDayClose.findUnique({
    where: { projectId_date: { projectId, date: day } },
    select: { id: true },
  });
  if (already) throw new Error("اليوم مغلق بالفعل");
  const bounds = weekBounds(toDateStr(project.startDate), date);
  const week = await prisma.week.findUnique({
    where: { projectId_weekNumber: { projectId, weekNumber: bounds.weekNumber } },
    select: { status: true },
  });
  if (week?.status === "SETTLED") throw new Error("لا يمكن الإغلاق — الأسبوع مسوّى");

  await prisma.attendanceDayClose.create({ data: { projectId, date: day, closedBy } });
  return { closed: true };
}

export async function reopenAttendanceDay(
  projectId: string,
  date: string,
): Promise<{ reopened: true }> {
  const existing = await prisma.attendanceDayClose.findUnique({
    where: { projectId_date: { projectId, date: toDate(date) } },
    select: { id: true },
  });
  if (!existing) throw new Error("اليوم غير مغلق");
  await prisma.attendanceDayClose.delete({ where: { id: existing.id } });
  return { reopened: true };
}

export async function moveAttendance(args: {
  personId: string;
  date: string;
  toProjectId: string;
}): Promise<{ moved: AttendanceRow }> {
  const person = await getPerson(args.personId);
  if (!person) throw new Error("الشخص غير موجود");
  const toProject = await prisma.project.findUnique({ where: { id: args.toProjectId } });
  if (!toProject) throw new Error("المشروع غير موجود");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("التاريخ غير صالح");
  const day = toDate(args.date);
  const source = await prisma.dailyAttendance.findFirst({
    where: { personId: args.personId, date: day, status: "PRESENT", projectId: { not: args.toProjectId } },
  });
  if (!source) throw new Error("لا يوجد حضور حاضر لنقله في هذا اليوم");
  const srcClosed = await prisma.attendanceDayClose.findUnique({
    where: { projectId_date: { projectId: source.projectId, date: day } },
    select: { id: true },
  });
  if (srcClosed) throw new Error("لا يمكن النقل — اليوم مغلق في المشروع الأصلي");
  const dstClosed = await prisma.attendanceDayClose.findUnique({
    where: { projectId_date: { projectId: args.toProjectId, date: day } },
    select: { id: true },
  });
  if (dstClosed) throw new Error("لا يمكن النقل — اليوم مغلق في المشروع الجديد");
  const srcProject = await prisma.project.findUnique({
    where: { id: source.projectId },
    select: { startDate: true },
  });
  const srcBounds = weekBounds(toDateStr(srcProject?.startDate ?? day), args.date);
  const srcWeek = await prisma.week.findUnique({
    where: { projectId_weekNumber: { projectId: source.projectId, weekNumber: srcBounds.weekNumber } },
    select: { status: true },
  });
  if (srcWeek?.status === "SETTLED") throw new Error("لا يمكن النقل — الأسبوع مسوّى في المشروع الأصلي");
  const dstBounds = weekBounds(toDateStr(toProject.startDate), args.date);
  const dstWeek = await prisma.week.findUnique({
    where: { projectId_weekNumber: { projectId: args.toProjectId, weekNumber: dstBounds.weekNumber } },
    select: { status: true },
  });
  if (dstWeek?.status === "SETTLED") throw new Error("لا يمكن النقل — الأسبوع مسوّى في المشروع الجديد");
  const clash = await prisma.dailyAttendance.findFirst({
    where: { personId: args.personId, date: day, status: "PRESENT", projectId: args.toProjectId },
    select: { id: true },
  });
  if (clash) throw new Error("يوجد حضور مسجل بالفعل في المشروع الجديد");
  const assignmentId = await assignmentIdFor(person.id, args.toProjectId, args.date, person.currentDailyRate);
  const dstWeekId = (
    await prisma.week.upsert({
      where: { projectId_weekNumber: { projectId: args.toProjectId, weekNumber: dstBounds.weekNumber } },
      update: {},
      create: {
        projectId: args.toProjectId,
        weekNumber: dstBounds.weekNumber,
        startDate: toDate(dstBounds.start),
        endDate: toDate(dstBounds.end),
      },
      select: { id: true },
    })
  ).id;

  const moved = await prisma.$transaction(async (tx) => {
    await tx.dailyAttendance.delete({ where: { id: source.id } });
    return tx.dailyAttendance.create({
      data: {
        personId: person.id,
        projectId: args.toProjectId,
        assignmentId,
        weekId: dstWeekId,
        date: day,
        status: "PRESENT",
        dailyRate: source.dailyRate.toNumber(),
        hours: source.hours.toNumber(),
        notes: source.notes,
        createdBy: source.createdBy,
      },
    });
  });
  return {
    moved: {
      id: moved.id,
      personId: moved.personId,
      personName: person.name,
      projectId: moved.projectId,
      projectName: toProject.name,
      date: args.date,
      status: moved.status,
      dailyRate: moved.dailyRate.toNumber(),
      hours: moved.hours.toNumber(),
      notes: moved.notes,
    },
  };
}

export async function quickMark(
  personId: string,
  date: string,
  status: "PRESENT",
  createdBy: string,
): Promise<{
  success: true;
  projects: { projectId: string; projectName: string }[];
  skipped: AttendanceConflict[];
}> {
  const person = await getPerson(personId);
  if (!person) throw new Error("الشخص غير موجود");
  if (!person.active) throw new Error("الشخص غير نشط");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("التاريخ غير صالح");
  const day = toDate(date);
  const dayName = JS_DAY_TO_NAME[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
  const rows = await prisma.projectAssignment.findMany({
    where: { personId, endDate: null, startDate: { lte: day } },
    include: { project: true },
  });
  const eligible = rows.filter(
    (a) => a.project.status === "ACTIVE" && (a.project.workingDays as string[]).includes(dayName),
  );
  const existing = await prisma.dailyAttendance.findFirst({
    where: { personId, date: day, status: "PRESENT" },
    include: { project: { select: { name: true } } },
  });
  if (existing) {
    return {
      success: true,
      projects: [],
      skipped: [
        {
          personId,
          personName: person.name,
          date,
          existingProjectId: existing.projectId,
          existingProjectName: existing.project.name,
        },
      ],
    };
  }
  const ops = [];
  const projects: { projectId: string; projectName: string }[] = [];
  for (const a of eligible) {
    const bounds = weekBounds(toDateStr(a.project.startDate), date);
    const weekId = (
      await prisma.week.upsert({
        where: { projectId_weekNumber: { projectId: a.projectId, weekNumber: bounds.weekNumber } },
        update: {},
        create: {
          projectId: a.projectId,
          weekNumber: bounds.weekNumber,
          startDate: toDate(bounds.start),
          endDate: toDate(bounds.end),
        },
        select: { id: true },
      })
    ).id;
    ops.push(
      prisma.dailyAttendance.upsert({
        where: { personId_projectId_date: { personId, projectId: a.projectId, date: day } },
        update: { status: "PRESENT", dailyRate: person.currentDailyRate, hours: 1 },
        create: {
          personId,
          projectId: a.projectId,
          assignmentId: a.id,
          weekId,
          date: day,
          status: "PRESENT",
          dailyRate: person.currentDailyRate,
          hours: 1,
          notes: null,
          createdBy,
        },
      }),
    );
    projects.push({ projectId: a.projectId, projectName: a.project.name });
  }
  await prisma.$transaction(ops);
  return { success: true, projects, skipped: [] };
}

export async function getWorkerStatement(personId: string): Promise<WorkerStatement> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, name: true },
  });
  if (!person) throw new Error("الشخص غير موجود");
  const weeks = await prisma.week.findMany({
    include: {
      project: { select: { id: true, name: true } },
      attendances: {
        where: { status: "PRESENT", personId },
        include: { person: { select: { name: true } } },
      },
      payments: { where: { personId }, include: { person: { select: { name: true } } } },
    },
  });
  const dues: WorkerStatement["dues"] = [];
  for (const w of weeks) {
    const due = w.attendances.reduce(
      (s, a) => s + Math.round(a.dailyRate.toNumber() * 100) * a.hours.toNumber(),
      0,
    );
    if (due <= 0) continue;
    const paid = w.payments.reduce((s, p) => s + (p.amount as { toNumber: () => number }).toNumber(), 0);
    dues.push({
      projectId: w.project.id,
      projectName: w.project.name,
      weekId: w.id,
      weekNumber: w.weekNumber,
      weekStartDate: toDateStr(w.startDate),
      dueHalalas: due,
      paidHalalas: paid,
    });
  }
  dues.sort((a, b) =>
    a.weekStartDate < b.weekStartDate ? -1 : a.weekStartDate > b.weekStartDate ? 1 : a.projectId < b.projectId ? -1 : 1,
  );
  const payments = (
    await prisma.payment.findMany({
      where: { personId },
      include: { project: { select: { name: true } }, week: { select: { weekNumber: true } } },
      orderBy: { paidAt: "desc" },
    })
  ).map((p) => ({
    id: p.id,
    personId,
    personName: person.name,
    projectName: p.project.name,
    weekNumber: p.week.weekNumber,
    amountHalalas: (p.amount as { toNumber: () => number }).toNumber(),
    paidAt: p.paidAt.toISOString(),
    notes: p.notes,
  }));
  const totalDue = dues.reduce((s, d) => s + d.dueHalalas, 0);
  const totalPaid = dues.reduce((s, d) => s + d.paidHalalas, 0);
  return { personId, personName: person.name, dues, payments, totalDue, totalPaid, totalRemaining: totalDue - totalPaid };
}

export async function payWorker(
  personId: string,
  amountHalalas: number,
  notes: string | undefined,
  createdBy: string,
): Promise<{
  statement: WorkerStatement;
  applied: number;
  allocations: { weekId: string; projectName: string; amountHalalas: number }[];
}> {
  if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) throw new Error("مبلغ الدفعة غير صالح");
  const statement = await getWorkerStatement(personId);
  if (amountHalalas > statement.totalRemaining) throw new Error("المبلغ يتجاوز إجمالي المتبقي");
  const open = statement.dues.filter((d) => d.dueHalalas - d.paidHalalas > 0);
  const cleanNotes = notes?.trim() ? notes.trim() : null;
  let left = amountHalalas;
  const allocations: { weekId: string; projectName: string; amountHalalas: number }[] = [];
  const ops = [];
  const touched = new Set<string>();
  for (const due of open) {
    if (left <= 0) break;
    const take = Math.min(left, due.dueHalalas - due.paidHalalas);
    ops.push(
      prisma.payment.create({
        data: {
          personId,
          projectId: due.projectId,
          weekId: due.weekId,
          amount: take,
          notes: cleanNotes,
          createdBy,
        },
      }),
    );
    allocations.push({ weekId: due.weekId, projectName: due.projectName, amountHalalas: take });
    touched.add(due.weekId);
    left -= take;
  }
  ops.push(
    prisma.auditLog.create({
      data: {
        entityType: "Person",
        entityId: personId,
        action: "PAY",
        newValues: { amountHalalas, allocations, createdBy },
        performedBy: createdBy,
      },
    }),
  );
  await prisma.$transaction(ops);
  for (const weekId of touched) {
    const w = await prisma.week.findUnique({
      where: { id: weekId },
      include: {
        attendances: { where: { status: "PRESENT" } },
        payments: true,
      },
    });
    if (!w) continue;
    const due = w.attendances.reduce(
      (s, a) => s + Math.round(a.dailyRate.toNumber() * 100) * a.hours.toNumber(),
      0,
    );
    const paid = w.payments.reduce((s, p) => s + (p.amount as { toNumber: () => number }).toNumber(), 0);
    if (w.status === "OPEN" && paid >= due && due > 0) {
      await prisma.week.update({ where: { id: weekId }, data: { status: "SETTLED" } });
    }
  }
  return { statement: await getWorkerStatement(personId), applied: allocations.length, allocations };
}

export function isDemoMode(): boolean {
  return process.env.USE_DEMO_DATA !== "false";
}
