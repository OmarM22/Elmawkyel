"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatSAR, sumHalalas } from "@/lib/money";
import { addDays, todayUTC } from "@/lib/dates";
import type { AttendanceRow, ProjectRow } from "@/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export default function WeeklyPage() {
  const [projectId, setProjectId] = useState("");
  const [start, setStart] = useState(todayUTC());

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getJson<{ projects: ProjectRow[] }>("/api/projects"),
  });

  // UTC arithmetic: local-midnight + toISOString loses a day east of Greenwich.
  const end = useMemo(() => addDays(start, 6), [start]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["weekly", projectId, start],
    queryFn: () =>
      getJson<{ attendance: AttendanceRow[] }>(
        `/api/attendance?projectId=${projectId}&from=${start}&to=${end}`,
      ),
    enabled: projectId !== "",
  });

  const rows = useMemo(() => (data?.attendance ?? []).filter((r) => r.status === "PRESENT"), [data]);
  const allRows = useMemo(() => data?.attendance ?? [], [data]);

  const byDay = useMemo(() => {
    const map = new Map<string, { count: number; leave: number; halalas: number }>();
    for (const r of allRows) {
      const e = map.get(r.date) ?? { count: 0, leave: 0, halalas: 0 };
      if (r.status === "PRESENT") {
        e.count += 1;
        e.halalas += Math.round(r.dailyRate * 100) * r.hours;
      } else {
        e.leave += 1;
      }
      map.set(r.date, e);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [allRows]);

  const byPerson = useMemo(() => {
    const map = new Map<string, { personId: string; name: string; days: number; leave: number; halalas: number }>();
    for (const r of allRows) {
      const e = map.get(r.personId) ?? { personId: r.personId, name: r.personName, days: 0, leave: 0, halalas: 0 };
      if (r.status === "PRESENT") {
        e.days += 1;
        e.halalas += Math.round(r.dailyRate * 100) * r.hours;
      } else {
        e.leave += 1;
      }
      map.set(r.personId, e);
    }
    return [...map.values()];
  }, [allRows]);

  const totalLeave = byDay.reduce((s, [, v]) => s + v.leave, 0);

  const total = sumHalalas(byDay.map(([, v]) => v.halalas));

  return (
    <AppShell>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">الحصر الأسبوعي</h1>
          <p className="text-sm text-muted-foreground">إجمالي ٧ أيام لأي مشروع من اليوميات المسجلة</p>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project" className="text-sm font-medium">
                المشروع
              </label>
              <select
                id="project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">اختر المشروع…</option>
                {projectsData?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="start" className="text-sm font-medium">
                بداية الفترة
              </label>
              <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {projectId && isError && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">تعذر تحميل اليوميات. حاول تحديث الصفحة.</p>
            </CardContent>
          </Card>
        )}

        {projectId && !isError && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">الفترة</CardTitle>
                </CardHeader>
                <CardContent className="text-lg font-bold" dir="ltr">
                  {start} → {end}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي اليوميات</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">{rows.length}</div>
                  <p className="text-xs text-muted-foreground">
                    إجازة: {totalLeave}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي التكلفة</CardTitle>
                </CardHeader>
                <CardContent className="text-lg font-bold">{formatSAR(total)}</CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>التفصيل اليومي</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-24 animate-pulse rounded-lg bg-muted" />
                ) : byDay.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد يوميات في هذه الفترة.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 text-right font-medium">التاريخ</th>
                          <th className="py-2 text-right font-medium">اليوم</th>
                          <th className="py-2 text-right font-medium">الحضور</th>
                          <th className="py-2 text-right font-medium">الإجازات</th>
                          <th className="py-2 text-right font-medium">التكلفة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byDay.map(([date, v]) => (
                          <tr key={date} className="border-b last:border-0">
                            <td className="py-2" dir="ltr">
                              {date}
                            </td>
                            <td className="py-2">{AR_DAYS[new Date(`${date}T00:00:00`).getDay()]}</td>
                            <td className="py-2">{v.count}</td>
                            <td className="py-2">{v.leave}</td>
                            <td className="py-2 font-semibold">{formatSAR(v.halalas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>إجمالي كل فرد</CardTitle>
              </CardHeader>
              <CardContent>
                {byPerson.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 text-right font-medium">الاسم</th>
                          <th className="py-2 text-right font-medium">الأيام</th>
                          <th className="py-2 text-right font-medium">الإجازات</th>
                          <th className="py-2 text-right font-medium">المستحق</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byPerson.map((p) => (
                          <tr key={p.personId} className="border-b last:border-0">
                            <td className="py-2">
                              <Link href={`/people/${p.personId}`} className="text-primary hover:underline">
                                {p.name}
                              </Link>
                            </td>
                            <td className="py-2">{p.days}</td>
                            <td className="py-2">{p.leave}</td>
                            <td className="py-2 font-semibold">{formatSAR(p.halalas)}</td>
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
