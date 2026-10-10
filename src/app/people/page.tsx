"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
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
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import type { ColumnFiltersState, PaginationState, SortingState } from "@tanstack/react-table";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { formatSAR, toHalalas } from "@/lib/money";
import { PERSON_TYPE_LABELS, type PersonRow } from "@/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PersonForm } from "./person-form";

async function fetchPeople(): Promise<{ people: PersonRow[] }> {
  const res = await fetch("/api/people");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

const columnHelper = legacyCreateColumnHelper<PersonRow>();

export default function PeoplePage() {
  const { data: session } = useSession();
  const { data, isLoading, isError } = useQuery({ queryKey: ["people"], queryFn: fetchPeople });
  const canManage = session?.user?.role === "ADMIN";

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PersonRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const toggleActive = useCallback(
    async (person: PersonRow) => {
      setTogglingId(person.id);
      try {
        await fetch(`/api/people/${person.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !person.active }),
        });
        await queryClient.invalidateQueries({ queryKey: ["people"] });
      } finally {
        setTogglingId(null);
      }
    },
    [queryClient],
  );

  const doDelete = useCallback(async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/people/${deleting.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(body.error ?? "فشل الحذف");
        return;
      }
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleting, queryClient]);

  // Stable column definitions (skill: never recreate per render).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous column value types need a top type
  const columns = useMemo<LegacyColumnDef<PersonRow, any>[]>(
    () => [
      columnHelper.accessor("name", {
        header: "الاسم",
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor("type", {
        header: "النوع",
        filterFn: (row, columnId, filterValue) => row.getValue(columnId) === filterValue,
        cell: (info) => {
          const value = info.getValue() as PersonRow["type"];
          return (
            <Badge variant={value === "CRAFTSMAN" ? "default" : "secondary"}>
              {PERSON_TYPE_LABELS[value]}
            </Badge>
          );
        },
      }),
      columnHelper.accessor("phone", {
        header: "الهاتف",
        cell: (info) => <span dir="ltr">{info.getValue() ?? "—"}</span>,
      }),
      columnHelper.accessor("currentDailyRate", {
        header: "الأجر اليومي",
        cell: (info) => formatSAR(toHalalas(info.getValue())),
      }),
      columnHelper.accessor("active", {
        header: "الحالة",
        filterFn: (row, columnId, filterValue) =>
          (filterValue === "active") === (row.getValue(columnId) as boolean),
        cell: (info) => (
          <span className={cn("text-xs font-medium", info.getValue() ? "text-success" : "text-destructive")}>
            {info.getValue() ? "نشط" : "غير نشط"}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "إجراءات",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/people/${row.original.id}`}>التفاصيل والسجل</Link>
            </Button>
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(row.original);
                  setShowForm(true);
                }}
              >
                تعديل
              </Button>
            )}
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                disabled={togglingId === row.original.id}
                onClick={() => toggleActive(row.original)}
              >
                {togglingId === row.original.id ? "…" : row.original.active ? "إيقاف" : "تفعيل"}
              </Button>
            )}
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setDeleteError(null);
                  setDeleting(row.original);
                }}
              >
                حذف
              </Button>
            )}
          </span>
        ),
      }),
    ],
    [canManage, toggleActive, togglingId],
  );

  // Stable data reference (skill: memoize query results).
  const tableData = useMemo(() => data?.people ?? [], [data?.people]);

  const table = useLegacyTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    globalFilterFn: "includesString",
  });

  const hasActiveFilter = globalFilter !== "" || columnFilters.length > 0;

  function setColumnFilter(columnId: string, value: string) {
    table.getColumn(columnId)?.setFilterValue(value === "all" ? undefined : value);
    table.setPageIndex(0);
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">الأشخاص</h1>
            <p className="text-sm text-muted-foreground">العمال والصنايعية والأجور اليومية</p>
          </div>
          {canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              إضافة شخص
            </Button>
          )}
        </div>

        {showForm && (
          <PersonForm
            initial={editing}
            onDone={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
        )}

        <ConfirmDialog
          open={deleting !== null}
          title="حذف الشخص"
          message={
            deleting
              ? `هل أنت متأكد من حذف ${deleting.name}؟ لا يمكن التراجع عن الحذف.`
              : ""
          }
          confirmLabel="حذف"
          error={deleteError}
          busy={deleteBusy}
          onConfirm={doDelete}
          onCancel={() => {
            if (!deleteBusy) setDeleting(null);
          }}
        />

        {isLoading && (
          <Card>
            <CardContent className="pt-6">
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        )}

        {isError && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">تعذر تحميل البيانات.</p>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="النوع"
                value={String(table.getColumn("type")?.getFilterValue() ?? "all")}
                onChange={(e) => setColumnFilter("type", e.target.value)}
                className="flex h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">كل الأنواع</option>
                <option value="CRAFTSMAN">صنايعي</option>
                <option value="WORKER">عامل</option>
              </select>
              <select
                aria-label="الحالة"
                value={String(table.getColumn("active")?.getFilterValue() ?? "all")}
                onChange={(e) => setColumnFilter("active", e.target.value)}
                className="flex h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">كل الحالات</option>
                <option value="active">نشط</option>
                <option value="inactive">غير نشط</option>
              </select>
            </div>
            <DataTable
              table={table}
              searchValue={globalFilter}
              onSearchChange={(value) => {
                setGlobalFilter(value);
                table.setPageIndex(0);
              }}
              searchPlaceholder="بحث بالاسم أو الهاتف…"
              emptyMessage={hasActiveFilter ? "لا نتائج مطابقة للبحث." : "لا يوجد أشخاص مسجلون بعد."}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
