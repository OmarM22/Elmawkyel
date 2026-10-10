// @vitest-environment jsdom
/*
 * Worker-first attendance page tests: single/multi-site actions,
 * present marking, unassigned state, conflicts with move, search.
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

const assignments = [
  { personId: "p1", personName: "أحمد حسن", personActive: true, projectId: "prA", projectName: "موقع أ", projectStatus: "ACTIVE", workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"] },
  { personId: "p2", personName: "محمد علي", personActive: true, projectId: "prA", projectName: "موقع أ", projectStatus: "ACTIVE", workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"] },
  { personId: "p2", personName: "محمد علي", personActive: true, projectId: "prB", projectName: "موقع ب", projectStatus: "ACTIVE", workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"] },
];

// Fixed Saturday; all fixture projects work Saturdays.
const DATE = "2026-10-03";

let batchSkipped: unknown[] = [];
let todayFixture: unknown[] = [];
let quickProjects: { projectId: string; projectName: string }[] = [
  { projectId: "prA", projectName: "موقع أ" },
];

function renderPage() {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/people")) return { ok: true, json: async () => ({ people }) };
    if (url.startsWith("/api/assignments")) return { ok: true, json: async () => ({ assignments }) };
    if (url.startsWith("/api/attendance/move")) return { ok: true, json: async () => ({ success: true }) };
    if (url.startsWith("/api/attendance/quick-mark")) {
      return { ok: true, json: async () => ({ success: true, projects: quickProjects, skipped: batchSkipped }) };
    }
    if (url.startsWith("/api/attendance")) {
      if (init?.method === "POST") {
        return { ok: true, json: async () => ({ success: true, recorded: 1, updated: 0, skipped: batchSkipped }) };
      }
      return { ok: true, json: async () => ({ attendance: todayFixture }) };
    }
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AttendancePage />, { wrapper });
}

describe("AttendancePage (worker-first)", () => {
  afterEach(() => {
    cleanup();
    batchSkipped = [];
    todayFixture = [];
    quickProjects = [{ projectId: "prA", projectName: "موقع أ" }];
  });

  it("shows a single حاضر action per worker, no per-site buttons", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: DATE } });
    await waitFor(() => expect(screen.getAllByText("أحمد حسن")).toHaveLength(2));
    // one حاضر per eligible worker; nothing site-specific upfront
    expect(screen.getAllByText("حاضر")).toHaveLength(2); // p1 single-site + p2 multi-site
    expect(screen.queryByText("حاضر في موقع أ")).toBeNull();
    expect(screen.getByText("غير معين في موقع عمل اليوم")).toBeTruthy();
  });

  it("records present through quick-mark", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: DATE } });
    await waitFor(() => expect(screen.getAllByText("أحمد حسن")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("حاضر")[0]);
    await waitFor(() => {
      const post = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === "/api/attendance/quick-mark" && (c[1] as RequestInit)?.method === "POST",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({
        personId: "p1",
        date: DATE,
        status: "PRESENT",
      });
    });
  });

  it("reports exactly where each mark landed", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: DATE } });
    await waitFor(() => expect(screen.getAllByText("أحمد حسن")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("حاضر")[0]);
    await waitFor(() =>
      expect(screen.getByText("تم تسجيل أحمد حسن حاضراً في: موقع أ")).toBeTruthy(),
    );
  });

  it("warns when nothing was recorded anywhere", async () => {
    quickProjects = [];
    renderPage();
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: DATE } });
    await waitFor(() => expect(screen.getAllByText("أحمد حسن")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("حاضر")[0]);
    await waitFor(() =>
      expect(
        screen.getByText("لم يتم التسجيل في أي مشروع", { exact: false }),
      ).toBeTruthy(),
    );
  });

  it("shows conflicts with a move action", async () => {
    batchSkipped = [
      { personId: "p1", personName: "أحمد حسن", date: DATE, existingProjectId: "prX", existingProjectName: "موقع آخر" },
    ];
    renderPage();
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: DATE } });
    await waitFor(() => expect(screen.getAllByText("أحمد حسن")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("حاضر")[0]);
    await waitFor(() => expect(screen.getByText("مسجل حاضر في", { exact: false })).toBeTruthy());
    fireEvent.click(screen.getByText("نقل إلى موقع أ"));
    await waitFor(() => {
      const mv = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === "/api/attendance/move",
      );
      expect(mv).toBeTruthy();
      expect(JSON.parse((mv![1] as RequestInit).body as string)).toMatchObject({
        personId: "p1",
        toProjectId: "prA",
      });
    });
  });

  it("renders the printable daily sheet and calls window.print", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: DATE } });
    await waitFor(() => expect(screen.getAllByText("أحمد حسن")).toHaveLength(2));
    expect(screen.getByText("كشف الحضور اليومي", { exact: false })).toBeTruthy();
    expect(screen.getByText("توقيع المشرف: ........................")).toBeTruthy();
    const spy = vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByText("طباعة الكشف"));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("filters workers by search", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: DATE } });
    await waitFor(() => expect(screen.getAllByText("أحمد حسن")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("بحث عن عامل"), { target: { value: "محمد" } });
    await waitFor(() => expect(screen.queryByText("أحمد حسن")).toBeNull());
    expect(screen.getAllByText("محمد علي")).toHaveLength(2);
  });

  it("highlights recorded rows and dims the rest", async () => {
    todayFixture = [
      { id: "a1", personId: "p1", personName: "أحمد حسن", projectId: "prA", projectName: "موقع أ", date: DATE, status: "PRESENT", dailyRate: 200, hours: 1, notes: null },
    ];
    const { container } = renderPage();
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: DATE } });
    // status line on p1's card + matching row in the print slip
    await waitFor(() => expect(screen.getAllByText("حاضر في موقع أ")).toHaveLength(2));
    const card = screen.getAllByText("أحمد حسن")[0].closest("div.rounded-lg") as HTMLElement;
    expect(card.className).toContain("border-success");
    const plain = screen.getAllByText("محمد علي")[0].closest("div.rounded-lg") as HTMLElement;
    expect(plain.className).not.toContain("border-success");
    expect(container.querySelector(".opacity-75")).toBeNull(); // nobody on leave
  });
});
