// @vitest-environment jsdom
/*
 * Worker settlement page tests: statement rendering and oldest-first pay.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkerSettlementPage from "@/app/settlements/worker/page";
import type { PersonRow, WorkerStatement } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settlements/worker",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const people: PersonRow[] = [
  { id: "p1", name: "أحمد حسن", type: "CRAFTSMAN", phone: null, active: true, currentDailyRate: 200 },
];

const statement: WorkerStatement = {
  personId: "p1",
  personName: "أحمد حسن",
  dues: [
    { projectId: "prA", projectName: "موقع أ", weekId: "prA:5", weekNumber: 5, weekStartDate: "2026-09-29", dueHalalas: 20000, paidHalalas: 5000 },
    { projectId: "prB", projectName: "موقع ب", weekId: "prB:3", weekNumber: 3, weekStartDate: "2026-09-15", dueHalalas: 15000, paidHalalas: 0 },
  ],
  payments: [
    { id: "pay1", personId: "p1", personName: "أحمد حسن", projectName: "موقع أ", weekNumber: 5, amountHalalas: 5000, paidAt: "2026-10-01T10:00:00.000Z", notes: null },
  ],
  totalDue: 35000,
  totalPaid: 5000,
  totalRemaining: 30000,
};

function renderPage() {
  global.fetch = vi.fn(async (url: string) => {
    if (url.startsWith("/api/people")) return { ok: true, json: async () => ({ people }) };
    if (url.startsWith("/api/settlements/statement")) {
      return { ok: true, json: async () => ({ statement }) };
    }
    if (url.startsWith("/api/settlements/pay")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          applied: 1,
          allocations: [{ weekId: "prB:3", projectName: "موقع ب", amountHalalas: 10000 }],
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<WorkerSettlementPage />, { wrapper });
}

describe("WorkerSettlementPage", () => {
  afterEach(() => cleanup());

  it("renders statement totals, dues, and payment history", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("أحمد حسن")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("العامل"), { target: { value: "p1" } });
    await waitFor(() => expect(screen.getByText("حساب أحمد حسن — المتبقي: 300.00 ر.س")).toBeTruthy());
    expect(screen.getByText("موقع ب")).toBeTruthy();
    // due and remaining cells share the value when nothing is paid yet,
    // plus موقع أ's remaining after its partial payment
    expect(screen.getAllByText("150.00 ر.س")).toHaveLength(3);
    expect(screen.getAllByText("50.00 ر.س")).toHaveLength(3); // totals + dues cell + ledger row
  });

  it("pays with the remaining default and shows the allocation", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("أحمد حسن")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("العامل"), { target: { value: "p1" } });
    await waitFor(() => expect(screen.getByText("حساب أحمد حسن — المتبقي: 300.00 ر.س")).toBeTruthy());
    fireEvent.click(screen.getByText("تأكيد الدفع"));
    await waitFor(() => {
      const post = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === "/api/settlements/pay",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({
        personId: "p1",
        amountHalalas: 30000,
      });
    });
    await waitFor(() => expect(screen.getByText("تم التوزيع:", { exact: false })).toBeTruthy());
  });
});
