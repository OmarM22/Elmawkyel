// @vitest-environment jsdom
/*
 * Settlements page tests: week detail (dues + payment ledger) and the
 * ADMIN-only void flow through the confirmation dialog.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

let weeks: WeekSummary[] = [
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
      { personId: "p1", personName: "أحمد حسن", days: 1, dueHalalas: 20000, paidHalalas: 20000 },
      { personId: "p2", personName: "محمد علي", days: 1, dueHalalas: 15000, paidHalalas: 0 },
    ],
    payments: [
      { id: "pay1", personId: "p1", personName: "أحمد حسن", amountHalalas: 20000, paidAt: "2026-10-04T10:00:00.000Z", notes: "نقدي" },
    ],
  },
];

function renderPage() {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/projects")) return { ok: true, json: async () => ({ projects: [project] }) };
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

  it("renders the printable slip and calls window.print", async () => {
    const { container } = renderPage();
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
});
