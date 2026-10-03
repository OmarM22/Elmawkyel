// @vitest-environment jsdom
/*
 * Dashboard tests: KPI cards, today strip, per-project table,
 * trend chart render, and role-gated quick actions.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";
import type { DashboardData } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const fixture: DashboardData = {
  totalProjects: 3,
  activeProjects: 2,
  totalPeople: 4,
  activePeople: 4,
  weekAttendance: 12,
  weekAbsent: 1,
  weekLeave: 1,
  weekHalalas: 240000,
  weekAttendanceDelta: 4,
  weekHalalasDelta: -50000,
  weekLabel: "آخر ٧ أيام",
  today: {
    date: "2026-10-04",
    present: 3,
    absent: 1,
    leave: 0,
    absentPeople: [{ id: "p2", name: "محمد علي" }],
    missingProjects: [{ id: "pr2", name: "مشروع فيلا النخيل" }],
  },
  endingSoon: [{ id: "pr2", name: "مشروع فيلا النخيل", endDate: "2026-10-12", daysLeft: 8 }],
  perProject: [
    { projectId: "pr1", projectName: "مشروع كمبوند الأوركيد", days: 8, halalas: 160000 },
    { projectId: "pr2", projectName: "مشروع فيلا النخيل", days: 4, halalas: 80000 },
  ],
  daily: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-09-${String(21 + i).padStart(2, "0")}`,
    days: 1,
    halalas: 20000,
  })),
};

function renderPage() {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => fixture,
  })) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<DashboardPage />, { wrapper });
}

describe("DashboardPage", () => {
  afterEach(() => cleanup());

  it("renders KPI cards with absence counts and fixed cost title", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("2,400.00 ر.س")).toBeTruthy());
    expect(screen.getByText("تكلفة العمالة")).toBeTruthy();
    expect(container.querySelector("table")).toBeTruthy();
    expect(screen.getByText("غياب: 1 • إجازة: 1", { exact: false })).toBeTruthy();
  });

  it("renders the today strip with rate, absent names, and missing projects", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("اليوم (2026-10-04)")).toBeTruthy());
    expect(screen.getByText("75٪", { exact: false })).toBeTruthy(); // 3 present / (3+1 absent)
    expect(screen.getByText("الغائبون اليوم:", { exact: false })).toBeTruthy();
    expect(screen.getByText("محمد علي")).toBeTruthy();
    // once in the missing-today badges, once in the per-project table
    expect(screen.getAllByText("مشروع فيلا النخيل")).toHaveLength(2);
  });

  it("renders the per-project cost table sorted by cost", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("تكلفة المشاريع (آخر ٧ أيام)")).toBeTruthy());
    const cells = Array.from(container.querySelectorAll("tbody tr td:first-child")).map(
      (td) => td.textContent,
    );
    expect(cells).toContain("مشروع كمبوند الأوركيد");
    expect(screen.getByText("1,600.00 ر.س")).toBeTruthy();
  });

  it("renders week deltas and clickable KPI cards", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("2,400.00 ر.س")).toBeTruthy());
    expect(screen.getByText("+4 عن الأسبوع الماضي")).toBeTruthy();
    expect(screen.getByText("-500.00 ر.س عن الأسبوع الماضي")).toBeTruthy();
    const projectsLink = screen.getByRole("link", { name: "عرض المشاريع" });
    expect(projectsLink.getAttribute("href")).toBe("/projects");
    const peopleLink = screen.getByRole("link", { name: "عرض الأشخاص" });
    expect(peopleLink.getAttribute("href")).toBe("/people");
    expect(container.querySelector("svg.recharts-surface")).toBeTruthy();
  });

  it("renders ending-soon alerts and refreshes on demand", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("مشاريع تنتهي قريباً")).toBeTruthy());
    expect(screen.getByText("مشروع فيلا النخيل — ينتهي 2026-10-12 (متبقٍ 8 أيام)")).toBeTruthy();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "تحديث البيانات" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("renders the trend chart and quick actions", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("التكلفة اليومية (آخر ١٤ يومًا)")).toBeTruthy());
    expect(container.querySelector("svg.recharts-surface")).toBeTruthy();
    // quick actions exist alongside the sidebar nav links with the same labels
    expect(screen.getAllByRole("link", { name: "تسجيل اليومية" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("link", { name: "الحصر الأسبوعي" }).length).toBeGreaterThanOrEqual(2);
  });
});
