// @vitest-environment jsdom
/*
 * Attendance working-day warning: appears only when the chosen date falls
 * on a rest day of the selected project. Non-blocking by design.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AttendancePage from "@/app/attendance/page";
import type { ProjectRow } from "@/types";

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

const projects: ProjectRow[] = [
  { id: "pr-sun", name: "مشروع الأحد", startDate: "2026-09-01", endDate: null, status: "ACTIVE", workingDays: ["SUNDAY"] },
  { id: "pr-sat", name: "مشروع السبت", startDate: "2026-09-01", endDate: null, status: "ACTIVE", workingDays: ["SATURDAY", "SUNDAY"] },
];

function renderPage() {
  global.fetch = vi.fn(async (url: string) => {
    if (url.startsWith("/api/people")) return { ok: true, json: async () => ({ people: [] }) };
    if (url.startsWith("/api/projects")) return { ok: true, json: async () => ({ projects }) };
    return { ok: true, json: async () => ({ attendance: [] }) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AttendancePage />, { wrapper });
}

describe("AttendancePage working-day warning", () => {
  afterEach(() => cleanup());

  it("warns on a rest day and clears on a working day", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("مشروع الأحد")).toBeTruthy());

    // 2026-10-03 is a Saturday; pr-sun works Sundays only.
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText("المشروع"), { target: { value: "pr-sun" } });
    await waitFor(() => expect(screen.getByText("ليس من أيام العمل المسجلة لهذا المشروع", { exact: false })).toBeTruthy());

    // Same project, but a Sunday: no warning.
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: "2026-10-04" } });
    await waitFor(() =>
      expect(screen.queryByText("ليس من أيام العمل المسجلة لهذا المشروع", { exact: false })).toBeNull(),
    );

    // Saturday project on a Saturday: no warning either.
    fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText("المشروع"), { target: { value: "pr-sat" } });
    await waitFor(() =>
      expect(screen.queryByText("ليس من أيام العمل المسجلة لهذا المشروع", { exact: false })).toBeNull(),
    );
  });
});
