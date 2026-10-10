// @vitest-environment jsdom
/*
 * Settlements page tests: week detail (dues + payment ledger) and the
 * ADMIN-only void flow through the confirmation dialog.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettlementsPage from "@/app/settlements/page";
import type { WeekSummary } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settlements",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const project = {
  id: "pr1",
  name: "مشروع",
  startDate: "2026-09-01",
  endDate: null,
  status: "ACTIVE",
  workingDays: ["SATURDAY"],
};

function makeWeeks(): WeekSummary[] {
  return [
    {
      id: "pr1:5",
      projectId: "pr1",
      projectName: "مشروع",
      weekNumber: 5,
      startDate: "2026-09-29",
      endDate: "2026-10-05",
      status: "OPEN",
      days: 2,
      halalas: 35000,
      paidHalalas: 20000,
      dues: [
        { personId: "p1", personName: "أحمد حسن", type: "CRAFTSMAN", days: 1, dueHalalas: 20000, paidHalalas: 20000 },
        { personId: "p2", personName: "محمد علي", type: "WORKER", days: 1, dueHalalas: 15000, paidHalalas: 0 },
      ],
      payments: [
        { id: "pay1", personId: "p1", personName: "أحمد حسن", amountHalalas: 20000, paidAt: "2026-10-04T10:00:00.000Z", notes: "نقدي" },
      ],
    },
  ];
}

let weeks: WeekSummary[] = makeWeeks();

const summaryAttendance = [
  { id: "a1", personId: "p1", personName: "أحمد حسن", projectId: "pr1", projectName: "مشروع", date: "2026-10-03", status: "PRESENT", dailyRate: 200, hours: 1, notes: null },
  { id: "a2", personId: "p1", personName: "أحمد حسن", projectId: "pr1", projectName: "مشروع", date: "2026-10-04", status: "PRESENT", dailyRate: 200, hours: 1, notes: null },
  { id: "a3", personId: "p2", personName: "محمد علي", projectId: "pr1", projectName: "مشروع", date: "2026-10-03", status: "PRESENT", dailyRate: 150, hours: 1, notes: null },
  { id: "a4", personId: "p3", personName: "سالم ناصر", projectId: "pr1", projectName: "مشروع", date: "2026-10-03", status: "LEAVE", dailyRate: 100, hours: 0, notes: null },
  { id: "a5", personId: "p2", personName: "محمد علي", projectId: "pr2", projectName: "مشروع آخر", date: "2026-10-04", status: "PRESENT", dailyRate: 100, hours: 1, notes: null },
  { id: "a6", personId: "p4", personName: "خالد سعيد", projectId: "pr2", projectName: "مشروع آخر", date: "2026-10-03", status: "PRESENT", dailyRate: 120, hours: 1, notes: null },
];

const summaryPeople = [
  { id: "p1", name: "أحمد حسن", type: "CRAFTSMAN", phone: null, active: true, currentDailyRate: 200 },
  { id: "p2", name: "محمد علي", type: "WORKER", phone: null, active: true, currentDailyRate: 150 },
  { id: "p3", name: "سالم ناصر", type: "WORKER", phone: null, active: true, currentDailyRate: 100 },
  { id: "p4", name: "خالد سعيد", type: "WORKER", phone: null, active: true, currentDailyRate: 120 },
];

function renderPage() {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/projects")) return { ok: true, json: async () => ({ projects: [project] }) };
    if (url.startsWith("/api/attendance")) return { ok: true, json: async () => ({ attendance: summaryAttendance }) };
    if (url.startsWith("/api/people")) return { ok: true, json: async () => ({ people: summaryPeople }) };
    if (init?.method === "DELETE") {
      weeks = weeks.map((w) =>
        w.id === "pr1:5"
          ? { ...w, status: "OPEN" as const, paidHalalas: 0, payments: [], dues: w.dues.map((d) => ({ ...d, paidHalalas: 0 })) }
          : w,
      );
      return { ok: true, json: async () => ({ success: true }) };
    }
    if (url.startsWith("/api/weeks")) return { ok: true, json: async () => ({ weeks }) };
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<SettlementsPage />, { wrapper });
}

describe("SettlementsPage", () => {
  beforeEach(() => {
    weeks = makeWeeks();
  });
  afterEach(() => cleanup());

  it("shows dues and the payment ledger for the selected week", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("مشروع")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("المشروع"), { target: { value: "pr1" } });
    await waitFor(() => expect(screen.getByText("التفاصيل")).toBeTruthy());
    fireEvent.click(screen.getByText("التفاصيل"));
    await waitFor(() => expect(screen.getByText("سجل المدفوعات (1)")).toBeTruthy());
    expect(screen.getAllByText("نقدي", { exact: false }).length).toBeGreaterThanOrEqual(2); // ledger + print slip
    expect(screen.getAllByText("200.00 ر.س").length).toBeGreaterThanOrEqual(2); // dues row + ledger row
  });

  it("voids a payment through the confirmation dialog", async () => {    renderPage();
    await waitFor(() => expect(screen.getByText("مشروع")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("المشروع"), { target: { value: "pr1" } });
    await waitFor(() => expect(screen.getByText("التفاصيل")).toBeTruthy());
    fireEvent.click(screen.getByText("التفاصيل"));
    await waitFor(() => expect(screen.getByText("سجل المدفوعات (1)")).toBeTruthy());
    fireEvent.click(screen.getByText("حذف"));
    await waitFor(() => expect(screen.getByText("هل أنت متأكد من إلغاء دفعة", { exact: false })).toBeTruthy());
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء الدفعة" }));
    await waitFor(() =>
      expect(
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => (c[1] as RequestInit)?.method === "DELETE" && String(c[0]).includes("pay1"),
        ),
      ).toBe(true),
    );
  });

  it("settles every open week at once via تسوية كاملة للمشروع", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("مشروع")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("المشروع"), { target: { value: "pr1" } });
    await waitFor(() => expect(screen.getByText(/تسوية كاملة للمشروع/)).toBeTruthy());
    const settleBtn = screen.getByRole("button", { name: /تسوية كاملة للمشروع/ });
    expect(settleBtn.textContent).toContain("150.00 ر.س"); // remaining balance shown
    fireEvent.click(settleBtn);
    await waitFor(() => expect(screen.getByText(/تأكيد تسوية 150\.00 ر\.س/)).toBeTruthy());
    fireEvent.click(screen.getByText(/تأكيد تسوية 150\.00 ر\.س/));
    await waitFor(() => {
      const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]).includes("/api/weeks/pr1:5/payments") && (c[1] as RequestInit)?.method === "POST",
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.payments).toEqual([{ personId: "p2", amountHalalas: 15000 }]);
      expect(body.notes).toBe("تسوية كاملة للمشروع");
    });
  });

  it("renders the printable slip and calls window.print", async () => {    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("مشروع")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("المشروع"), { target: { value: "pr1" } });
    await waitFor(() => expect(screen.getByText("التفاصيل")).toBeTruthy());
    fireEvent.click(screen.getByText("التفاصيل"));
    await waitFor(() => expect(screen.getByText("كشف تسوية أسبوع", { exact: false })).toBeTruthy());
    expect(screen.getByText("توقيع المشرف: ........................")).toBeTruthy();
    expect(container.querySelector(".print\\:block")).toBeTruthy();
    const spy = vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByText("طباعة الكشف"));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("shows the comprehensive Sat→Thu summary across worked projects, split by type", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("مشروع")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /تصفيه شاملة/ }));
    await waitFor(() => expect(screen.getByText(/الصنايعية: 1 — 400\.00 ر\.س/)).toBeTruthy());
    // all worked projects (pr1 + pr2) are selected by default
    expect(screen.getByText(/العمال: 2 — 370\.00 ر\.س/)).toBeTruthy();
    expect(screen.getByText(/الإجمالي: 770\.00 ر\.س/)).toBeTruthy();
    // per-project breakdown renders both projects
    expect(screen.getAllByText(/مشروع آخر/).length).toBeGreaterThan(0);
    // LEAVE row contributes nothing → سالم ناصر absent from the totals tables
    expect(screen.queryByText("سالم ناصر")).toBeNull();
    const spy = vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "طباعة الكشف" }));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(container.querySelector(".print\\:block")).toBeTruthy();
  });

  it("can clear and re-select all projects in the summary tab", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("مشروع")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /تصفيه شاملة/ }));
    await waitFor(() => expect(screen.getByText(/الإجمالي: 770\.00 ر\.س/)).toBeTruthy());
    fireEvent.click(screen.getByText("إلغاء تحديد الكل"));
    await waitFor(() =>
      expect(screen.getByText("حدّد مشروعًا واحدًا على الأقل لعرض التصفيه.")).toBeTruthy(),
    );
    fireEvent.click(screen.getByText("تحديد كل المشاريع"));
    await waitFor(() => expect(screen.getByText(/الإجمالي: 770\.00 ر\.س/)).toBeTruthy());
  });
});
