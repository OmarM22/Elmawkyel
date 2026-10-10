// @vitest-environment jsdom
/*
 * Users page edit flow: open the form, change a name, save via PATCH.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UsersPage from "@/app/users/page";
import type { UserRow } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/users",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const users: UserRow[] = [
  { id: "u1", username: "admin", email: "admin@x.local", name: "مدير", role: "ADMIN", active: true },
  { id: "u2", username: "wer", email: "wer@x.local", name: "مشرف", role: "ADMIN", active: true },
];

function renderPage() {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const body = JSON.parse(init.body as string);
      const user = users.find((u) => url.endsWith(u.id));
      if (user) Object.assign(user, body);
      return { ok: true, json: async () => ({ user: { ...user } }) };
    }
    if (url.startsWith("/api/users")) {
      return { ok: true, json: async () => ({ users: users.map((u) => ({ ...u })) }) };
    }
    return { ok: false, json: async () => ({}) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<UsersPage />, { wrapper });
}

describe("UsersPage edit flow", () => {
  afterEach(() => cleanup());

  it("opens the edit form and saves name changes via PATCH", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("wer")).toBeTruthy());
    fireEvent.click(screen.getAllByText("تعديل")[1]);
    await waitFor(() => expect(screen.getByText("تعديل wer")).toBeTruthy());
    fireEvent.change(document.getElementById("ue-name") as HTMLInputElement, {
      target: { value: "مشرف جديد" },
    });
    fireEvent.click(screen.getByText("حفظ التعديلات"));
    await waitFor(() => expect(screen.getByText("مشرف جديد")).toBeTruthy());
    const patchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[1] as RequestInit)?.method === "PATCH",
    );
    expect(patchCall![0]).toContain("u2");
    expect(JSON.parse(patchCall![1].body as string)).toMatchObject({ name: "مشرف جديد" });
  });
});
