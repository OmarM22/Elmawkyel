// @vitest-environment jsdom
/*
 * People table tests (TanStack Table legacy API + jsdom):
 * renders rows, sorts by header click, filters via search, paginates.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PeoplePage from "@/app/people/page";
import type { PersonRow } from "@/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "مدير", username: "admin", role: "ADMIN" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/people",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function makePeople(n: number): PersonRow[] {
  const names = ["أحمد حسن", "محمد علي", "كريم صلاح", "أحمد محمد", "سارة خالد"];
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `${names[i % names.length]} ${Math.floor(i / names.length) + 1}`,
    type: (i % 2 === 0 ? "CRAFTSMAN" : "WORKER") as PersonRow["type"],
    phone: `05500000${String(i).padStart(2, "0")}`,
    active: true,
    currentDailyRate: 200,
  }));
}

function renderPage(people: PersonRow[]) {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const body = JSON.parse(init.body as string);
      const person = people.find((p) => url.endsWith(p.id));
      if (person) Object.assign(person, body);
      return { ok: true, json: async () => ({ person }) };
    }
    if (init?.method === "DELETE") {
      const index = people.findIndex((p) => url.endsWith(p.id));
      if (index >= 0) people.splice(index, 1);
      return { ok: true, json: async () => ({ deleted: true }) };
    }
    return { ok: true, json: async () => ({ people: people.map((p) => ({ ...p })) }) };
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const result = render(<PeoplePage />, { wrapper });
  return result;
}

function rowNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("tbody tr"))
    .map((tr) => tr.querySelector("td")?.textContent ?? "")
    .filter((t) => t.length > 0 && !t.startsWith("لا "));
}

describe("PeoplePage data table", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => cleanup());

  it("renders headers, rows, search, and pagination", async () => {
    const { container } = renderPage(makePeople(4));
    await waitFor(() => expect(screen.getByText("أحمد حسن 1")).toBeTruthy());
    for (const header of ["الاسم", "النوع", "الهاتف", "الأجر اليومي", "الحالة", "إجراءات"]) {
      expect(screen.getByText(header)).toBeTruthy();
    }
    expect(screen.getByPlaceholderText("بحث بالاسم أو الهاتف…")).toBeTruthy();
    expect(screen.getByText("صفحة 1 من 1")).toBeTruthy();
    expect(rowNames(container)).toHaveLength(4);
  });

  it("sorts by name when the header is clicked", async () => {
    const { container } = renderPage(makePeople(4));
    await waitFor(() => expect(screen.getByText("أحمد حسن 1")).toBeTruthy());
    const before = rowNames(container);
    fireEvent.click(screen.getByText("الاسم"));
    const after = rowNames(container);
    expect(after).toHaveLength(before.length);
    expect([...after].sort((a, b) => a.localeCompare(b, "ar"))).toEqual(after);
  });

  it("filters rows via the search box", async () => {
    const { container } = renderPage(makePeople(5));
    await waitFor(() => expect(screen.getByText("سارة خالد 1")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("بحث بالاسم أو الهاتف…"), {
      target: { value: "سارة" },
    });
    await waitFor(() => expect(rowNames(container)).toHaveLength(1));
    expect(rowNames(container)[0]).toContain("سارة");
  });

  it("paginates when rows exceed the page size", async () => {
    const { container } = renderPage(makePeople(15));
    await waitFor(() => expect(screen.getByText("صفحة 1 من 2")).toBeTruthy());
    expect(rowNames(container)).toHaveLength(10);
    fireEvent.click(screen.getByText("التالي"));
    await waitFor(() => expect(screen.getByText("صفحة 2 من 2")).toBeTruthy());
    expect(rowNames(container)).toHaveLength(5);
  });

  it("toggles active state from the row action", async () => {
    const { container } = renderPage(makePeople(2));
    await waitFor(() => expect(screen.getByText("أحمد حسن 1")).toBeTruthy());
    fireEvent.click(screen.getAllByText("إيقاف")[0]);
    await waitFor(() => expect(screen.getByText("غير نشط")).toBeTruthy());
    const patchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[1] as RequestInit)?.method === "PATCH",
    );
    expect(JSON.parse(patchCall![1].body as string)).toMatchObject({ active: false });
    expect(rowNames(container)).toHaveLength(2);
  });

  it("filters by type facet", async () => {
    const { container } = renderPage(makePeople(4));
    await waitFor(() => expect(screen.getByText("أحمد حسن 1")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("النوع"), { target: { value: "CRAFTSMAN" } });
    await waitFor(() => expect(rowNames(container)).toHaveLength(2));
    for (const name of rowNames(container)) {
      expect(name).toMatch(/أحمد حسن|كريم صلاح/);
    }
  });

  it("filters by status facet", async () => {
    const { container } = renderPage(makePeople(4));
    await waitFor(() => expect(screen.getByText("أحمد حسن 1")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "inactive" } });
    await waitFor(() => expect(screen.getByText("لا نتائج مطابقة للبحث.")).toBeTruthy());
    expect(rowNames(container)).toHaveLength(0);
  });

  it("deletes via the confirmation dialog", async () => {
    const { container } = renderPage(makePeople(2));
    await waitFor(() => expect(screen.getByText("أحمد حسن 1")).toBeTruthy());
    fireEvent.click(screen.getAllByText("حذف")[0]);
    await waitFor(() =>
      expect(screen.getByText("هل أنت متأكد من حذف أحمد حسن 1؟ لا يمكن التراجع عن الحذف.")).toBeTruthy(),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByText("حذف"));
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) => (c[1] as RequestInit)?.method === "DELETE" && String(c[0]).endsWith("p1"),
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(rowNames(container)).toHaveLength(1));
    const deleteCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "DELETE");
    expect(deleteCall![0]).toContain("p1");
  });
});
