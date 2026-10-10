/*
 * Demo data store (in-memory).
 *
 * Used when USE_DEMO_DATA is not "false" (default). Lets the full app —
 * login, attendance, reports — run end-to-end without a database.
 *
 * When a real PostgreSQL DATABASE_URL is provided, set USE_DEMO_DATA=false
 * and replace these functions with Prisma queries (same return shapes).
 */
import type {
  AttendanceConflict,
  AttendanceRow,
  DayCloseInfo,
  OpenAssignment,
  PersonRow,
  PersonType,
  ProjectRow,
  ProjectStatus,
  Role,
  TeamMember,
  UserRow,
  WeekStatus,
  WeekSummary,
  WorkerStatement,
} from "@/types";
import { weekBounds, weekNumberFor } from "./weekcalc";

export interface StoredUser extends UserRow {
  passwordHash: string;
}

interface StoredAttendance extends AttendanceRow {
  createdBy: string;
}

function omit<T extends object, K extends keyof T>(row: T, ...keys: K[]): Omit<T, K> {
  const out = { ...row } as Record<string, unknown>;
  for (const k of keys) delete out[k as string];
  return out as Omit<T, K>;
}

// ─── Seed people (construction workforce demo) ───────────────────────────────

const people: PersonRow[] = [
  { id: "p1", name: "أحمد حسن", type: "CRAFTSMAN", phone: "0551234567", active: true, currentDailyRate: 200 },
  { id: "p2", name: "محمد علي", type: "WORKER", phone: "0562345678", active: true, currentDailyRate: 150 },
  { id: "p3", name: "كريم صلاح", type: "CRAFTSMAN", phone: null, active: true, currentDailyRate: 200 },
  { id: "p4", name: "أحمد محمد", type: "WORKER", phone: "0573456789", active: true, currentDailyRate: 150 },
];

const projects: ProjectRow[] = [
  {
    id: "pr1",
    name: "مشروع كمبوند الأوركيد",
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    status: "ACTIVE",
    workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
  },
  {
    id: "pr2",
    name: "مشروع فيلا النخيل",
    startDate: "2026-08-15",
    endDate: "2026-11-15",
    status: "ACTIVE",
    workingDays: ["SATURDAY", "SUNDAY", "MONDAY"],
  },
  {
    id: "pr3",
    name: "مشروع مبنى سنترو",
    startDate: "2026-07-01",
    endDate: "2026-10-01",
    status: "COMPLETED",
    workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY"],
  },
];

// ─── Users (seeded from env only — never hardcoded) ──────────────────────────

let usersCache: StoredUser[] | null = null;

function loadUsersFromEnv(): StoredUser[] {
  if (usersCache) return usersCache;
  usersCache = [];
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (email && password) {
    // NOTE: plain password kept only in memory until hashed on first login seed.
    // Real hashing happens in seed.ts for production DB; here we hash lazily.
    usersCache.push({
      id: "u-admin",
      username: email.split("@")[0] ?? "admin",
      email,
      name: "مدير النظام",
      role: "ADMIN",
      active: true,
      passwordHash: `plain:${password}`,
    });
  }
  return usersCache;
}

export async function findUserByLogin(login: string): Promise<StoredUser | null> {
  const key = login.trim().toLowerCase();
  const users = loadUsersFromEnv();
  return (
    users.find(
      (u) => u.username.toLowerCase() === key || u.email.toLowerCase() === key,
    ) ?? null
  );
}

export async function listUsers(): Promise<UserRow[]> {
  return loadUsersFromEnv().map((u) => omit(u, "passwordHash"));
}

/** Replace a lazily-seeded plain password with its scrypt hash after first verify. */
export async function upgradePasswordHash(id: string, hash: string): Promise<void> {
  const users = loadUsersFromEnv();
  const u = users.find((x) => x.id === id);
  if (u) u.passwordHash = hash;
}

export async function setUserActive(id: string, active: boolean): Promise<boolean> {
  const users = loadUsersFromEnv();
  const u = users.find((x) => x.id === id);
  if (!u) return false;
  u.active = active;
  return true;
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: Role; active?: boolean; passwordHash?: string },
): Promise<UserRow | null> {
  const users = loadUsersFromEnv();
  const u = users.find((x) => x.id === id);
  if (!u) return null;
  if (patch.name !== undefined) u.name = patch.name.trim();
  if (patch.role !== undefined) u.role = patch.role;
  if (patch.active !== undefined) u.active = patch.active;
  if (patch.passwordHash !== undefined) u.passwordHash = patch.passwordHash;
  return omit(u, "passwordHash");
}

