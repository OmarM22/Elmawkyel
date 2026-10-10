import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listAttendance, listPeople, listProjects } from "@/server/store";
import { sumHalalas } from "@/lib/money";

const DAY_MS = 86_400_000;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function halalasOf(r: { dailyRate: number; hours: number }): number {
  return Math.round(r.dailyRate * 100) * r.hours;
}

/*
 * Dashboard KPIs derived from the attendance store (source of truth).
 * Window convention: the work week Saturday → Thursday (labelled
 * "من السبت إلى الخميس").
 * (The /weekly page uses a user-picked 7-day window instead; DB Week rows
 * are project-week scaffolding for future settlement.)
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const [people, projects, rows] = await Promise.all([
    listPeople(),
    listProjects(),
    listAttendance(),
  ]);

  const now = new Date();
  const todayStr = toDateStr(now);
  // Window: Saturday → Thursday (Saudi work week). Start = most recent Saturday.
  const daysSinceSaturday = (now.getUTCDay() + 1) % 7;
  const sinceStr = toDateStr(new Date(now.getTime() - daysSinceSaturday * DAY_MS));
  const untilStr = toDateStr(new Date(now.getTime() - daysSinceSaturday * DAY_MS + 5 * DAY_MS));
  const trendSinceStr = toDateStr(new Date(now.getTime() - 13 * DAY_MS));

  const weekRows = rows.filter((r) => r.date >= sinceStr && r.date <= untilStr);
  const presentRows = weekRows.filter((r) => r.status === "PRESENT");
  const weekHalalas = sumHalalas(presentRows.map(halalasOf));

  // Previous Saturday→Thursday window for week-over-week deltas.
  const prevEndStr = toDateStr(new Date(now.getTime() - daysSinceSaturday * DAY_MS - 2 * DAY_MS));
  const prevSinceStr = toDateStr(new Date(now.getTime() - daysSinceSaturday * DAY_MS - 7 * DAY_MS));
  const prevPresent = rows.filter(
    (r) => r.date >= prevSinceStr && r.date <= prevEndStr && r.status === "PRESENT",
  );
  const prevHalalas = sumHalalas(prevPresent.map(halalasOf));

  // Per-project breakdown: ALL-TIME totals (every recorded day, whole project
  // life) — the owner wants the full cost per project at a glance, no window.
  const byProject = new Map<string, { name: string; days: number; halalas: number }>();
  for (const r of rows) {
    if (r.status !== "PRESENT") continue;
    const e = byProject.get(r.projectId) ?? { name: r.projectName, days: 0, halalas: 0 };
    e.days += 1;
    e.halalas += halalasOf(r);
    byProject.set(r.projectId, e);
  }
  const perProject = [...byProject.entries()]
    .map(([projectId, v]) => ({ projectId, projectName: v.name, days: v.days, halalas: v.halalas }))
    .sort((a, b) => b.halalas - a.halalas);
  // Make sure inactive/no-attendance projects still show with zero.
  for (const p of projects) {
    if (!byProject.has(p.id)) {
      perProject.push({ projectId: p.id, projectName: p.name, days: 0, halalas: 0 });
    }
  }

  // 14-day daily series (zero-filled for chart continuity).
  const daily = Array.from({ length: 14 }, (_, i) => {
    const date = toDateStr(new Date(now.getTime() - (13 - i) * DAY_MS));
    const dayRows = rows.filter((r) => r.date === date && r.status === "PRESENT");
    return { date, days: dayRows.length, halalas: sumHalalas(dayRows.map(halalasOf)) };
  }).filter((d) => d.date >= trendSinceStr);

  // Projects ending within 14 days (active with an upcoming end date).
  const horizonStr = toDateStr(new Date(now.getTime() + 14 * DAY_MS));
  const endingSoon = projects
    .filter((p) => p.status === "ACTIVE" && p.endDate && p.endDate >= todayStr && p.endDate <= horizonStr)
    .map((p) => ({
      id: p.id,
      name: p.name,
      endDate: p.endDate as string,
      daysLeft: Math.round(
        (Date.parse(`${p.endDate}T00:00:00.000Z`) - Date.parse(`${todayStr}T00:00:00.000Z`)) / DAY_MS,
      ),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return NextResponse.json({
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => p.status === "ACTIVE").length,
    totalPeople: people.length,
    activePeople: people.filter((p) => p.active).length,
    weekAttendance: presentRows.length,
    weekLeave: weekRows.filter((r) => r.status === "LEAVE").length,
    weekHalalas,
    weekAttendanceDelta: presentRows.length - prevPresent.length,
    weekHalalasDelta: weekHalalas - prevHalalas,
    weekLabel: "من السبت إلى الخميس",
    endingSoon,
    perProject,
    daily,
  });
}
