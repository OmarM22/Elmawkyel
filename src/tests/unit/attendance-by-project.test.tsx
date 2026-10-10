// @vitest-environment jsdom
/*
 * Project-scoped attendance page tests: every active worker is offered (any
 * worker may work on any project), a tap records into the selected project
 * only, plus conflict-with-move, day close/reopen and the printed sheet.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ByProjectPage from "@/app/attendance/by-project/page";
import type { PersonRow } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/attendance/by-project",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const people: PersonRow[] = [
  { id: "p1", name: "أحمد حسن", type: "CRAFTSMAN", phone: null, active: true, currentDailyRate: 200 },
  { id: "p2", name: "محمد علي", type: "WORKER", phone: null, active: true, currentDailyRate: 150 },
];

const project = {
  id: "pr1",
  name: "مشروع",
  startDate: "2026-09-01",
  endDate: null,
  status: "ACTIVE",
  workingDays: ["SATURDAY"],
};

// p1 is assigned to the project; p2 is not — both must still be recordable.
const team = [{ personId: "p1", name: "أحمد حسن", type: "CRAFTSMAN", active: true }];

const DATE = "2026-10-03"; // a Saturday

let batchSkipped: unknown[] = [];
let dayWide: {
  id: string;
  personId: string;
  personName: string;
  projectId: string;
  projectName: string;
  date: string;
  status: "PRESENT" | "LEAVE";
  dailyRate: number;
  hours: number;
  notes: null;
}[] = [];
let closeFixture: { closed: boolean; close: { closedBy: string; closedAt: string } | null } = {
  closed: false,
  close: null,
};

function renderPage() {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/people")) return { ok: true, json: async () => ({ people }) };
    if (url.startsWith("/api/projects/pr1")) {
      return { ok: true, json: async () => ({ project, team }) };
    }
    if (url.startsWith("/api/projects")) return { ok: true, json: async () => ({ projects: [project] }) };
    if (url.startsWith("/api/attendance/close")) {
      if (init?.method === "POST") {
        closeFixture = { closed: true, close: { closedBy: "u1", closedAt: "2026-10-03T00:00:00.000Z" } };
        return { ok: true, json: async () => ({ success: true, closed: true }) };
      }
      if (init?.method === "DELETE") {
        closeFixture = { closed: false, close: null };
        return { ok: true, json: async () => ({ success: true, reopened: true }) };
      }
      return { ok: true, json: async () => closeFixture };
    }
    if (url.startsWith("/api/attendance/move")) return { ok: true, json: async () => ({ success: true }) };
    if (url.startsWith("/api/attendance")) {
      if (init?.method === "POST") {
        return { ok: true, json: async () => ({ success: true, recorded: 1, updated: 0, skipped: batchSkipped }) };
      }
      // Project-scoped query returns project rows; day-wide returns everything.
      if (url.includes("projectId=")) {
        return { ok: true, json: async () => ({ attendance: dayWide.filter((r) => r.projectId === "pr1") }) };
      }
      return { ok: true, json: async () => ({ attendance: dayWide }) };
    }
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ByProjectPage />, { wrapper });
}

/** The interactive worker list (the printed sheet also renders names). */
function peopleList(): HTMLElement {
  return screen.getByTestId("bp-people-list");
}

/** The person card (row) that owns the given worker name. */
function rowFor(name: string): HTMLElement {
  return within(peopleList()).getByText(name).closest("div.rounded-lg") as HTMLElement;
}

async function pickProject() {
  fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: DATE } });
  await waitFor(() => expect(screen.getByText("مشروع")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("المشروع"), { target: { value: "pr1" } });
  await waitFor(() => expect(screen.getByText("كل العمال (2)")).toBeTruthy());
}

function postedBody() {
  const post = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
    (c) => String(c[0]) === "/api/attendance" && (c[1] as RequestInit)?.method === "POST",
  );
  return post ? (JSON.parse((post[1] as RequestInit).body as string) as unknown) : null;
}

