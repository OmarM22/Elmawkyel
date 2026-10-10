"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  legacyCreateColumnHelper,
  useLegacyTable,
} from "@tanstack/react-table/legacy";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatSAR } from "@/lib/money";
import { PERSON_TYPE_LABELS, WEEK_STATUS_LABELS, type AttendanceRow, type PersonRow, type PersonType, type ProjectRow, type WeekSummary } from "@/types";
import { SettleForm } from "./settle-form";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

const STATUS_VARIANTS: Record<WeekSummary["status"], "secondary" | "warning" | "success"> = {
  OPEN: "secondary",
  CLOSED: "warning",
  SETTLED: "success",
};

const columnHelper = legacyCreateColumnHelper<WeekSummary>();

export default function SettlementsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canManage = session?.user?.role === "ADMIN";
  const isAdmin = session?.user?.role === "ADMIN";

  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<"weeks" | "summary">("weeks");
  const [summarySelection, setSummarySelection] = useState<string[] | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettle, setShowSettle] = useState(false);
  const [settleAllOpen, setSettleAllOpen] = useState(false);
  const [settleAllBusy, setSettleAllBusy] = useState(false);
  const [settleAllError, setSettleAllError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<{ weekId: string; paymentId: string; label: string } | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getJson<{ projects: ProjectRow[] }>("/api/projects"),
  });
  const { data: weeksData, isLoading: weeksLoading } = useQuery({
    queryKey: ["weeks", projectId],
    queryFn: () => getJson<{ weeks: WeekSummary[] }>(`/api/weeks?projectId=${projectId}`),
    enabled: projectId !== "",
  });

  // Current work-week window: Saturday → Thursday (same convention as the dashboard).
  const summaryWindow = useMemo(() => {
    const now = new Date();
    const daysSinceSaturday = (now.getDay() + 1) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - daysSinceSaturday);
    const end = new Date(start);
    end.setDate(start.getDate() + 5);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: fmt(start), to: fmt(end) };
  }, []);

  const { data: summaryAttendance, isLoading: summaryLoading } = useQuery({
    queryKey: ["attendance", "summary", summaryWindow.from, summaryWindow.to],
    queryFn: () =>
      getJson<{ attendance: AttendanceRow[] }>(
        `/api/attendance?from=${summaryWindow.from}&to=${summaryWindow.to}`,
      ),
    enabled: tab === "summary",
  });
  const { data: summaryPeople } = useQuery({
    queryKey: ["people"],
    queryFn: () => getJson<{ people: PersonRow[] }>("/api/people"),
    enabled: tab === "summary",
  });

  // Projects the workforce actually worked in during the window (from attendance).
  const workedProjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of summaryAttendance?.attendance ?? []) {
      if (!map.has(r.projectId)) map.set(r.projectId, r.projectName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [summaryAttendance]);

  // null = every worked project selected by default.
  const workedProjectIds = useMemo(() => workedProjects.map((p) => p.id), [workedProjects]);
  const effectiveProjectIds = useMemo(
    () => summarySelection ?? workedProjectIds,
    [summarySelection, workedProjectIds],
  );
  const selectedIdSet = useMemo(() => new Set(effectiveProjectIds), [effectiveProjectIds]);

  /** Per-person PRESENT totals for the Sat→Thu window across the selected projects. */
  const summary = useMemo(() => {
    const typeBy = new Map((summaryPeople?.people ?? []).map((p) => [p.id, p.type]));
    const byPerson = new Map<
      string,
      { name: string; type: PersonType; days: number; halalas: number; projects: Set<string> }
    >();
    const byProject = new Map<string, { name: string; halalas: number; days: number }>();
    for (const r of summaryAttendance?.attendance ?? []) {
      if (r.status !== "PRESENT" || !selectedIdSet.has(r.projectId)) continue;
      const cost = Math.round(r.dailyRate * 100) * r.hours;
      const e = byPerson.get(r.personId) ?? {
        name: r.personName,
        type: typeBy.get(r.personId) ?? "WORKER",
        days: 0,
        halalas: 0,
        projects: new Set<string>(),
      };
      e.days += 1;
      e.halalas += cost;
      e.projects.add(r.projectId);
      byPerson.set(r.personId, e);

      const pe = byProject.get(r.projectId) ?? { name: r.projectName, halalas: 0, days: 0 };
      pe.halalas += cost;
      pe.days += 1;
      byProject.set(r.projectId, pe);
    }
    const rows = [...byPerson.entries()]
      .map(([personId, v]) => ({ personId, ...v, projectCount: v.projects.size }))
      .sort((a, b) => b.halalas - a.halalas);
    const group = (t: PersonType) => rows.filter((r) => r.type === t);
    const sumOf = (rs: typeof rows) => rs.reduce((s, r) => s + r.halalas, 0);
    const craftsmen = group("CRAFTSMAN");
    const workers = group("WORKER");
    return {
      rows,
      craftsmen,
      workers,
      craftsmenHalalas: sumOf(craftsmen),
      workersHalalas: sumOf(workers),
      totalHalalas: sumOf(rows),
      totalDays: rows.reduce((s, r) => s + r.days, 0),
      perProject: [...byProject.entries()].map(([projectId, v]) => ({ projectId, ...v })),
    };
  }, [summaryAttendance, summaryPeople, selectedIdSet]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous column value types need a top type
  const columns = useMemo<LegacyColumnDef<WeekSummary, any>[]>(
    () => [
      columnHelper.accessor("weekNumber", {
        header: "الأسبوع",
        cell: (info) => <span className="font-medium">#{info.getValue() as number}</span>,
      }),
      columnHelper.display({
        id: "period",
        header: "الفترة",
        cell: ({ row }) => (
          <span dir="ltr">
            {row.original.startDate} ← {row.original.endDate}
          </span>
        ),
      }),
      columnHelper.accessor("days", { header: "الأيام" }),
      columnHelper.accessor("halalas", {
        header: "الإجمالي",
        cell: (info) => formatSAR(info.getValue() as number),
      }),
      columnHelper.accessor("paidHalalas", {
        header: "المدفوع",
        cell: (info) => formatSAR(info.getValue() as number),
      }),
      columnHelper.display({
        id: "remaining",
        header: "المتبقي",
        cell: ({ row }) => {
          const remaining = row.original.halalas - row.original.paidHalalas;
          return <span className="font-semibold">{formatSAR(remaining)}</span>;
        },
      }),
      columnHelper.accessor("status", {
        header: "الحالة",
        cell: (info) => {
          const value = info.getValue() as WeekSummary["status"];
          return <Badge variant={STATUS_VARIANTS[value]}>{WEEK_STATUS_LABELS[value]}</Badge>;
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "إجراءات",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedId(row.original.id);
              setShowSettle(false);
            }}
          >
            التفاصيل
          </Button>
        ),
      }),
    ],
    [],
  );

  const tableData = useMemo(() => weeksData?.weeks ?? [], [weeksData?.weeks]);
  const selected = tableData.find((w) => w.id === selectedId) ?? null;
  const selectedRemaining = selected ? selected.halalas - selected.paidHalalas : 0;

  // Weeks eligible for a full-project settlement: OPEN with a remaining balance.
  const settleableWeeks = useMemo(
    () => tableData.filter((w) => w.status === "OPEN" && w.halalas > w.paidHalalas),
    [tableData],
  );
  const settleAllRemaining = settleableWeeks.reduce(
    (s, w) => s + (w.halalas - w.paidHalalas),
    0,
  );

  /** Settle every open week in the project at once (remaining balance per person). */
  async function doSettleAll() {
    setSettleAllBusy(true);
    setSettleAllError(null);
    let done = 0;
    try {
      for (const w of settleableWeeks) {
        const payments = w.dues
          .filter((d) => d.dueHalalas > d.paidHalalas)
          .map((d) => ({ personId: d.personId, amountHalalas: d.dueHalalas - d.paidHalalas }));
        if (payments.length === 0) continue;
        const res = await fetch(`/api/weeks/${w.id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payments, notes: "تسوية كاملة للمشروع" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            `تعذّرت تسوية الأسبوع ${w.weekNumber}: ${body.error ?? "خطأ غير معروف"}`,
          );
        }
        done += 1;
      }
      await queryClient.invalidateQueries({ queryKey: ["weeks", projectId] });
      setSettleAllOpen(false);
      if (done < settleableWeeks.length) {
        setSettleAllError(`تم تسوية ${done} من ${settleableWeeks.length} أسابيع.`);
      }
    } catch (err) {
      await queryClient.invalidateQueries({ queryKey: ["weeks", projectId] });
      setSettleAllError(
        `${err instanceof Error ? err.message : "فشلت التسوية"} (تم إكمال ${done} من ${settleableWeeks.length})`,
      );
    } finally {
      setSettleAllBusy(false);
    }
  }

  async function doVoid() {
    if (!voiding) return;
    setVoidBusy(true);
    setVoidError(null);
    try {
      const res = await fetch(`/api/weeks/${voiding.weekId}/payments/${voiding.paymentId}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVoidError(body.error ?? "فشل الإلغاء");
        return;
      }
      setVoiding(null);
      await queryClient.invalidateQueries({ queryKey: ["weeks", projectId] });
    } finally {
      setVoidBusy(false);
    }
  }

  const table = useLegacyTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    globalFilterFn: "includesString",
  });

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">التسويات الأسبوعية</h1>
          <p className="text-sm text-muted-foreground">مستحقات الأسابيع والمدفوعات المسجلة لكل مشروع</p>
        </div>

        <div className="flex gap-2">
          <Button
            variant={tab === "weeks" ? "default" : "outline"}
            onClick={() => setTab("weeks")}
          >
            الأسابيع
          </Button>
          <Button
            variant={tab === "summary" ? "default" : "outline"}
            onClick={() => setTab("summary")}
          >
            تصفيه شاملة (السبت ← الخميس)
          </Button>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 items-end gap-4 pt-6 sm:grid-cols-2">
            {tab === "weeks" ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="settle-project" className="text-sm font-medium">
                  المشروع
                </label>
                <select
                  id="settle-project"
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setSelectedId(null);
                    setShowSettle(false);
                    setSettleAllOpen(false);
                    setSettleAllError(null);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">اختر المشروع…</option>
                  {(projectsData?.projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    المشاريع المشتغل عليها ({summaryWindow.from} ← {summaryWindow.to})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSummarySelection(
                        effectiveProjectIds.length === workedProjects.length
                          ? []
                          : workedProjects.map((p) => p.id),
                      )
                    }
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {effectiveProjectIds.length === workedProjects.length
                      ? "إلغاء تحديد الكل"
                      : "تحديد كل المشاريع"}
                  </button>
                </div>
                {workedProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    لا توجد مشاريع مسجلة في هذه الفترة.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {workedProjects.map((p) => {
                      const checked = selectedIdSet.has(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                            checked ? "border-primary bg-accent" : "border-input"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? effectiveProjectIds.filter((id) => id !== p.id)
                                : [...effectiveProjectIds, p.id];
                              setSummarySelection(next);
                            }}
                          />
                          <span>{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {tab === "weeks" && canManage && projectId !== "" && settleableWeeks.length > 0 && !settleAllOpen && (
              <div className="flex flex-col gap-1.5 sm:items-end">
                <Button
                  onClick={() => {
                    setSettleAllError(null);
                    setSettleAllOpen(true);
                  }}
                >
                  تسوية كاملة للمشروع ({formatSAR(settleAllRemaining)})
                </Button>
                <p className="text-xs text-muted-foreground">
                  يسدّد المتبقي في {settleableWeeks.length} أسبوع مفتوح ويسدّدها دفعة واحدة
                </p>
              </div>
            )}
            {tab === "weeks" && settleAllOpen && (
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={settleAllBusy} onClick={() => setSettleAllOpen(false)}>
                    إلغاء
                  </Button>
                  <Button disabled={settleAllBusy} onClick={doSettleAll}>
                    {settleAllBusy ? "جارٍ التسوية…" : `تأكيد تسوية ${formatSAR(settleAllRemaining)}`}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  سيُسجَّل السداد لكل أسبوع على حدة باسم «تسوية كاملة للمشروع».
                </p>
              </div>
            )}
          </CardContent>
          {tab === "weeks" && settleAllError && (
            <p className="border-t px-6 pb-4 pt-3 text-sm text-destructive">{settleAllError}</p>
          )}
        </Card>

        {tab === "weeks" && selected && (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>
                الأسبوع {selected.weekNumber} ({selected.startDate} ← {selected.endDate})
              </CardTitle>
              <Badge variant={STATUS_VARIANTS[selected.status]}>{WEEK_STATUS_LABELS[selected.status]}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>
                  الإجمالي: <strong>{formatSAR(selected.halalas)}</strong>
                </span>
                <span>
                  المدفوع: <strong>{formatSAR(selected.paidHalalas)}</strong>
                </span>
                <span>
                  المتبقي: <strong>{formatSAR(selectedRemaining)}</strong>
                </span>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">المستحقات</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-right font-medium">الشخص</th>
                        <th className="py-2 text-right font-medium">الأيام</th>
                        <th className="py-2 text-right font-medium">المستحق</th>
                        <th className="py-2 text-right font-medium">المدفوع</th>
                        <th className="py-2 text-right font-medium">المتبقي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.dues.map((d) => (
                        <tr key={d.personId} className="border-b last:border-0">
                          <td className="py-2">{d.personName}</td>
                          <td className="py-2">{d.days}</td>
                          <td className="py-2">{formatSAR(d.dueHalalas)}</td>
                          <td className="py-2">{formatSAR(d.paidHalalas)}</td>
                          <td className="py-2 font-semibold">{formatSAR(d.dueHalalas - d.paidHalalas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">سجل المدفوعات ({selected.payments.length})</h3>
                {selected.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا مدفوعات مسجلة بعد.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selected.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                      >
                        <span>
                          <span className="font-medium">{p.personName}</span>
                          {" • "}
                          <span className="font-semibold">{formatSAR(p.amountHalalas)}</span>
                          {" • "}
                          <span className="text-muted-foreground" dir="ltr">
                            {p.paidAt.slice(0, 10)}
                          </span>
                          {p.notes && <span className="text-muted-foreground"> • {p.notes}</span>}
                        </span>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() =>
                              setVoiding({
                                weekId: selected.id,
                                paymentId: p.id,
                                label: `${p.personName} — ${formatSAR(p.amountHalalas)}`,
                              })
                            }
                          >
                            حذف
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {canManage && selected.status === "OPEN" && selectedRemaining > 0 && !showSettle && (
                  <Button onClick={() => setShowSettle(true)}>تسوية</Button>
                )}
                <Button variant="outline" onClick={() => window.print()}>
                  طباعة الكشف
                </Button>
              </div>
              {showSettle && (
                <SettleForm projectId={projectId} week={selected} onDone={() => setShowSettle(false)} />
              )}
            </CardContent>
          </Card>
        )}

        <ConfirmDialog
          open={voiding !== null}
          title="إلغاء الدفعة"
          message={voiding ? `هل أنت متأكد من إلغاء دفعة ${voiding.label}؟ سيُعاد فتح الأسبوع إذا ظهر رصيد مستحق.` : ""}
          confirmLabel="إلغاء الدفعة"
          error={voidError}
          busy={voidBusy}
          onConfirm={doVoid}
          onCancel={() => {
            if (!voidBusy) setVoiding(null);
          }}
        />

        {tab === "weeks" && !projectId && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                اختر المشروع لعرض أسابيعه وتسوية المستحقات.
              </p>
            </CardContent>
          </Card>
        )}

        {tab === "weeks" && projectId && weeksLoading && (
          <Card>
            <CardContent className="pt-6">
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        )}

        {tab === "weeks" && projectId && weeksData && (
          <DataTable
            table={table}
            searchValue={globalFilter}
            onSearchChange={(value) => {
              setGlobalFilter(value);
              table.setPageIndex(0);
            }}
            searchPlaceholder="بحث…"
            emptyMessage="لا توجد أسابيع مسجلة لهذا المشروع بعد."
          />
        )}

        {tab === "summary" && summaryLoading && (
          <Card>
            <CardContent className="pt-6">
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        )}

        {tab === "summary" && !summaryLoading && effectiveProjectIds.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                {workedProjects.length === 0
                  ? "لا توجد مشاريع مسجلة في هذه الفترة."
                  : "حدّد مشروعًا واحدًا على الأقل لعرض التصفيه."}
              </p>
            </CardContent>
          </Card>
        )}

        {tab === "summary" && !summaryLoading && effectiveProjectIds.length > 0 && (
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>
                تصفيه شاملة ({summaryWindow.from} ← {summaryWindow.to})
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  الصنايعية: {summary.craftsmen.length} — {formatSAR(summary.craftsmenHalalas)}
                </Badge>
                <Badge variant="secondary">
                  العمال: {summary.workers.length} — {formatSAR(summary.workersHalalas)}
                </Badge>
                <Badge variant="outline">الإجمالي: {formatSAR(summary.totalHalalas)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {summary.perProject.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">إجمالي كل مشروع</h3>
                  <div className="flex flex-wrap gap-2">
                    {summary.perProject.map((p) => (
                      <span
                        key={p.projectId}
                        className="rounded-md border px-3 py-1.5 text-sm"
                      >
                        {p.name}: <strong>{formatSAR(p.halalas)}</strong> — {p.days} يوم
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {summary.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد أيام حضور مسجلة في هذه الفترة.</p>
              ) : (
                (["CRAFTSMAN", "WORKER"] as const).map((group) => {
                  const rows = group === "CRAFTSMAN" ? summary.craftsmen : summary.workers;
                  if (rows.length === 0) return null;
                  const groupHalalas = group === "CRAFTSMAN" ? summary.craftsmenHalalas : summary.workersHalalas;
                  return (
                    <div key={group}>
                      <h3 className="mb-2 text-sm font-medium">
                        {PERSON_TYPE_LABELS[group]} ({rows.length})
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="py-2 text-right font-medium">الشخص</th>
                              <th className="py-2 text-right font-medium">أيام الحضور</th>
                              <th className="py-2 text-right font-medium">المشاريع</th>
                              <th className="py-2 text-right font-medium">الإجمالي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.personId} className="border-b last:border-0">
                                <td className="py-2">{r.name}</td>
                                <td className="py-2">{r.days}</td>
                                <td className="py-2">{r.projectCount}</td>
                                <td className="py-2 font-semibold">{formatSAR(r.halalas)}</td>
                              </tr>
                            ))}
                            <tr className="border-t">
                              <td className="py-2 font-bold">إجمالي {PERSON_TYPE_LABELS[group]}</td>
                              <td className="py-2">{rows.reduce((s, r) => s + r.days, 0)}</td>
                              <td className="py-2" />
                              <td className="py-2 font-bold">{formatSAR(groupHalalas)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>
                  أيام الحضور: <strong>{summary.totalDays}</strong>
                </span>
                <span>
                  إجمالي الصنايعية: <strong>{formatSAR(summary.craftsmenHalalas)}</strong>
                </span>
                <span>
                  إجمالي العمال: <strong>{formatSAR(summary.workersHalalas)}</strong>
                </span>
                <span>
                  الإجمالي العام: <strong>{formatSAR(summary.totalHalalas)}</strong>
                </span>
              </div>
              <div>
                <Button variant="outline" onClick={() => window.print()}>
                  طباعة الكشف
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {tab === "weeks" && selected && (
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">الوكيل — كشف تسوية أسبوع</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selected.projectName} • الأسبوع {selected.weekNumber} ({selected.startDate} ← {selected.endDate}) •
            الحالة: {WEEK_STATUS_LABELS[selected.status]} • تاريخ الطباعة:{" "}
            {new Date().toISOString().slice(0, 10)}
          </p>
          {(["CRAFTSMAN", "WORKER"] as const).map((group) => {
            const rows = selected.dues.filter((d) => d.type === group);
            if (rows.length === 0) return null;
            const groupDue = rows.reduce((s, d) => s + d.dueHalalas, 0);
            const groupPaid = rows.reduce((s, d) => s + d.paidHalalas, 0);
            return (
              <div key={group} className="mt-4">
                <h2 className="font-bold">
                  {PERSON_TYPE_LABELS[group]} ({rows.length})
                </h2>
                <table className="mt-1 w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-right font-medium">الشخص</th>
                      <th className="py-2 text-right font-medium">الأيام</th>
                      <th className="py-2 text-right font-medium">المستحق</th>
                      <th className="py-2 text-right font-medium">المدفوع</th>
                      <th className="py-2 text-right font-medium">المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.personId} className="border-b">
                        <td className="py-2">{d.personName}</td>
                        <td className="py-2">{d.days}</td>
                        <td className="py-2">{formatSAR(d.dueHalalas)}</td>
                        <td className="py-2">{formatSAR(d.paidHalalas)}</td>
                        <td className="py-2 font-semibold">{formatSAR(d.dueHalalas - d.paidHalalas)}</td>
                      </tr>
                    ))}
                    <tr className="border-t">
                      <td className="py-2 font-bold">إجمالي {PERSON_TYPE_LABELS[group]}</td>
                      <td className="py-2" />
                      <td className="py-2 font-bold">{formatSAR(groupDue)}</td>
                      <td className="py-2 font-bold">{formatSAR(groupPaid)}</td>
                      <td className="py-2 font-bold">{formatSAR(groupDue - groupPaid)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
          <p className="mt-3 text-sm font-bold">
            الإجمالي: {formatSAR(selected.halalas)} • المدفوع: {formatSAR(selected.paidHalalas)} • المتبقي:{" "}
            {formatSAR(selected.halalas - selected.paidHalalas)}
          </p>
          {selected.payments.length > 0 && (
            <>
              <h2 className="mt-4 font-bold">المدفوعات</h2>
              {selected.payments.map((p) => (
                <p key={p.id} className="text-sm">
                  {p.personName} — {formatSAR(p.amountHalalas)} — {p.paidAt.slice(0, 10)}
                  {p.notes ? ` — ${p.notes}` : ""}
                </p>
              ))}
            </>
          )}
          <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
            <div>
              <p>توقيع المشرف: ........................</p>
              <p className="mt-1">الاسم: ........................</p>
            </div>
            <div>
              <p>توقيع أمين الصندوق: ........................</p>
              <p className="mt-1">الاسم: ........................</p>
            </div>
          </div>
        </div>
      )}

      {tab === "summary" && effectiveProjectIds.length > 0 && summary.rows.length > 0 && (
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">الوكيل — تصفيه شاملة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            المشاريع: {summary.perProject.map((p) => p.name).join(" • ")} • من {summaryWindow.from} إلى{" "}
            {summaryWindow.to} (السبت ← الخميس) • تاريخ الطباعة: {new Date().toISOString().slice(0, 10)}
          </p>
          <div className="mt-3">
            <h2 className="font-bold">إجمالي كل مشروع</h2>
            <table className="mt-1 w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-right font-medium">المشروع</th>
                  <th className="py-2 text-right font-medium">أيام الحضور</th>
                  <th className="py-2 text-right font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {summary.perProject.map((p) => (
                  <tr key={p.projectId} className="border-b">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2">{p.days}</td>
                    <td className="py-2 font-semibold">{formatSAR(p.halalas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(["CRAFTSMAN", "WORKER"] as const).map((group) => {
            const rows = group === "CRAFTSMAN" ? summary.craftsmen : summary.workers;
            if (rows.length === 0) return null;
            const groupHalalas = group === "CRAFTSMAN" ? summary.craftsmenHalalas : summary.workersHalalas;
            const groupDays = rows.reduce((s, r) => s + r.days, 0);
            return (
              <div key={group} className="mt-4">
                <h2 className="font-bold">
                  {PERSON_TYPE_LABELS[group]} ({rows.length})
                </h2>
                <table className="mt-1 w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-right font-medium">الشخص</th>
                      <th className="py-2 text-right font-medium">أيام الحضور</th>
                      <th className="py-2 text-right font-medium">المشاريع</th>
                      <th className="py-2 text-right font-medium">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.personId} className="border-b">
                        <td className="py-2">{r.name}</td>
                        <td className="py-2">{r.days}</td>
                        <td className="py-2">{r.projectCount}</td>
                        <td className="py-2 font-semibold">{formatSAR(r.halalas)}</td>
                      </tr>
                    ))}
                    <tr className="border-t">
                      <td className="py-2 font-bold">إجمالي {PERSON_TYPE_LABELS[group]}</td>
                      <td className="py-2 font-bold">{groupDays}</td>
                      <td className="py-2" />
                      <td className="py-2 font-bold">{formatSAR(groupHalalas)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
          <p className="mt-3 text-sm font-bold">
            إجمالي الصنايعية: {formatSAR(summary.craftsmenHalalas)} • إجمالي العمال:{" "}
            {formatSAR(summary.workersHalalas)} • الإجمالي العام: {formatSAR(summary.totalHalalas)}
          </p>
          <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
            <div>
              <p>توقيع المشرف: ........................</p>
              <p className="mt-1">الاسم: ........................</p>
            </div>
            <div>
              <p>توقيع أمين الصندوق: ........................</p>
              <p className="mt-1">الاسم: ........................</p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
