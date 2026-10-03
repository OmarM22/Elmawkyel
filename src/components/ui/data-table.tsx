"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { flexRender } from "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";
import type { LegacyReactTable } from "@tanstack/react-table/legacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DataTableProps<TData extends RowData> {
  table: LegacyReactTable<TData>;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

const PAGE_SIZES = [10, 20, 50];

/*
 * Reusable shadcn-styled table shell (TanStack Table v9 legacy API).
 * Headless logic lives in the table instance; this only renders
 * headers (with sort toggles), rows, search, and pagination — RTL-first.
 */
export function DataTable<TData extends RowData>({
  table,
  searchValue,
  onSearchChange,
  searchPlaceholder = "بحث…",
  emptyMessage = "لا توجد بيانات.",
}: DataTableProps<TData>) {
  const columnCount = table.getAllLeafColumns().length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="flex flex-col gap-4">
      {onSearchChange && (
        <Input
          value={searchValue ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="max-w-sm"
          aria-label={searchPlaceholder}
        />
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50 text-muted-foreground">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={cn(
                      "px-3 py-2 text-right font-medium",
                      header.column.getCanSort() && "cursor-pointer select-none",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() &&
                        (header.column.getIsSorted() === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="size-3.5" />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          عدد الصفوف:
          <select
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="flex h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحة {pageIndex + 1} من {Math.max(pageCount, 1)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            التالي
          </Button>
        </div>
      </div>
    </div>
  );
}
