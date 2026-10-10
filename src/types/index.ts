/* Shared domain + API types (plain JSON shapes, Decimal serialized as number). */

export type Role = "ADMIN";

export type PersonType = "CRAFTSMAN" | "WORKER";

export type ProjectStatus = "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";

export type AttendanceStatus = "PRESENT" | "LEAVE";

export interface PersonRow {
  id: string;
  name: string;
  type: PersonType;
  phone: string | null;
  active: boolean;
  currentDailyRate: number;
}

/** Backwards-compatible alias used by older pages. */
export type PersonTableRow = PersonRow;

export interface AssignmentRow {
  id: string;
  projectId: string;
  projectName: string;
  dailyRate: number;
  days: number;
  totalHalalas: number;
  period: string;
}

export interface PersonDetail extends PersonRow {
  assignments: AssignmentRow[];
}

export interface ProjectRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  status: ProjectStatus;
  workingDays: string[];
}

/** Backwards-compatible alias used by older pages. */
export type ProjectTableRow = ProjectRow & {
  startDate: Date;
  endDate: Date | null;
};

export interface AttendanceRow {
  id: string;
  personId: string;
  personName: string;
  projectId: string;
  projectName: string;
  date: string;
  status: AttendanceStatus;
  dailyRate: number;
  hours: number;
  notes: string | null;
}

export interface EndingProject {
  id: string;
  name: string;
  endDate: string;
  daysLeft: number;
}

export interface ProjectWeekSummary {
  projectId: string;
  projectName: string;
  days: number;
  halalas: number;
}

export interface DailyPoint {
  date: string;
  days: number;
  halalas: number;
}

export interface DashboardData {
  totalProjects: number;
  activeProjects: number;
  totalPeople: number;
  activePeople: number;
  weekAttendance: number;
  weekLeave: number;
  weekHalalas: number;
  weekAttendanceDelta: number;
  weekHalalasDelta: number;
  weekLabel: string;
  endingSoon: EndingProject[];
  perProject: ProjectWeekSummary[];
  daily: DailyPoint[];
}

export interface UserRow {
  id: string;
  username: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "مدير النظام",
};

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  CRAFTSMAN: "صنايعي",
  WORKER: "عامل",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "نشط",
  COMPLETED: "مكتمل",
  ON_HOLD: "متوقف مؤقتاً",
  CANCELLED: "ملغي",
};

export const DAY_OF_WEEK_LABELS: Record<string, string> = {
  SATURDAY: "السبت",
  SUNDAY: "الأحد",
  MONDAY: "الاثنين",
  TUESDAY: "الثلاثاء",
  WEDNESDAY: "الأربعاء",
  THURSDAY: "الخميس",
  FRIDAY: "الجمعة",
};

/** A person currently assigned to a project (open assignment). */
export interface TeamMember {
  personId: string;
  name: string;
  type: PersonType;
  active: boolean;
}

/** One open assignment with denormalized names for the quick-mark feed. */
export interface OpenAssignment {
  personId: string;
  personName: string;
  personActive: boolean;
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  workingDays: string[];
}

export type WeekStatus = "OPEN" | "CLOSED" | "SETTLED";

export const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  OPEN: "مفتوح",
  CLOSED: "مغلق",
  SETTLED: "مسوّى",
};

export interface WeekDue {
  personId: string;
  personName: string;
  type: PersonType;
  days: number;
  dueHalalas: number;
  paidHalalas: number;
}

export interface WeekPaymentRow {
  id: string;
  personId: string;
  personName: string;
  amountHalalas: number;
  paidAt: string;
  notes: string | null;
}

/** One open due of a worker in a specific project week. */
export interface WorkerDue {
  projectId: string;
  projectName: string;
  weekId: string;
  weekNumber: number;
  weekStartDate: string;
  dueHalalas: number;
  paidHalalas: number;
}

/** Full account statement of one worker across all projects and weeks. */
export interface WorkerStatement {
  personId: string;
  personName: string;
  dues: WorkerDue[];
  payments: (WeekPaymentRow & { projectName: string; weekNumber: number })[];
  totalDue: number;
  totalPaid: number;
  totalRemaining: number;
}

/** A PRESENT row elsewhere blocking a new payable mark (UNIQUE person+date). */
export interface AttendanceConflict {
  personId: string;
  personName: string;
  date: string;
  existingProjectId: string;
  existingProjectName: string;
}

/** A locked attendance day. */
export interface DayCloseInfo {
  projectId: string;
  date: string;
  closedBy: string;
  closedAt: string;
}

export interface WeekSummary {
  id: string;
  projectId: string;
  projectName: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  status: WeekStatus;
  days: number;
  halalas: number;
  paidHalalas: number;
  dues: WeekDue[];
  payments: WeekPaymentRow[];
}