export async function createUser(args: {
  username: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
}): Promise<UserRow> {
  const users = loadUsersFromEnv();
  const key = (s: string) => s.trim().toLowerCase();
  if (users.some((u) => u.username.toLowerCase() === key(args.username))) {
    throw new Error("اسم المستخدم مسجل بالفعل");
  }
  if (users.some((u) => u.email.toLowerCase() === key(args.email))) {
    throw new Error("البريد الإلكتروني مسجل بالفعل");
  }
  const user: StoredUser = {
    id: `u${Date.now()}`,
    username: args.username.trim(),
    email: args.email.trim(),
    name: args.name.trim(),
    role: args.role,
    active: true,
    passwordHash: args.passwordHash,
  };
  users.push(user);
  return omit(user, "passwordHash");
}

// ─── People / projects ───────────────────────────────────────────────────────

export async function listPeople(activeOnly = false): Promise<PersonRow[]> {
  return activeOnly ? people.filter((p) => p.active) : [...people];
}

export async function getPerson(id: string) {
  return people.find((p) => p.id === id) ?? null;
}

export async function listProjects(): Promise<ProjectRow[]> {
  return [...projects];
}

export async function getProject(id: string) {
  return projects.find((p) => p.id === id) ?? null;
}

let personSeq = 100;
let projectSeq = 100;

export async function createPerson(args: {
  name: string;
  type: PersonType;
  phone?: string | null;
  currentDailyRate: number;
  active?: boolean;
}): Promise<PersonRow> {
  const person: PersonRow = {
    id: `p${personSeq++}`,
    name: args.name.trim(),
    type: args.type,
    phone: args.phone?.trim() ? args.phone.trim() : null,
    active: args.active ?? true,
    currentDailyRate: args.currentDailyRate,
  };
  people.push(person);
  return { ...person };
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
  const p = people.find((x) => x.id === id);
  if (!p) return null;
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.type !== undefined) p.type = patch.type;
  if (patch.phone !== undefined) p.phone = patch.phone?.trim() ? patch.phone.trim() : null;
  if (patch.currentDailyRate !== undefined) p.currentDailyRate = patch.currentDailyRate;
  if (patch.active !== undefined) p.active = patch.active;
  return { ...p };
}

/**
 * Hard-delete a person only when nothing references them.
 * Blocked (restrict) by attendance, payments, or any open assignment —
 * deactivate via `active` instead. Ended assignments without any other
 * history are removed together with the person.
 */
export async function deletePerson(id: string): Promise<true> {
  const index = people.findIndex((x) => x.id === id);
  if (index < 0) throw new Error("الشخص غير موجود");
  const blocked =
    attendances.some((a) => a.personId === id) ||
    demoPayments.some((p) => p.personId === id) ||
    demoAssignments.some((a) => a.personId === id && a.endDate === null);
  if (blocked) {
    throw new Error("لا يمكن حذف هذا الشخص — توجد سجلات مرتبطة به. عطّله بدلاً من ذلك.");
  }
  for (let i = demoAssignments.length - 1; i >= 0; i--) {
    if (demoAssignments[i].personId === id) demoAssignments.splice(i, 1);
  }
  people.splice(index, 1);
  return true;
}

export async function createProject(args: {
  name: string;
  startDate: string;
  endDate?: string | null;
  status?: ProjectStatus;
  workingDays: string[];
}): Promise<ProjectRow> {
  const project: ProjectRow = {
    id: `pr${projectSeq++}`,
    name: args.name.trim(),
    startDate: args.startDate,
    endDate: args.endDate?.trim() ? args.endDate.trim() : null,
    status: args.status ?? "ACTIVE",
    workingDays: [...args.workingDays],
  };
  projects.push(project);
  return { ...project };
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
  const p = projects.find((x) => x.id === id);
  if (!p) return null;
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.startDate !== undefined) p.startDate = patch.startDate;
  if (patch.endDate !== undefined) p.endDate = patch.endDate?.trim() ? patch.endDate.trim() : null;
  if (patch.status !== undefined) p.status = patch.status;
  if (patch.workingDays !== undefined) p.workingDays = [...patch.workingDays];
  return { ...p };
}

