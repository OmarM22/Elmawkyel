// @vitest-environment jsdom
/*
 * Project detail page tests: info card, workforce breakdown, totals.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectDetailPage from "@/app/projects/[id]/page";
import type { AttendanceRow, ProjectRow } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/pr1",
  useParams: () => ({ id: "pr1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const project: ProjectRow = {
  id: "pr1",
  name: "مشروع كمبوند الأوركيد",
  startDate: "2026-09-01",
  endDate: "2026-12-31",
  status: "ACTIVE",
  workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
};

const attendance: AttendanceRow[] = [
  { id: "a1", personId: "p1", personName: "أحمد حسن", projectId: "pr1", projectName: project.name, date: "2026-10-01", status: "PRESENT", dailyRate: 200, hours: 1, notes: null },
  { id: "a2", personId: "p1", personName: "أحمد حسن", projectId: "pr1", projectName: project.name, date: "2026-10-02", status: "PRESENT", dailyRate: 200, hours: 1, notes: null },
  { id: "a3", personId: "p2", personName: "محمد علي", projectId: "pr1", projectName: project.name, date: "2026-10-01", status: "PRESENT", dailyRate: 150, hours: 1, notes: null },
  { id: "a4", personId: "p2", personName: "محمد علي", projectId: "pr1", projectName: project.name, date: "2026-10-02", status: "ABSENT", dailyRate: 150, hours: 0, notes: null },
];

function renderPage() {
  global.fetch = vi.fn(async (url: string) => {
    if (url.startsWith("/api/attendance")) {
      return { ok: true, json: async () => ({ attendance }) };
    }
    return { ok: true, json: async () => ({ project }) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ProjectDetailPage />, { wrapper });
}

describe("ProjectDetailPage", () => {
  afterEach(() => cleanup());

  it("renders project info with status and dates", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("مشروع كمبوند الأوركيد")).toBeTruthy());
    expect(screen.getByText("نشط")).toBeTruthy();
    expect(screen.getByText("2026-09-01")).toBeTruthy();
    expect(screen.getByText("القوى العاملة (2)")).toBeTruthy();
  });

  it("aggregates workforce days and cost, excluding absences", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText("القوى العاملة (2)")).toBeTruthy());
    // Ahmed: 2 days × 200 = 400.00; Mohamed: 1 day × 150 (absent day excluded)
    expect(screen.getByText("400.00 ر.س")).toBeTruthy();
    expect(screen.getByText("150.00 ر.س")).toBeTruthy();
    expect(screen.getByText("550.00 ر.س")).toBeTruthy(); // project total
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
  });
});
