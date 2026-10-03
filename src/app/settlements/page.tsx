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
import { WEEK_STATUS_LABELS, type ProjectRow, type WeekSummary } from "@/types";
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
  const canManage = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";
  const isAdmin = session?.user?.role === "ADMIN";

  const [projectId, setProjectId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettle, setShowSettle] = useState(false);
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

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
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
          </CardContent>
        </Card>

        {selected && (
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

        {!projectId && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">اختر المشروع لعرض أسابيعه وتسوية المستحقات.</p>
            </CardContent>
          </Card>
        )}

        {projectId && weeksLoading && (
          <Card>
            <CardContent className="pt-6">
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        )}

        {projectId && weeksData && (
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
      </div>

      {selected && (
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">الوكيل — كشف تسوية أسبوع</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selected.projectName} • الأسبوع {selected.weekNumber} ({selected.startDate} ← {selected.endDate}) •
            الحالة: {WEEK_STATUS_LABELS[selected.status]} • تاريخ الطباعة:{" "}
            {new Date().toISOString().slice(0, 10)}
          </p>
          <table className="mt-4 w-full text-sm">
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
              {selected.dues.map((d) => (
                <tr key={d.personId} className="border-b">
                  <td className="py-2">{d.personName}</td>
                  <td className="py-2">{d.days}</td>
                  <td className="py-2">{formatSAR(d.dueHalalas)}</td>
                  <td className="py-2">{formatSAR(d.paidHalalas)}</td>
                  <td className="py-2 font-semibold">{formatSAR(d.dueHalalas - d.paidHalalas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </AppShell>
  );
}
