// @vitest-environment jsdom
/*
 * Weekly page tests: present/absent/leave breakdown in both tables.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WeeklyPage from "@/app/weekly/page";
import type { AttendanceRow } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/weekly",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const project = {
  id: "pr1",
  name: "مشروع",
  startDate: "2026-09-01",
  endDate: null,
  status: "ACTIVE",
  workingDays: ["SATURDAY", "SUNDAY"],
};

const base = {
  personId: "p1",
  personName: "أحمد حسن",
  projectId: "pr1",
  projectName: "مشروع",
  dailyRate: 200,
  hours: 1,
  notes: null,
} as const;

const attendance: AttendanceRow[] = [
  { ...base, id: "a1", date: "2026-10-03", status: "PRESENT" },
  { ...base, id: "a3", personId: "p2", personName: "محمد علي", date: "2026-10-04", status: "LEAVE", hours: 0 },
];

function renderPage() {
  global.fetch = vi.fn(async (url: string) => {
    if (url.startsWith("/api/projects")) return { ok: true, json: async () => ({ projects: [project] }) };
    return { ok: true, json: async () => ({ attendance }) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<WeeklyPage />, { wrapper });
}

describe("WeeklyPage leave", () => {
  afterEach(() => cleanup());

  it("shows leave counts in the summary, daily, and per-person tables", async () => {
    const { container } = renderPage();
    // Window 2026-09-28..2026-10-04 covers the fixture rows.
    fireEvent.change(screen.getByLabelText("بداية الفترة"), { target: { value: "2026-09-28" } });
    await waitFor(() => expect(screen.getByText("مشروع")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("المشروع"), { target: { value: "pr1" } });
    await waitFor(() => expect(screen.getAllByText("200.00 ر.س").length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText("إجازة: 1")).toBeTruthy();
    expect(screen.getAllByText("الإجازات").length).toBeGreaterThanOrEqual(2); // daily + per-person tables
    // Mohamed: 0 present days, 1 leave, zero dues
    const tables = container.querySelectorAll("tbody");
    expect(tables[1].textContent).toContain("محمد علي");
    expect(screen.getAllByText("0.00 ر.س").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('a[href="/people/p2"]')).toBeTruthy();
  });
});