/**
 * Hard-delete a project. Without `force`, blocked (restrict) by attendance,
 * payments, or a closed day. `force` (ADMIN-only, enforced at the API) wipes
 * the project's attendance and payment rows together with it — permanent.
 * Assignments, week-status entries and close records are always removed.
 */
export async function deleteProject(id: string, opts: { force?: boolean } = {}): Promise<true> {
  const index = projects.findIndex((x) => x.id === id);
  if (index < 0) throw new Error("المشروع غير موجود");
  const blocked =
    attendances.some((a) => a.projectId === id) ||
    demoPayments.some((p) => p.projectId === id) ||
    [...demoCloses.keys()].some((k) => k.startsWith(`${id}:`));
  if (blocked && !opts.force) {
    throw new Error("لا يمكن حذف هذا المشروع — توجد سجلات حضور أو مدفوعات مرتبطة به. ألغِه بدلاً من ذلك.");
  }
  if (opts.force) {
    for (let i = attendances.length - 1; i >= 0; i--) {
      if (attendances[i].projectId === id) attendances.splice(i, 1);
    }
    for (let i = demoPayments.length - 1; i >= 0; i--) {
      if (demoPayments[i].projectId === id) demoPayments.splice(i, 1);
    }
  }
  for (let i = demoAssignments.length - 1; i >= 0; i--) {
    if (demoAssignments[i].projectId === id) demoAssignments.splice(i, 1);
  }
  for (const key of [...demoWeekStatus.keys()]) {
    if (key.startsWith(`${id}:`)) demoWeekStatus.delete(key);
  }
  for (const key of [...demoCloses.keys()]) {
    if (key.startsWith(`${id}:`)) demoCloses.delete(key);
  }
  projects.splice(index, 1);
  return true;
}

// ─── Project assignments (workforce selection) ───────────────────────────────

interface DemoAssignment {
  personId: string;
  projectId: string;
  dailyRate: number;
  startDate: string;
  endDate: string | null;
}

const demoAssignments: DemoAssignment[] = [];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Assign a person to a project (idempotent while an open assignment exists).
 * New rows start today (or at project start for future projects) with a
 * snapshot of the person's current rate.
 */
export async function assignPersonToProject(
  projectId: string,
  personId: string,
): Promise<{ personId: string; projectId: string }> {
  const project = await getProject(projectId);
  if (!project) throw new Error("المشروع غير موجود");
  const person = await getPerson(personId);
  if (!person) throw new Error("الشخص غير موجود");
  const rows = demoAssignments
    .filter((a) => a.personId === personId && a.projectId === projectId)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  if (rows.length > 0 && rows[0].endDate === null) return { personId, projectId };
  const today = todayStr();
  const startDate = today > project.startDate ? today : project.startDate;
  const clash = rows.find((a) => a.startDate === startDate);
  if (clash) {
    clash.endDate = null; // reopen same-day row instead of duplicating
    return { personId, projectId };
  }
  demoAssignments.push({
    personId,
    projectId,
    dailyRate: person.currentDailyRate,
    startDate,
    endDate: null,
  });
  return { personId, projectId };
}

/** End the open assignment, if any (idempotent, history-preserving). */
export async function unassignPersonFromProject(
  projectId: string,
  personId: string,
): Promise<{ personId: string; projectId: string }> {
  const open = demoAssignments.find(
    (a) => a.personId === personId && a.projectId === projectId && a.endDate === null,
  );
  if (open) open.endDate = todayStr();
  return { personId, projectId };
}