describe("ByProject attendance page", () => {
  afterEach(() => {
    cleanup();
    batchSkipped = [];
    dayWide = [];
    closeFixture = { closed: false, close: null };
  });

  it("lists every active worker, assigned or not", async () => {
    renderPage();
    await pickProject();
    expect(within(peopleList()).getByText("أحمد حسن")).toBeTruthy();
    expect(within(peopleList()).getByText("محمد علي")).toBeTruthy();
    // Only the unassigned one is flagged (waits for the project team query).
    expect(within(rowFor("محمد علي")).getByText("غير معيّن لهذا المشروع")).toBeTruthy();
    await waitFor(() =>
      expect(within(rowFor("أحمد حسن")).queryByText("غير معيّن لهذا المشروع")).toBeNull(),
    );
  });

  it("records a tap on the assigned worker into the selected project", async () => {
    renderPage();
    await pickProject();
    fireEvent.click(within(rowFor("أحمد حسن")).getByText("حاضر"));
    await waitFor(() => {
      expect(postedBody()).toMatchObject({
        projectId: "pr1",
        date: DATE,
        records: [{ personId: "p1", status: "PRESENT" }],
      });
    });
  });

  it("records a worker who is not assigned to this project", async () => {
    renderPage();
    await pickProject();
    fireEvent.click(within(rowFor("محمد علي")).getByText("حاضر"));
    await waitFor(() => {
      expect(postedBody()).toMatchObject({
        projectId: "pr1",
        date: DATE,
        records: [{ personId: "p2", status: "PRESENT" }],
      });
    });
  });

  it("closes the day and locks the grid, then reopens as ADMIN", async () => {
    renderPage();
    await pickProject();
    fireEvent.click(screen.getByText("إغلاق اليوم"));
    await waitFor(() => {
      const post = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === "/api/attendance/close" && (c[1] as RequestInit)?.method === "POST",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({ projectId: "pr1" });
    });
    await waitFor(() => expect(screen.getByText("تم إغلاق هذا اليوم", { exact: false })).toBeTruthy());
    expect(screen.queryByText("حاضر")).toBeNull(); // marking buttons hidden while locked
    fireEvent.click(screen.getByText("إعادة فتح اليوم"));
    await waitFor(() => {
      const del = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === "/api/attendance/close" && (c[1] as RequestInit)?.method === "DELETE",
      );
      expect(del).toBeTruthy();
    });
    await waitFor(() => expect(within(rowFor("محمد علي")).getByText("حاضر")).toBeTruthy());
  });

  it("explains presence recorded elsewhere, with move", async () => {
    dayWide = [
      { id: "a8", personId: "p1", personName: "أحمد حسن", projectId: "prX", projectName: "مشروع آخر", date: DATE, status: "PRESENT", dailyRate: 200, hours: 1, notes: null },
    ];
    renderPage();
    await pickProject();
    await waitFor(() => expect(within(peopleList()).getByText("حاضر اليوم في", { exact: false })).toBeTruthy());
    fireEvent.click(within(rowFor("أحمد حسن")).getByText("نقل إلى هنا"));
    await waitFor(() => {
      const mv = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === "/api/attendance/move",
      );
      expect(mv).toBeTruthy();
      expect(JSON.parse((mv![1] as RequestInit).body as string)).toMatchObject({
        personId: "p1",
        toProjectId: "pr1",
      });
    });
  });

  it("moves a conflict into the selected project", async () => {
    batchSkipped = [
      { personId: "p1", personName: "أحمد حسن", date: DATE, existingProjectId: "prX", existingProjectName: "مشروع آخر" },
    ];
    renderPage();
    await pickProject();
    fireEvent.click(within(rowFor("أحمد حسن")).getByText("حاضر"));
    await waitFor(() => expect(within(rowFor("أحمد حسن")).getByText("مسجل حاضر في", { exact: false })).toBeTruthy());
    fireEvent.click(within(rowFor("أحمد حسن")).getByText("نقل إلى هنا"));
    await waitFor(() => {
      const mv = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === "/api/attendance/move",
      );
      expect(mv).toBeTruthy();
      expect(JSON.parse((mv![1] as RequestInit).body as string)).toMatchObject({
        personId: "p1",
        toProjectId: "pr1",
      });
    });
  });

  it("filters the worker list by the search box", async () => {
    renderPage();
    await pickProject();
    fireEvent.change(screen.getByLabelText("بحث عن عامل"), { target: { value: "محمد" } });
    await waitFor(() => expect(screen.getByText("كل العمال (1)")).toBeTruthy());
    expect(within(peopleList()).queryByText("أحمد حسن")).toBeNull();
    expect(within(peopleList()).getByText("محمد علي")).toBeTruthy();
  });

  it("shows day summary counts and prints the project sheet", async () => {
    renderPage();
    await pickProject();
    expect(
      screen.getByText("المسجَّل في هذا المشروع: 0 • حاضر: 0 • إجازة: 0"),
    ).toBeTruthy();
    expect(screen.getByText("كشف يومية مشروع", { exact: false })).toBeTruthy();
    const spy = vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByText("طباعة الكشف"));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});