"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buildMatrixCsv } from "@/lib/csv";
import { formatSAR, sumHalalas } from "@/lib/money";
import type { AttendanceRow, PersonRow, ProjectRow } from "@/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

function halalasOf(r: AttendanceRow) {
  return Math.round(r.dailyRate * 100) * r.hours;
}

export default function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const attendanceUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) params.set("from", from);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) params.set("to", to);
    const q = params.toString();
    return q ? `/api/attendance?${q}` : "/api/attendance";
  }, [from, to]);
  const rangeLabel = from || to ? `${from || "البداية"} ← ${to || "اليوم"}` : "كل الفترات";

  const {
    data: attendanceData,
    isLoading: attendanceLoading,
    isError: attendanceError,
  } = useQuery({
    queryKey: ["reports-attendance", from, to],
    queryFn: () => getJson<{ attendance: AttendanceRow[] }>(attendanceUrl),
  });
  const { data: peopleData } = useQuery({
    queryKey: ["people"],
    queryFn: () => getJson<{ people: PersonRow[] }>("/api/people"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getJson<{ projects: ProjectRow[] }>("/api/projects"),
  });

  const rows = useMemo(
    () => (attendanceData?.attendance ?? []).filter((r) => r.status === "PRESENT"),
    [attendanceData],
  );
  const people = useMemo(() => peopleData?.people ?? [], [peopleData]);
  const projects = useMemo(() => projectsData?.projects ?? [], [projectsData]);

  // Global weekly matrix: person × project day counts
  const matrix = useMemo(() => {
    const projectIds = [...new Set(rows.map((r) => r.projectId))];
    const personIds = [...new Set(rows.map((r) => r.personId))];
    const cells = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.personId}|${r.projectId}`;
      cells.set(k, (cells.get(k) ?? 0) + 1);
    }
    const personTotals = new Map<string, number>();
    for (const r of rows) personTotals.set(r.personId, (personTotals.get(r.personId) ?? 0) + halalasOf(r));
    return { projectIds, personIds, cells, personTotals };
  }, [rows]);

  const projectTotals = useMemo(
    () =>
      projects.map((p) => ({
        ...p,
        halalas: sumHalalas(rows.filter((r) => r.projectId === p.id).map(halalasOf)),
        days: rows.filter((r) => r.projectId === p.id).length,
      })),
    [projects, rows],
  );

  const personName = (id: string) =>
    people.find((p) => p.id === id)?.name ?? rows.find((r) => r.personId === id)?.personName ?? id;
  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name ?? rows.find((r) => r.projectId === id)?.projectName ?? id;

  const grandTotal = sumHalalas(rows.map(halalasOf));

  function exportCsv() {
    const csv = buildMatrixCsv({
      projectNames: [...new Set(rows.map((r) => r.projectId))].map((pid) => projectName(pid)),
      rows: matrix.personIds.map((pid) => ({
        name: personName(pid),
        cells: matrix.projectIds.map((pr) => matrix.cells.get(`${pid}|${pr}`) ?? 0),
        days: matrix.projectIds.reduce((a, pr) => a + (matrix.cells.get(`${pid}|${pr}`) ?? 0), 0),
        halalas: matrix.personTotals.get(pid) ?? 0,
      })),
      grandTotalHalalas: grandTotal,
    });
    const range = `${from || "all"}-${to || "all"}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alwakeel-report-${range}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">الوكيل — التقرير الشامل</h1>
          <p className="text-sm text-muted-foreground">
            النطاق: {rangeLabel} • تاريخ الطباعة: {new Date().toISOString().slice(0, 10)} • الإجمالي:{" "}
            {formatSAR(grandTotal)}
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold">التقارير</h1>
            <p className="text-sm text-muted-foreground">كل التقارير مشتقة من سجلات اليومية • النطاق: {rangeLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              تصدير CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={rows.length === 0}>
              طباعة
            </Button>
          </div>
        </div>

        <Card className="print:hidden">
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rep-from" className="text-sm font-medium">
                من تاريخ
              </label>
              <Input id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rep-to" className="text-sm font-medium">
                إلى تاريخ
              </label>
              <Input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {(attendanceLoading || !peopleData || !projectsData) && !attendanceError && (
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="h-32 animate-pulse rounded-lg bg-muted" />
              </CardContent>
            </Card>
          </div>
        )}

        {attendanceError && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">تعذر تحميل التقارير. حاول تحديث الصفحة.</p>
            </CardContent>
          </Card>
        )}

        {!attendanceError && attendanceData && peopleData && projectsData && (
          <>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>التقرير الشامل ({rangeLabel})</CardTitle>
                <span className="text-sm font-bold">الإجمالي: {formatSAR(grandTotal)}</span>
              </CardHeader>
              <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد يوميات مسجلة بعد.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 text-right font-medium">الشخص</th>
                      {matrix.projectIds.map((pid) => (
                        <th key={pid} className="py-2 text-right font-medium">
                          <Link href={`/projects/${pid}`} className="text-primary hover:underline">
                            {projectName(pid)}
                          </Link>
                        </th>
                      ))}
                      <th className="py-2 text-right font-medium">إجمالي الأيام</th>
                      <th className="py-2 text-right font-medium">إجمالي المبلغ</th>
                    </tr>
                  </thead>
                      <tbody>
                        {matrix.personIds.map((pid) => {
                          const days = matrix.projectIds.reduce(
                            (a, pr) => a + (matrix.cells.get(`${pid}|${pr}`) ?? 0),
                            0,
                          );
                          return (
                            <tr key={pid} className="border-b last:border-0">
                              <td className="py-2 font-medium">
                                <Link href={`/people/${pid}`} className="text-primary hover:underline">
                                  {personName(pid)}
                                </Link>
                              </td>
                          {matrix.projectIds.map((pr) => (
                            <td key={pr} className="py-2">
                              {matrix.cells.get(`${pid}|${pr}`) ?? "—"}
                            </td>
                          ))}
                          <td className="py-2">{days}</td>
                          <td className="py-2 font-semibold">{formatSAR(matrix.personTotals.get(pid) ?? 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ملخص المشاريع (التكلفة التراكمية)</CardTitle>
          </CardHeader>
          <CardContent>
            {projectTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مشاريع.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 text-right font-medium">المشروع</th>
                      <th className="py-2 text-right font-medium">اليوميات</th>
                      <th className="py-2 text-right font-medium">تكلفة العمالة</th>
                    </tr>
                  </thead>
                  <tbody>
                        {projectTotals.map((p) => (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="py-2 font-medium">
                              <Link href={`/projects/${p.id}`} className="text-primary hover:underline">
                                {p.name}
                              </Link>
                            </td>
                            <td className="py-2">{p.days}</td>
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
