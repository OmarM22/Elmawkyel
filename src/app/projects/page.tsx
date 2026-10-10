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
import type { PaginationState, SortingState } from "@tanstack/react-table";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { DAY_OF_WEEK_LABELS, PROJECT_STATUS_LABELS, type ProjectRow } from "@/types";
import { ProjectForm } from "./project-form";

async function fetchProjects(): Promise<{ projects: ProjectRow[] }> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

const STATUS_VARIANTS: Record<ProjectRow["status"], "success" | "secondary" | "warning" | "destructive"> = {
  ACTIVE: "success",
  COMPLETED: "secondary",
  ON_HOLD: "warning",
  CANCELLED: "destructive",
};

const columnHelper = legacyCreateColumnHelper<ProjectRow>();

export default function ProjectsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const canManage = session?.user?.role === "ADMIN";

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [forceMode, setForceMode] = useState(false);
  const isAdmin = session?.user?.role === "ADMIN";

  const doDelete = useCallback(async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const url = `/api/projects/${deleting.id}${forceMode ? "?force=true" : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 on a project with history → escalate to the force step (ADMIN).
        if (res.status === 409 && !forceMode && isAdmin) {
          setForceMode(true);
          setDeleteError(body.error ?? "لا يمكن حذف هذا المشروع");
        } else {
          setDeleteError(body.error ?? "فشل الحذف");
        }
        return;
      }
      setDeleting(null);
      setForceMode(false);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleting, forceMode, isAdmin, queryClient]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous column value types need a top type
  const columns = useMemo<LegacyColumnDef<ProjectRow, any>[]>(
    () => [
      columnHelper.accessor("name", {
        header: "المشروع",
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor("status", {
        header: "الحالة",
        cell: (info) => {
          const value = info.getValue() as ProjectRow["status"];
          return <Badge variant={STATUS_VARIANTS[value]}>{PROJECT_STATUS_LABELS[value]}</Badge>;
        },
      }),
      columnHelper.accessor("startDate", {
        header: "البداية",
        cell: (info) => <span dir="ltr">{info.getValue()}</span>,
      }),
      columnHelper.accessor("endDate", {
        header: "النهاية",
        cell: (info) => <span dir="ltr">{info.getValue() ?? "مفتوح"}</span>,
      }),
      columnHelper.accessor("workingDays", {
        header: "أيام العمل",
        enableSorting: false,
        cell: (info) => (
          <span className="inline-flex flex-wrap gap-1">
            {(info.getValue() as string[]).map((d) => (
              <Badge key={d} variant="outline">
                {DAY_OF_WEEK_LABELS[d] || d}
              </Badge>
            ))}
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
              <Link href={`/projects/${row.original.id}`}>التفاصيل</Link>
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
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setDeleteError(null);
                  setForceMode(false);
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
    [canManage],
  );

  const tableData = useMemo(() => data?.projects ?? [], [data?.projects]);

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
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">المشاريع</h1>
            <p className="text-sm text-muted-foreground">مشاريع المقاولات وأيام العمل لكل مشروع</p>
          </div>
          {canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              إضافة مشروع
            </Button>
          )}
        </div>

        {showForm && (
          <ProjectForm
            initial={editing}
            onDone={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
        )}

        <ConfirmDialog
          open={deleting !== null}
          title={forceMode ? "حذف نهائي مع السجلات" : "حذف المشروع"}
          message={
            deleting
              ? forceMode
                ? `هذا المشروع له سجلات حضور ومدفوعات. الحذف النهائي سيمسح كل سجلاته نهائياً (${deleting.name}). هل أنت متأكد؟`
                : `هل أنت متأكد من حذف ${deleting.name}؟ لا يمكن التراجع عن الحذف.`
              : ""
          }
          confirmLabel={forceMode ? "حذف نهائي" : "حذف"}
          error={deleteError}
          busy={deleteBusy}
          onConfirm={doDelete}
          onCancel={() => {
            if (!deleteBusy) {
              setDeleting(null);
              setForceMode(false);
              setDeleteError(null);
            }
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
          <DataTable
            table={table}
            searchValue={globalFilter}
            onSearchChange={(value) => {
              setGlobalFilter(value);
              table.setPageIndex(0);
            }}
            searchPlaceholder="بحث باسم المشروع…"
            emptyMessage={globalFilter ? "لا نتائج مطابقة للبحث." : "لا توجد مشاريع مسجلة بعد."}
          />
        )}
      </div>
    </AppShell>
  );
}
