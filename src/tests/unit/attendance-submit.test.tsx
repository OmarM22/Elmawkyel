// @vitest-environment jsdom
/*
 * Attendance submit-path tests: team scoping, live summary, settled-week lock.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AttendancePage from "@/app/attendance/page";
import type { PersonRow } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/attendance",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const people: PersonRow[] = [
  { id: "p1", name: "أحمد حسن", type: "CRAFTSMAN", phone: null, active: true, currentDailyRate: 200 },
  { id: "p2", name: "محمد علي", type: "WORKER", phone: null, active: true, currentDailyRate: 150 },
  { id: "p3", name: "كريم صلاح", type: "CRAFTSMAN", phone: null, active: true, currentDailyRate: 150 },
];

const project = {
  id: "pr1",
  name: "مشروع",
  startDate: "2026-09-01",
  endDate: null,
  status: "ACTIVE",
  workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
};

// 2026-10-03 is a Saturday. Overridden per test for the lock case.
let weeksFixture: { id: string; weekNumber: number; startDate: string; endDate: string; status: string }[] = [];

function renderPage() {
  global.fetch = vi.fn(async (url: string) => {
    if (url.startsWith("/api/people")) return { ok: true, json: async () => ({ people }) };
    if (url.startsWith("/api/projects/pr1")) {
      return {
        ok: true,
        json: async () => ({ project, team: [{ personId: "p1", name: "أحمد حسن", type: "CRAFTSMAN", active: true }] }),
      };
    }
    if (url.startsWith("/api/projects")) return { ok: true, json: async () => ({ projects: [project] }) };
    if (url.startsWith("/api/weeks")) return { ok: true, json: async () => ({ weeks: weeksFixture }) };
    return { ok: true, json: async () => ({ attendance: [] }) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AttendancePage />, { wrapper });
}

function visibleNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('div[role="group"]')).map((g) =>
    (g.getAttribute("aria-label") ?? "").replace(/^حالة /, ""),
  );
}

async function selectProject() {
  await waitFor(() => expect(screen.getByText("مشروع")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("المشروع"), { target: { value: "pr1" } });
}

describe("AttendancePage submit path", () => {
  afterEach(() => {
    cleanup();
    weeksFixture = [];
  });

  it("scopes the grid to the project team by default, toggle shows all", async () => {
    const { container } = renderPage();
    await selectProject();
    await waitFor(() => expect(visibleNames(container)).toHaveLength(1));
    expect(visibleNames(container)[0]).toContain("أحمد حسن");
    fireEvent.click(container.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await waitFor(() => expect(visibleNames(container)).toHaveLength(3));
  });

  it("shows a live summary with counts and total cost", async () => {
    const { container } = renderPage();
    await selectProject();
    await waitFor(() =>
      expect(container.querySelector('input[type="checkbox"]')).toBeTruthy(),
    );
    fireEvent.click(container.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await waitFor(() =>
      expect(screen.getByText("الملخص: 3 حاضر • 0 غائب • 0 إجازة • الإجمالي: 500.00 ر.س")).toBeTruthy(),
    );
    fireEvent.click(screen.getAllByText("غائب")[0]);
    await waitFor(() =>
      expect(screen.getByText("الملخص: 2 حاضر • 1 غائب • 0 إجازة • الإجمالي: 300.00 ر.س")).toBeTruthy(),
    );
  });

  it("locks submit when the date falls in a settled week", async () => {
    weeksFixture = [
      { id: "w5", weekNumber: 5, startDate: "2026-09-29", endDate: "2026-10-05", status: "SETTLED" },
    ];
    renderPage();
    await selectProject();
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: "2026-10-03" } });
    await waitFor(() => expect(screen.getByText("ضمن الأسبوع 5 المسوّى", { exact: false })).toBeTruthy());
    const submit = screen.getByText(/حفظ حضور/).closest("button") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText("أحمد حسن")).toBeTruthy(); // grid still visible, read-only
  });
});
