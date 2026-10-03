/*
 * CSV builder tests: BOM for Excel Arabic, quoting rules, matrix shape.
 */
import { describe, expect, it } from "vitest";
import { buildMatrixCsv, CSV_BOM, escapeCsvCell } from "@/lib/csv";

describe("CSV helpers", () => {
  it("uses a real BOM codepoint (not an empty string)", () => {
    expect(CSV_BOM.length).toBe(1);
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
  });

  it("escapes commas, quotes, and newlines", () => {
    expect(escapeCsvCell("simple")).toBe("simple");
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('قال "نعم"')).toBe('"قال ""نعم"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell(1200)).toBe("1200");
  });

  it("builds the matrix with BOM, rows, and a totals row", () => {
    const csv = buildMatrixCsv({
      projectNames: ["مشروع أ", "مشروع, ب"],
      rows: [
        { name: "أحمد حسن", cells: [5, 3], days: 8, halalas: 160000 },
        { name: "محمد علي", cells: [0, 2], days: 2, halalas: 30000 },
      ],
      grandTotalHalalas: 190000,
    });
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe('الشخص,مشروع أ,"مشروع, ب",إجمالي الأيام,إجمالي المبلغ (ر.س)');
    expect(lines[1]).toBe("أحمد حسن,5,3,8,1600.00");
    expect(lines[2]).toBe("محمد علي,0,2,2,300.00");
    expect(lines[3]).toBe("الإجمالي,5,5,10,1900.00");
  });
});
