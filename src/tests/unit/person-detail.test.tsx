// @vitest-environment jsdom
/*
 * Person detail page tests: aggregates plus the daily attendance log
 * (newest first, all statuses, per-row snapshot amounts).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PersonDetailPage from "@/app/people/[id]/page";
import type { AttendanceRow, PersonDetail } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/people/p1",
  useParams: () => ({ id: "p1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const person: PersonDetail = {
  id: "p1",
  name: "أحمد حسن",
  type: "CRAFTSMAN",
  phone: "0551234567",
  active: true,
  currentDailyRate: 200,
  assignments: [
    { id: "p1-pr1", projectId: "pr1", projectName: "مشروع كمبوند الأوركيد", dailyRate: 200, days: 1, totalHalalas: 20000, period: "كل الفترات" },
  ],
};

const log: AttendanceRow[] = [
  { id: "a2", personId: "p1", personName: "أحمد حسن", projectId: "pr1", projectName: "مشروع كمبوند الأوركيد", date: "2026-10-02", status: "ABSENT", dailyRate: 200, hours: 0, notes: "عذر طبي" },
  { id: "a1", personId: "p1", personName: "أحمد حسن", projectId: "pr1", projectName: "مشروع كمبوند الأوركيد", date: "2026-10-01", status: "PRESENT", dailyRate: 200, hours: 1, notes: null },
];

function renderPage() {
  global.fetch = vi.fn(async (url: string) => {
    if (url.startsWith("/api/attendance")) return { ok: true, json: async () => ({ attendance: log }) };
    return { ok: true, json: async () => ({ person }) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<PersonDetailPage />, { wrapper });
}

describe("PersonDetailPage daily log", () => {
  afterEach(() => cleanup());

  it("renders log rows newest-first with status badges and notes", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("سجل اليوميات (2)")).toBeTruthy());
    expect(screen.getByText("غائب")).toBeTruthy();
    expect(screen.getByText("عذر طبي")).toBeTruthy();
    expect(screen.getByText("0.00 ر.س")).toBeTruthy(); // absent day amounts zero
    const dates = Array.from(container.querySelectorAll("tbody tr td[dir='ltr']")).map(
      (td) => td.textContent,
    );
    expect(dates).toEqual(["2026-10-02", "2026-10-01"]);
  });
});
