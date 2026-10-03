// @vitest-environment jsdom
/*
 * Reports page tests: honest title, date-range narrowing, detail links.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "@/app/reports/page";
import type { AttendanceRow } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/reports",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const people = [{ id: "p1", name: "أحمد حسن", type: "CRAFTSMAN", phone: null, active: true, currentDailyRate: 200 }];
const projects = [
  { id: "pr1", name: "مشروع", startDate: "2026-09-01", endDate: null, status: "ACTIVE", workingDays: ["SUNDAY"] },
];

const base = {
  personId: "p1",
  personName: "أحمد حسن",
  projectId: "pr1",
  projectName: "مشروع",
  dailyRate: 200,
  hours: 1,
  notes: null,
} as const;

const allRows: AttendanceRow[] = [
  { ...base, id: "a1", date: "2026-09-15", status: "PRESENT" },
  { ...base, id: "a2", date: "2026-10-03", status: "PRESENT" },
];

function renderPage() {
  global.fetch = vi.fn(async (url: string) => {
    if (url.startsWith("/api/people")) return { ok: true, json: async () => ({ people }) };
    if (url.startsWith("/api/projects")) return { ok: true, json: async () => ({ projects }) };
    const u = new URL(url, "http://localhost");
    const from = u.searchParams.get("from");
    const to = u.searchParams.get("to");
    const rows = allRows.filter(
      (r) => (!from || r.date >= from) && (!to || r.date <= to),
    );
    return { ok: true, json: async () => ({ attendance: rows }) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ReportsPage />, { wrapper });
}

describe("ReportsPage", () => {
  afterEach(() => cleanup());

  it("shows all-time totals by default with detail links", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("التقرير الشامل (كل الفترات)")).toBeTruthy());
    expect(screen.getByText("الإجمالي: 400.00 ر.س")).toBeTruthy();
    expect(container.querySelector('a[href="/people/p1"]')).toBeTruthy();
    expect(container.querySelector('a[href="/projects/pr1"]')).toBeTruthy();
  });

  it("narrows totals when a date range is set", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("الإجمالي: 400.00 ر.س")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("من تاريخ"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(screen.getByText("الإجمالي: 200.00 ر.س")).toBeTruthy());
    expect(screen.getByText("التقرير الشامل (2026-10-01 ← اليوم)")).toBeTruthy();
  });

  it("exports the matrix as Excel-compatible CSV", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("الإجمالي: 400.00 ر.س")).toBeTruthy());
    const createSpy = vi.fn(() => "blob:mock");
    const revokeSpy = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const clicked: Element[] = [];
    const onDocClick = (e: MouseEvent) => {
      if (e.target instanceof Element) clicked.push(e.target);
    };
    document.addEventListener("click", onDocClick);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createSpy });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: revokeSpy });
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      writable: true,
      // Re-dispatch without jsdom's (unimplemented) navigation default.
      value: function (this: HTMLAnchorElement) {
        this.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      },
    });
    try {
      fireEvent.click(screen.getByText("تصدير CSV"));
      let anchor: HTMLAnchorElement | null = null;
      await waitFor(() => {
        anchor = (clicked.find((el) => el.tagName === "A") ?? null) as HTMLAnchorElement | null;
        expect(anchor).not.toBeNull();
      });
      expect(anchor!.getAttribute("download")).toMatch(/^alwakeel-report-all-all\.csv$/);
      expect(anchor!.getAttribute("href")).toBe("blob:mock");
      // Note: Blob.text() strips the BOM by spec; BOM bytes are covered in csv.test.ts.
      const calls = createSpy.mock.calls as unknown[][];
      expect(calls.length).toBeGreaterThan(0);
      const text = await (calls[0][0] as Blob).text();
      expect(text).toContain("الشخص,مشروع,إجمالي الأيام,إجمالي المبلغ (ر.س)");
      expect(text).toContain("أحمد حسن,2,2,400.00");
    } finally {
      document.removeEventListener("click", onDocClick);
      Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: origCreate });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: origRevoke });
      Object.defineProperty(HTMLAnchorElement.prototype, "click", { configurable: true, writable: true, value: origClick });
    }
  });

  it("calls window.print from the print button", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("الإجمالي: 400.00 ر.س")).toBeTruthy());
    const spy = vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByText("طباعة"));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
