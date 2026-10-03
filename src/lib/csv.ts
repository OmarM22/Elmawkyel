/*
 * CSV export helpers. Output starts with a BOM so Arabic renders correctly
 * in Excel, uses plain (unformatted) numbers for computability, and quotes
 * any cell containing a comma, quote, or newline.
 */

/** UTF-8 byte-order mark for Excel Arabic support. */
export const CSV_BOM = "\uFEFF";

export function escapeCsvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface MatrixCsvRow {
  name: string;
  cells: number[];
  days: number;
  halalas: number;
}

/** Person×project matrix as CSV: day counts, totals, and a grand-total row. */
export function buildMatrixCsv(args: {
  projectNames: string[];
  rows: MatrixCsvRow[];
  grandTotalHalalas: number;
}): string {
  const header = ["الشخص", ...args.projectNames, "إجمالي الأيام", "إجمالي المبلغ (ر.س)"];
  const lines = [header.map(escapeCsvCell).join(",")];
  for (const r of args.rows) {
    lines.push(
      [
        r.name,
        ...r.cells,
        r.days,
        (r.halalas / 100).toFixed(2),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  const colSums = args.projectNames.map((_, i) => args.rows.reduce((s, r) => s + (r.cells[i] ?? 0), 0));
  const totalDays = args.rows.reduce((s, r) => s + r.days, 0);
  lines.push(
    ["الإجمالي", ...colSums, totalDays, (args.grandTotalHalalas / 100).toFixed(2)]
      .map(escapeCsvCell)
      .join(","),
  );
  return `${CSV_BOM}${lines.join("\n")}\n`;
}