/** Currently assigned team (open assignments only), with person details. */
export async function getProjectTeam(projectId: string): Promise<TeamMember[]> {
  const team: TeamMember[] = [];
  for (const a of demoAssignments) {
    if (a.projectId !== projectId || a.endDate !== null) continue;
    const person = await getPerson(a.personId);
    if (!person) continue;
    team.push({ personId: person.id, name: person.name, type: person.type, active: person.active });
  }
  return team.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** Every open assignment with denormalized names (quick-mark feed). */
export async function listOpenAssignments(): Promise<OpenAssignment[]> {
  const out: OpenAssignment[] = [];
  for (const a of demoAssignments) {
    if (a.endDate !== null) continue;
    const person = await getPerson(a.personId);
    const project = await getProject(a.projectId);
    if (!person || !project) continue;
    out.push({
      personId: person.id,
      personName: person.name,
      personActive: person.active,
      projectId: project.id,
      projectName: project.name,
      projectStatus: project.status,
      workingDays: [...project.workingDays],
    });
  }
  return out;
}

// ─── Attendance (source of truth) ────────────────────────────────────────────

const attendances: StoredAttendance[] = [];
let seq = 1;

export interface AttendanceInput {
  personId: string;
  status: "PRESENT" | "LEAVE";
  notes?: string;
}

export async function listAttendance(filter: {
  projectId?: string;
  personId?: string;
  from?: string;
  to?: string;
} = {}): Promise<AttendanceRow[]> {
  return attendances
    .filter((a) => !filter.projectId || a.projectId === filter.projectId)
    .filter((a) => !filter.personId || a.personId === filter.personId)
    .filter((a) => !filter.from || a.date >= filter.from!)
    .filter((a) => !filter.to || a.date <= filter.to!)
    .map((a) => omit(a, "createdBy"))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Record a batch of attendance for one project + date.
 * Enforces: one record per (person, project, date) — upserts on conflict.
 * Snapshots the person's current daily rate at record time.
 * UNIQUE(person, date) for PRESENT: a second payable mark elsewhere is
 * skipped and reported (never duplicated). Throws on closed days.
 */
export async function recordAttendanceBatch(args: {
  projectId: string;
  date: string;
  records: AttendanceInput[];
  createdBy: string;
}): Promise<{ recorded: number; updated: number; skipped: AttendanceConflict[] }> {
  const project = await getProject(args.projectId);
  if (!project) throw new Error("المشروع غير موجود");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("التاريخ غير صالح");
  if (demoCloses.has(`${args.projectId}:${args.date}`)) {
    throw new Error("اليوم مغلق — لا يمكن التسجيل أو التعديل");
  }
  const batchWeek = weekNumberFor(project.startDate, args.date);
  if ((demoWeekStatus.get(`${args.projectId}:${batchWeek}`) ?? "OPEN") === "SETTLED") {
    throw new Error("لا يمكن التسجيل — الأسبوع مسوّى");
  }

  let recorded = 0;
  let updated = 0;
  const skipped: AttendanceConflict[] = [];
  for (const r of args.records) {
    const person = await getPerson(r.personId);
    if (!person || !person.active) continue;
    if (r.status === "PRESENT") {
      const clash = attendances.find(
        (a) =>
          a.personId === r.personId &&
          a.date === args.date &&
          a.status === "PRESENT" &&
          a.projectId !== args.projectId,
      );
      if (clash) {
        skipped.push({
          personId: person.id,
          personName: person.name,
          date: args.date,
          existingProjectId: clash.projectId,
          existingProjectName: clash.projectName,
        });
        continue;
      }
    }
    const existing = attendances.find(
      (a) => a.personId === r.personId && a.projectId === args.projectId && a.date === args.date,
    );
    if (existing) {
      existing.status = r.status;
      existing.notes = r.notes?.trim() ? r.notes.trim() : null;
      updated += 1;
    } else {
      attendances.push({
        id: `a${seq++}`,
        personId: person.id,
        personName: person.name,
        projectId: project.id,
        projectName: project.name,
        date: args.date,
        status: r.status,
        dailyRate: person.currentDailyRate,
        hours: r.status === "PRESENT" ? 1 : 0,
        notes: r.notes?.trim() ? r.notes.trim() : null,
        createdBy: args.createdBy,
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
  const rows = attendances.filter((a) => a.personId === id && a.status === "PRESENT");
  const byProject = new Map<string, { name: string; days: number; halalas: number; rate: number }>();
  for (const a of rows) {
    const e = byProject.get(a.projectId) ?? { name: a.projectName, days: 0, halalas: 0, rate: a.dailyRate };
    e.days += 1;
    e.halalas += Math.round(a.dailyRate * 100) * a.hours;
    e.rate = a.dailyRate;
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

// ─── Weeks & settlement ──────────────────────────────────────────────────────

const demoWeekStatus = new Map<string, WeekStatus>(); // key `${projectId}:${weekNumber}`
const demoAudit: { entityType: string; entityId: string; action: string; performedBy: string }[] = [];

interface DemoPayment {
  id: string;
  weekKey: string;
  projectId: string;
  personId: string;
  amountHalalas: number;
  paidAt: string;
  notes: string | null;
  createdBy: string;
}

const demoPayments: DemoPayment[] = [];
let paymentSeq = 1;

function buildDemoWeek(project: ProjectRow, weekNumber: number): WeekSummary | null {
  const key = `${project.id}:${weekNumber}`;
  const rows = attendances.filter(
    (a) =>
      a.projectId === project.id &&
      a.status === "PRESENT" &&
      weekNumberFor(project.startDate, a.date) === weekNumber,
  );
  if (rows.length === 0) return null;
  const bounds = weekBounds(project.startDate, rows[0].date);

  const byPerson = new Map<string, { name: string; type: PersonType; days: number; due: number }>();
  for (const r of rows) {
    const e = byPerson.get(r.personId) ?? {
      name: r.personName,
      type: people.find((x) => x.id === r.personId)?.type ?? "WORKER",
      days: 0,
      due: 0,
    };
    e.days += 1;
    e.due += Math.round(r.dailyRate * 100) * r.hours;
    byPerson.set(r.personId, e);
  }
  const paidByPerson = new Map<string, number>();
  const payments = demoPayments
    .filter((p) => p.weekKey === key)
    .map((p) => {
      const person = people.find((x) => x.id === p.personId);
      paidByPerson.set(p.personId, (paidByPerson.get(p.personId) ?? 0) + p.amountHalalas);
      return {
        id: p.id,
        personId: p.personId,
        personName: person?.name ?? "?",
        amountHalalas: p.amountHalalas,
        paidAt: p.paidAt,
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
  const halalas = dues.reduce((s, d) => s + d.dueHalalas, 0);
  const paidHalalas = dues.reduce((s, d) => s + d.paidHalalas, 0);
  return {
    id: key,
    projectId: project.id,
    projectName: project.name,
    weekNumber,
    startDate: bounds.start,
    endDate: bounds.end,
    status: demoWeekStatus.get(key) ?? "OPEN",
    days: rows.length,
    halalas,
    paidHalalas,
    dues,
    payments,
  };
}

export async function listWeeks(projectId: string): Promise<WeekSummary[]> {
  const project = await getProject(projectId);
  if (!project) throw new Error("المشروع غير موجود");
  const numbers = new Set<number>();
  for (const a of attendances) {
    if (a.projectId === projectId && a.status === "PRESENT") {
      numbers.add(weekNumberFor(project.startDate, a.date));
    }
  }
  return [...numbers]
    .sort((a, b) => a - b)
    .map((wn) => buildDemoWeek(project, wn))
    .filter((w): w is WeekSummary => w !== null);
}

function parseDemoWeekId(weekId: string): { projectId: string; weekNumber: number } {
  const sep = weekId.lastIndexOf(":");
  const weekNumber = Number(weekId.slice(sep + 1));
  if (sep < 0 || !Number.isInteger(weekNumber) || weekNumber < 1) throw new Error("الأسبوع غير موجود");
  return { projectId: weekId.slice(0, sep), weekNumber };
}

export async function recordWeekPayments(
  weekId: string,
  args: {
    payments: { personId: string; amountHalalas: number }[];
    notes?: string;
    createdBy: string;
  },
): Promise<{ week: WeekSummary; applied: number }> {
  const { projectId, weekNumber } = parseDemoWeekId(weekId);
  const project = await getProject(projectId);
  if (!project) throw new Error("الأسبوع غير موجود");
  const week = buildDemoWeek(project, weekNumber);
  if (!week) throw new Error("الأسبوع غير موجود");
  if (week.status !== "OPEN") throw new Error("الأسبوع مسوّى بالفعل");
  if (args.payments.length === 0) throw new Error("لا توجد مدفوعات");

  for (const p of args.payments) {
    if (!Number.isInteger(p.amountHalalas) || p.amountHalalas <= 0) {
      throw new Error("مبلغ الدفعة غير صالح");
    }
    const due = week.dues.find((d) => d.personId === p.personId);
    if (!due) throw new Error("لا مستحقات لهذا الشخص في الأسبوع");
    if (p.amountHalalas > due.dueHalalas - due.paidHalalas) {
      throw new Error(`المبلغ يتجاوز المتبقي لـ ${due.personName}`);
    }
  }

  const notes = args.notes?.trim() ? args.notes.trim() : null;
  for (const p of args.payments) {
    demoPayments.push({
      id: `pay${paymentSeq++}`,
      weekKey: weekId,
      projectId,
      personId: p.personId,
      amountHalalas: p.amountHalalas,
      paidAt: new Date().toISOString(),
      notes,
      createdBy: args.createdBy,
    });
  }
  const fresh = buildDemoWeek(project, weekNumber) as WeekSummary;
  if (fresh.dues.every((d) => d.paidHalalas >= d.dueHalalas)) {
    demoWeekStatus.set(weekId, "SETTLED");
    fresh.status = "SETTLED";
  }
  demoAudit.push({ entityType: "Week", entityId: weekId, action: "SETTLE", performedBy: args.createdBy });
  return { week: fresh, applied: args.payments.length };
}

/**
 * Void a payment (correction path). Reopens the week when a balance
 * reappears; stays SETTLED only while every due is fully paid.
 */
export async function voidWeekPayment(
  weekId: string,
  paymentId: string,
  performedBy: string,
): Promise<{ week: WeekSummary }> {
  const index = demoPayments.findIndex((p) => p.id === paymentId && p.weekKey === weekId);
  if (index < 0) throw new Error("الدفعة غير موجودة");
  demoPayments.splice(index, 1);
  const { projectId, weekNumber } = parseDemoWeekId(weekId);
  const project = await getProject(projectId);
  if (!project) throw new Error("الأسبوع غير موجود");
  const fresh = buildDemoWeek(project, weekNumber) as WeekSummary;
  const status: WeekStatus = fresh.dues.every((d) => d.paidHalalas >= d.dueHalalas) ? "SETTLED" : "OPEN";
  demoWeekStatus.set(weekId, status);
  fresh.status = status;
  demoAudit.push({ entityType: "Week", entityId: weekId, action: "VOID", performedBy });
  return { week: fresh };
}

// ─── Attendance day close ────────────────────────────────────────────────────

const JS_DAY_TO_NAME = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

const demoCloses = new Map<string, { closedBy: string; closedAt: string }>();

function closeKey(projectId: string, date: string): string {
  return `${projectId}:${date}`;
}

function isWorkingDay(project: ProjectRow, date: string): boolean {
  return project.workingDays.includes(JS_DAY_TO_NAME[new Date(`${date}T00:00:00.000Z`).getUTCDay()]);
}

export async function getDayClose(projectId: string, date: string): Promise<DayCloseInfo | null> {
  const c = demoCloses.get(closeKey(projectId, date));
  if (!c) return null;
  return { projectId, date, closedBy: c.closedBy, closedAt: c.closedAt };
}

export async function isAttendanceDayClosed(projectId: string, date: string): Promise<boolean> {
  return demoCloses.has(closeKey(projectId, date));
}

/**
 * Close the day: locks it after review. No rows are created — attendance is
 * recorded only for people actually marked. Reopening removes the lock.
 */
export async function closeAttendanceDay(
  projectId: string,
  date: string,
  closedBy: string,
): Promise<{ closed: true }> {
  const project = await getProject(projectId);
  if (!project) throw new Error("المشروع غير موجود");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("التاريخ غير صالح");
  if (!isWorkingDay(project, date)) throw new Error("لا يمكن الإغلاق — هذا اليوم ليس من أيام عمل المشروع");
  const key = closeKey(projectId, date);
  if (demoCloses.has(key)) throw new Error("اليوم مغلق بالفعل");
  const wn = weekNumberFor(project.startDate, date);
  if ((demoWeekStatus.get(`${projectId}:${wn}`) ?? "OPEN") === "SETTLED") {
    throw new Error("لا يمكن الإغلاق — الأسبوع مسوّى");
  }
  demoCloses.set(key, { closedBy, closedAt: new Date().toISOString() });
  return { closed: true };
}

/** Reopen: removes the close record and unlocks the day. */
export async function reopenAttendanceDay(
  projectId: string,
  date: string,
): Promise<{ reopened: true }> {
  const key = closeKey(projectId, date);
  if (!demoCloses.has(key)) throw new Error("اليوم غير مغلق");
  demoCloses.delete(key);
  return { reopened: true };
}

/**
 * Move a PRESENT mark to another project on the same day (same rate
 * snapshot preserved). Both sides must be unlocked (not closed/settled).
 */
export async function moveAttendance(args: {
  personId: string;
  date: string;
  toProjectId: string;
}): Promise<{ moved: AttendanceRow }> {
  const person = await getPerson(args.personId);
  if (!person) throw new Error("الشخص غير موجود");
  const toProject = await getProject(args.toProjectId);
  if (!toProject) throw new Error("المشروع غير موجود");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("التاريخ غير صالح");
  const index = attendances.findIndex(
    (a) =>
      a.personId === args.personId &&
      a.date === args.date &&
      a.status === "PRESENT" &&
      a.projectId !== args.toProjectId,
  );
  if (index < 0) throw new Error("لا يوجد حضور حاضر لنقله في هذا اليوم");
  const source = attendances[index];
  if (await isAttendanceDayClosed(source.projectId, args.date)) {
    throw new Error("لا يمكن النقل — اليوم مغلق في المشروع الأصلي");
  }
  if (await isAttendanceDayClosed(args.toProjectId, args.date)) {
    throw new Error("لا يمكن النقل — اليوم مغلق في المشروع الجديد");
  }
  const srcProject = await getProject(source.projectId);
  if (!srcProject) throw new Error("المشروع غير موجود");
  if ((demoWeekStatus.get(`${srcProject.id}:${weekNumberFor(srcProject.startDate, args.date)}`) ?? "OPEN") === "SETTLED") {
    throw new Error("لا يمكن النقل — الأسبوع مسوّى في المشروع الأصلي");
  }
  if ((demoWeekStatus.get(`${toProject.id}:${weekNumberFor(toProject.startDate, args.date)}`) ?? "OPEN") === "SETTLED") {
    throw new Error("لا يمكن النقل — الأسبوع مسوّى في المشروع الجديد");
  }
  if (
    attendances.some(
      (a) =>
        a.personId === args.personId &&
        a.date === args.date &&
        a.status === "PRESENT" &&
        a.projectId === args.toProjectId,
    )
  ) {
    throw new Error("يوجد حضور مسجل بالفعل في المشروع الجديد");
  }
  attendances.splice(index, 1);
  const moved: StoredAttendance = {
    ...source,
    id: `a${seq++}`,
    projectId: toProject.id,
    projectName: toProject.name,
  };
  attendances.push(moved);
  return { moved: omit(moved, "createdBy") };
}

/**
 * Workforce-first quick mark: mark PRESENT across every eligible project
 * (open assignment covering the date, ACTIVE project, working day). PRESENT
 * keeps UNIQUE(person, date): if payable presence exists anywhere that day,
 * nothing is created and the conflict is reported.
 */
export async function quickMark(
  personId: string,
  date: string,
  status: "PRESENT",
  createdBy: string,
): Promise<{ success: true; projects: { projectId: string; projectName: string }[]; skipped: AttendanceConflict[] }> {
  const person = await getPerson(personId);
  if (!person) throw new Error("الشخص غير موجود");
  if (!person.active) throw new Error("الشخص غير نشط");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("التاريخ غير صالح");
  const eligible: { project: ProjectRow }[] = [];
  for (const a of demoAssignments) {
    if (a.personId !== personId || a.endDate !== null || a.startDate > date) continue;
    const project = await getProject(a.projectId);
    if (!project || project.status !== "ACTIVE" || !isWorkingDay(project, date)) continue;
    if (!eligible.some((e) => e.project.id === project.id)) eligible.push({ project });
  }
  const existing = attendances.find(
    (a) => a.personId === personId && a.date === date && a.status === "PRESENT",
  );
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
          existingProjectName: existing.projectName,
        },
      ],
    };
  }
  const projects: { projectId: string; projectName: string }[] = [];
  for (const { project } of eligible) {
    const same = attendances.find(
      (a) => a.personId === personId && a.projectId === project.id && a.date === date,
    );
    if (same) {
      same.status = "PRESENT";
      same.hours = 1;
      same.dailyRate = person.currentDailyRate;
    } else {
      attendances.push({
        id: `a${seq++}`,
        personId: person.id,
        personName: person.name,
        projectId: project.id,
        projectName: project.name,
        date,
        status: "PRESENT",
        dailyRate: person.currentDailyRate,
        hours: 1,
        notes: null,
        createdBy,
      });
    }
    projects.push({ projectId: project.id, projectName: project.name });
  }
  return { success: true, projects, skipped: [] };
}

/** Full account statement of one worker across all projects and weeks. */
export async function getWorkerStatement(personId: string): Promise<WorkerStatement> {
  const person = await getPerson(personId);
  if (!person) throw new Error("الشخص غير موجود");
  const dues: WorkerStatement["dues"] = [];
  for (const project of projects) {
    const numbers = new Set<number>();
    for (const a of attendances) {
      if (a.projectId === project.id && a.status === "PRESENT") {
        numbers.add(weekNumberFor(project.startDate, a.date));
      }
    }
    for (const wn of numbers) {
      const week = buildDemoWeek(project, wn);
      if (!week) continue;
      const due = week.dues.find((d) => d.personId === personId);
      if (!due || due.dueHalalas <= 0) continue;
      dues.push({
        projectId: project.id,
        projectName: project.name,
        weekId: week.id,
        weekNumber: wn,
        weekStartDate: week.startDate,
        dueHalalas: due.dueHalalas,
        paidHalalas: due.paidHalalas,
      });
    }
  }
  dues.sort((a, b) =>
    a.weekStartDate < b.weekStartDate ? -1 : a.weekStartDate > b.weekStartDate ? 1 : a.projectId < b.projectId ? -1 : 1,
  );
  const payments = demoPayments
    .filter((p) => p.personId === personId)
    .map((p) => {
      const project = projects.find((x) => x.id === p.projectId);
      const wn = Number(p.weekKey.slice(p.weekKey.lastIndexOf(":") + 1));
      return {
        id: p.id,
        personId: p.personId,
        personName: person.name,
        projectName: project?.name ?? "?",
        weekNumber: Number.isInteger(wn) ? wn : 0,
        amountHalalas: p.amountHalalas,
        paidAt: p.paidAt,
        notes: p.notes,
      };
    })
    .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
  const totalDue = dues.reduce((s, d) => s + d.dueHalalas, 0);
  const totalPaid = dues.reduce((s, d) => s + d.paidHalalas, 0);
  return { personId, personName: person.name, dues, payments, totalDue, totalPaid, totalRemaining: totalDue - totalPaid };
}

/**
 * Pay a worker across open dues, oldest week first. Overpayment is
 * rejected; weeks that become fully paid flip to SETTLED.
 */
export async function payWorker(
  personId: string,
  amountHalalas: number,
  notes: string | undefined,
  createdBy: string,
): Promise<{ statement: WorkerStatement; applied: number; allocations: { weekId: string; projectName: string; amountHalalas: number }[] }> {
  if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) throw new Error("مبلغ الدفعة غير صالح");
  const statement = await getWorkerStatement(personId);
  if (amountHalalas > statement.totalRemaining) throw new Error("المبلغ يتجاوز إجمالي المتبقي");
  const open = statement.dues.filter((d) => d.dueHalalas - d.paidHalalas > 0);
  let left = amountHalalas;
  const allocations: { weekId: string; projectName: string; amountHalalas: number }[] = [];
  const touched = new Set<string>();
  for (const due of open) {
    if (left <= 0) break;
    const take = Math.min(left, due.dueHalalas - due.paidHalalas);
    demoPayments.push({
      id: `pay${paymentSeq++}`,
      weekKey: due.weekId,
      projectId: due.projectId,
      personId,
      amountHalalas: take,
      paidAt: new Date().toISOString(),
      notes: notes?.trim() ? notes.trim() : null,
      createdBy,
    });
    allocations.push({ weekId: due.weekId, projectName: due.projectName, amountHalalas: take });
    touched.add(due.weekId);
    left -= take;
  }
  for (const weekId of touched) {
    const { projectId, weekNumber } = parseDemoWeekId(weekId);
    const project = (await getProject(projectId)) as ProjectRow;
    const fresh = buildDemoWeek(project, weekNumber) as WeekSummary;
    const status: WeekStatus = fresh.dues.every((d) => d.paidHalalas >= d.dueHalalas) ? "SETTLED" : "OPEN";
    demoWeekStatus.set(weekId, status);
  }
  demoAudit.push({ entityType: "Person", entityId: personId, action: "PAY", performedBy: createdBy });
  return { statement: await getWorkerStatement(personId), applied: allocations.length, allocations };
}

export function isDemoMode(): boolean {
  return process.env.USE_DEMO_DATA !== "false";
}

export type { Role };
