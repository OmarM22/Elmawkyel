"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PERSON_TYPE_LABELS, type AttendanceConflict, type AttendanceRow, type PersonRow, type ProjectRow, type TeamMember } from "@/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type MarkStatus = "PRESENT";

/*
 * Project-scoped attendance: pick ONE project, then mark people.
 * Every tap records unambiguously into the selected project (the worker
 * page cannot offer that certainty). The list is EVERY active worker —
 * any person may work on any project, assignment is only a hint
 * (recording someone unassigned adds them to the project team).
 */
export default function ByProjectAttendancePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canEdit = session?.user?.role === "ADMIN";
  const isAdmin = session?.user?.role === "ADMIN";

  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Record<string, AttendanceConflict[]>>({});

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getJson<{ projects: ProjectRow[] }>("/api/projects"),
  });
  const { data: peopleData, isLoading: peopleLoading } = useQuery({
    queryKey: ["people-active"],
    queryFn: () => getJson<{ people: PersonRow[] }>("/api/people?active=true"),
  });
  const { data: detailData } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getJson<{ project: ProjectRow; team: TeamMember[] }>(`/api/projects/${projectId}`),
    enabled: projectId !== "",
  });
  const { data: existingData } = useQuery({
    queryKey: ["attendance", projectId, date],
    queryFn: () =>
      getJson<{ attendance: AttendanceRow[] }>(
        `/api/attendance?projectId=${projectId}&from=${date}&to=${date}`,
      ),
    enabled: projectId !== "" && date !== "",
  });
  // Day-wide rows (all projects) to spot presence recorded elsewhere.
  const { data: dayData } = useQuery({
    queryKey: ["attendance", "day", date],
    queryFn: () => getJson<{ attendance: AttendanceRow[] }>(`/api/attendance?from=${date}&to=${date}`),
    enabled: date !== "",
  });
  const presentElsewhere = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of dayData?.attendance ?? []) {
      if (r.status === "PRESENT" && r.projectId !== projectId && !map.has(r.personId)) {
        map.set(r.personId, r.projectName);
      }
    }
    return map;
  }, [dayData, projectId]);

  const team = useMemo(() => detailData?.team ?? [], [detailData?.team]);
  const teamIds = useMemo(() => new Set(team.map((t) => t.personId)), [team]);

  // Day-close status for this project + date.
  const { data: closeData } = useQuery({
    queryKey: ["day-close", projectId, date],
    queryFn: () =>
      getJson<{ closed: boolean; close: { closedBy: string; closedAt: string } | null }>(
        `/api/attendance/close?projectId=${projectId}&date=${date}`,
      ),
    enabled: projectId !== "" && date !== "",
  });
  const dayClosed = closeData?.closed === true;
  const existingByPerson = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const r of existingData?.attendance ?? []) map.set(r.personId, r);
    return map;
  }, [existingData]);

  // Day summary over what is actually recorded in this project (not the team):
  // any worker may be recorded on any project.
  const daySummary = useMemo(() => {
    const rows = existingData?.attendance ?? [];
    let present = 0;
    let leave = 0;
    for (const r of rows) {
      if (r.status === "PRESENT") present += 1;
      else if (r.status === "LEAVE") leave += 1;
    }
    return { recorded: rows.length, present, leave };
  }, [existingData]);

  const matches = (name: string) => {
    const q = search.trim();
    return q === "" || name.includes(q);
  };
  // Every active worker is recordable in every project — no assignment filter.
  const listedPeople = useMemo(
    () =>
      (peopleData?.people ?? [])
        .filter((p) => matches(p.name))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "ar")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peopleData, search],
  );
  // Printed sheet: people belonging to this project (assigned or recorded).
  const sheetPeople = useMemo(
    () => (peopleData?.people ?? []).filter((p) => teamIds.has(p.id) || existingByPerson.has(p.id)),
    [peopleData, teamIds, existingByPerson],
  );

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["weeks"] });
    await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    await queryClient.invalidateQueries({ queryKey: ["day-close"] });
  }

  async function mark(personId: string, status: MarkStatus) {
    const key = `${personId}:${status}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, date, records: [{ personId, status }] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "فشل التسجيل");
      setConflicts((c) => ({ ...c, [personId]: (body.skipped ?? []) as AttendanceConflict[] }));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التسجيل");
    } finally {
      setBusyKey(null);
    }
  }

  async function moveHere(personId: string) {
    setMovingId(personId);
    try {
      const res = await fetch("/api/attendance/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, date, toProjectId: projectId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "فشل النقل");
      setConflicts((c) => {
        const next = { ...c };
        delete next[personId];
        return next;
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل النقل");
    } finally {
      setMovingId(null);
    }
  }

  async function closeDay() {
    if (!projectId || !date) return;
    setClosing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/attendance/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, date }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "فشل الإغلاق");
      await refresh();
      setResult("تم إغلاق اليوم");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإغلاق");
    } finally {
      setClosing(false);
    }
  }

  async function reopenDay() {
    if (!projectId || !date) return;
    setReopening(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/attendance/close", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, date }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "فشلت إعادة الفتح");
      await refresh();
      setResult("تمت إعادة فتح اليوم");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشلت إعادة الفتح");
    } finally {
      setReopening(false);
    }
  }

  function personRow(p: PersonRow) {
    const saved = existingByPerson.get(p.id)?.status ?? null;
    const personConflicts = conflicts[p.id] ?? [];
    return (
      <div
        key={p.id}
        className={cn(
          "flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center",
          saved === "PRESENT" && "border-success/40 bg-success/5",
          saved && saved !== "PRESENT" && "opacity-75",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{p.name}</span>
            <Badge variant={p.type === "CRAFTSMAN" ? "default" : "secondary"}>
              {PERSON_TYPE_LABELS[p.type]}
            </Badge>
            {!teamIds.has(p.id) && <Badge variant="outline">غير معيّن لهذا المشروع</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {saved === "PRESENT" && "حاضر هنا اليوم"}
            {saved === "LEAVE" && "إجازة هنا اليوم"}
            {!saved && "لم يسجل بعد"}
          </div>
          {personConflicts.length > 0 && (
            <div className="mt-1 text-xs font-medium text-warning">
              مسجل حاضر في «{personConflicts[0].existingProjectName}» — يوم مدفوع واحد لكل شخص.
            </div>
          )}
          {presentElsewhere.has(p.id) && (
            <div className="mt-1 text-xs font-medium text-warning">
              حاضر اليوم في «{presentElsewhere.get(p.id)}» — انقله هنا لو كان يعمل في هذا المشروع.
            </div>
          )}
        </div>
        {canEdit && !dayClosed && (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" className="min-h-[44px]" disabled={busyKey === `${p.id}:PRESENT`} onClick={() => mark(p.id, "PRESENT")}>
              {busyKey === `${p.id}:PRESENT` ? "…" : "حاضر"}
            </Button>
            {(personConflicts.length > 0 || presentElsewhere.has(p.id)) && (
              <Button size="sm" variant="outline" disabled={movingId === p.id} onClick={() => moveHere(p.id)}>
                {movingId === p.id ? "جارٍ النقل…" : "نقل إلى هنا"}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">تسجيل اليومية</h1>
            <p className="text-sm text-muted-foreground">اختر المشروع — أي عامل يمكن تسجيله، وكل علامة تُسجَّل في هذا المشروع حصراً</p>
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            طباعة الكشف
          </Button>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bp-project" className="text-sm font-medium">
                المشروع
              </label>
              <select
                id="bp-project"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setConflicts({});
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">اختر المشروع…</option>
                {(projectsData?.projects ?? [])
                  .filter((p) => p.status === "ACTIVE")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bp-date" className="text-sm font-medium">
                التاريخ
              </label>
              <Input
                id="bp-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setConflicts({});
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bp-search" className="text-sm font-medium">
                بحث عن عامل
              </label>
              <Input
                id="bp-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="اكتب الاسم…"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {result && (
          <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            {result}
          </p>
        )}

        {projectId && date && dayClosed && (
          <Card className="border-warning/50">
            <CardContent className="flex flex-col gap-2 pt-6">
              <p className="text-sm font-medium text-warning">
                تم إغلاق هذا اليوم — التعديل يتطلب إعادة الفتح من مدير النظام.
              </p>
              {isAdmin && (
                <div>
                  <Button variant="outline" size="sm" onClick={reopenDay} disabled={reopening}>
                    {reopening ? "جارٍ إعادة الفتح…" : "إعادة فتح اليوم"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {projectId && date && !dayClosed && canEdit && (
          <div>
            <Button variant="outline" onClick={closeDay} disabled={closing}>
              {closing ? "جارٍ الإغلاق…" : "إغلاق اليوم"}
            </Button>
          </div>
        )}

        {peopleLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        ) : (
          projectId !== "" && (
            <>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    المسجَّل في هذا المشروع: {daySummary.recorded} • حاضر: {daySummary.present} • إجازة:{" "}
                    {daySummary.leave}
                  </p>
                </CardContent>
              </Card>
              <div>
                <h2 className="mb-2 text-sm font-bold text-muted-foreground">
                  كل العمال ({listedPeople.length})
                </h2>
                <p className="mb-2 text-xs text-muted-foreground">
                  أي عامل يمكن تسجيله في أي مشروع — اضغط «حاضر» فيُسجَّل في المشروع المختار حصراً.
                </p>
                <div className="flex flex-col gap-2" data-testid="bp-people-list">
                  {listedPeople.map(personRow)}
                  {listedPeople.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {peopleData?.people.length
                        ? "لا يوجد عامل بهذا الاسم."
                        : "لا يوجد عمال مسجّلون بعد."}
                    </p>
                  )}
                </div>
              </div>
            </>
          )
        )}
      </div>

      {projectId && (
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">الوكيل — كشف يومية مشروع</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detailData?.project.name} • التاريخ: {date} • المسجَّل: {daySummary.recorded} • حاضر:{" "}
            {daySummary.present} • إجازة: {daySummary.leave} • تاريخ الطباعة:{" "}
            {new Date().toISOString().slice(0, 10)}
          </p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-right font-medium">العامل</th>
                <th className="py-2 text-right font-medium">النوع</th>
                <th className="py-2 text-right font-medium">الحالة</th>
                <th className="py-2 text-right font-medium">التوقيع</th>
              </tr>
            </thead>
            <tbody>
              {sheetPeople.map((p) => {
                const st = existingByPerson.get(p.id)?.status ?? null;
                return (
                  <tr key={p.id} className="border-b">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2">{PERSON_TYPE_LABELS[p.type]}</td>
                    <td className="py-2 font-semibold">
                      {st === "PRESENT" ? "حاضر" : st === "LEAVE" ? "إجازة" : "لم يسجل"}
                    </td>
                    <td className="py-2">........................</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
            <div>
              <p>توقيع المشرف: ........................</p>
              <p className="mt-1">الاسم: ........................</p>
            </div>
            <div>
              <p>توقيع مسؤول الحضور: ........................</p>
              <p className="mt-1">الاسم: ........................</p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
