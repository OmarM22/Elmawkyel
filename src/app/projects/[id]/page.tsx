"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSAR } from "@/lib/money";
import {
  DAY_OF_WEEK_LABELS,
  PERSON_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  type AttendanceRow,
  type ProjectRow,
  type TeamMember,
} from "@/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

async function fetchProject(id: string): Promise<{ project: ProjectRow; team: TeamMember[] }> {
  return getJson(`/api/projects/${id}`);
}

const STATUS_VARIANTS: Record<ProjectRow["status"], "success" | "secondary" | "warning" | "destructive"> = {
  ACTIVE: "success",
  COMPLETED: "secondary",
  ON_HOLD: "warning",
  CANCELLED: "destructive",
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const projectQuery = useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProject(id),
  });
  const team = projectQuery.data?.team ?? [];
  const attendanceQuery = useQuery({
    queryKey: ["attendance", "project", id],
    queryFn: () => getJson<{ attendance: AttendanceRow[] }>(`/api/attendance?projectId=${id}`),
  });

  const present = (attendanceQuery.data?.attendance ?? []).filter((r) => r.status === "PRESENT");
  const byPerson = new Map<string, { name: string; days: number; halalas: number }>();
  for (const r of present) {
    const e = byPerson.get(r.personId) ?? { name: r.personName, days: 0, halalas: 0 };
    e.days += 1;
    e.halalas += Math.round(r.dailyRate * 100) * r.hours;
    byPerson.set(r.personId, e);
  }
  const workforce = [...byPerson.entries()]
    .map(([personId, v]) => ({ personId, ...v }))
    .sort((a, b) => b.halalas - a.halalas);
  const totalHalalas = workforce.reduce((sum, w) => sum + w.halalas, 0);

  const isLoading = projectQuery.isLoading || attendanceQuery.isLoading;
  const isError = projectQuery.isError || attendanceQuery.isError;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Link href="/projects" className="text-sm text-primary hover:underline">
          → العودة إلى المشاريع
        </Link>

        {isLoading && (
          <Card>
            <CardContent className="pt-6">
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        )}

        {isError && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">تعذر تحميل بيانات المشروع.</p>
            </CardContent>
          </Card>
        )}

        {projectQuery.data && (
          <>
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <CardTitle className="text-xl">{projectQuery.data.project.name}</CardTitle>
                <Badge variant={STATUS_VARIANTS[projectQuery.data.project.status]}>
                  {PROJECT_STATUS_LABELS[projectQuery.data.project.status]}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <div className="text-muted-foreground">تاريخ البداية</div>
                    <div className="font-semibold" dir="ltr">
                      {projectQuery.data.project.startDate}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">تاريخ النهاية</div>
                    <div className="font-semibold" dir="ltr">
                      {projectQuery.data.project.endDate || "مفتوح"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">أيام الحضور</div>
                    <div className="font-semibold">{present.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">إجمالي التكلفة</div>
                    <div className="font-semibold">{formatSAR(totalHalalas)}</div>
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-muted-foreground">أيام العمل</div>
                  <div className="flex flex-wrap gap-1">
                    {projectQuery.data.project.workingDays.map((d) => (
                      <Badge key={d} variant="outline">
                        {DAY_OF_WEEK_LABELS[d] || d}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>فريق العمل ({team.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {team.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا يوجد عمال معينون على هذا المشروع بعد.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {team.map((m) => (
                      <Link key={m.personId} href={`/people/${m.personId}`}>
                        <Badge variant="outline" className="gap-1 hover:bg-accent">
                          <span className="font-medium">{m.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {PERSON_TYPE_LABELS[m.type]}
                            {!m.active ? " • موقوف" : ""}
                          </span>
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>القوى العاملة ({workforce.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {workforce.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد يوميات مسجلة لهذا المشروع بعد.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 text-right font-medium">الشخص</th>
                          <th className="py-2 text-right font-medium">أيام الحضور</th>
                          <th className="py-2 text-right font-medium">التكلفة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workforce.map((w) => (
                          <tr key={w.personId} className="border-b last:border-0">
                            <td className="py-2">
                              <Link
                                href={`/people/${w.personId}`}
                                className="text-primary hover:underline"
                              >
                                {w.name}
                              </Link>
                            </td>
                            <td className="py-2">{w.days}</td>
                            <td className="py-2 font-semibold">{formatSAR(w.halalas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
