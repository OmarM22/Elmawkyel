"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
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
  const { data, isLoading, isError } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const canManage = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);

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
