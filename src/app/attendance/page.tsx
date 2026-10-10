"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatSAR, mulRateHours, sumHalalas } from "@/lib/money";
import { PERSON_TYPE_LABELS, type AttendanceConflict, type AttendanceRow, type OpenAssignment, type PersonRow } from "@/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

const JS_DAY_TO_NAME = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type MarkStatus = "PRESENT";

/*
 * Workforce-first attendance: every active worker is listed with a single
 * action — حاضر. Marking records across every eligible project (open
 * assignment, ACTIVE project, working day). UNIQUE(person, date) for
 * PRESENT is enforced server-side with conflict + move.
 */
export default function AttendancePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canEdit = session?.user?.role === "ADMIN";

  const [date, setDate] = useState(todayStr());
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    personName: string;
    status: MarkStatus;
    names: string[];
  } | null>(null);
  const [conflicts, setConflicts] = useState<Record<string, AttendanceConflict[]>>({});

  const { data: peopleData, isLoading: peopleLoading } = useQuery({
    queryKey: ["people-active"],
    queryFn: () => getJson<{ people: PersonRow[] }>("/api/people?active=true"),
  });
  const { data: assignmentsData } = useQuery({
    queryKey: ["assignments-open"],
    queryFn: () => getJson<{ assignments: OpenAssignment[] }>("/api/assignments"),
  });
  const { data: todayData } = useQuery({
    queryKey: ["attendance", "day", date],
    queryFn: () =>
      getJson<{ attendance: AttendanceRow[] }>(`/api/attendance?from=${date}&to=${date}`),
    enabled: date !== "",
  });

  const dayName = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return JS_DAY_TO_NAME[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
  }, [date]);

  const people = useMemo(() => {
    const q = search.trim();
    const all = peopleData?.people ?? [];
    if (!q) return all;
    return all.filter((p) => p.name.includes(q));
  }, [peopleData, search]);

  const eligibleByPerson = useMemo(() => {
    const map = new Map<string, OpenAssignment[]>();
    if (!dayName) return map;
    for (const a of assignmentsData?.assignments ?? []) {
      if (!a.personActive) continue;
      if (a.projectStatus !== "ACTIVE") continue;
      if (!a.workingDays.includes(dayName)) continue;
      const list = map.get(a.personId) ?? [];
      list.push(a);
      map.set(a.personId, list);
    }
    return map;
  }, [assignmentsData, dayName]);

  const rowsByPerson = useMemo(() => {
    const map = new Map<string, AttendanceRow[]>();
    for (const r of todayData?.attendance ?? []) {
      const list = map.get(r.personId) ?? [];
      list.push(r);
      map.set(r.personId, list);
    }
    return map;
  }, [todayData]);

  const presentCount = useMemo(() => {
    let n = 0;
    for (const rows of rowsByPerson.values()) {
      if (rows.some((r) => r.status === "PRESENT")) n += 1;
    }
    return n;
  }, [rowsByPerson]);

  const dayTotalHalalas = useMemo(
    () =>
      sumHalalas(
        (todayData?.attendance ?? [])
          .filter((r) => r.status === "PRESENT")
          .map((r) => mulRateHours(r.dailyRate, r.hours)),
      ),
    [todayData],
  );

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["weeks"] });
  }

  async function mark(personId: string, status: MarkStatus) {
    const key = `${personId}:${status}`;
    setBusyKey(key);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/attendance/quick-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, date, status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "فشل التسجيل");
      const skipped = (body.skipped ?? []) as AttendanceConflict[];
      setConflicts((c) => ({ ...c, [personId]: skipped }));
      const recorded = (body.projects ?? []) as { projectId: string; projectName: string }[];
      const personName = peopleData?.people.find((p) => p.id === personId)?.name ?? "";
      setLastResult({ personName, status, names: recorded.map((p) => p.projectName) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التسجيل");
    } finally {
      setBusyKey(null);
    }
  }

  async function moveHere(personId: string, toProjectId: string) {
    setMovingId(personId);
    try {
      const res = await fetch("/api/attendance/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, date, toProjectId }),
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

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">الحضور اليومي</h1>
            <p className="text-sm text-muted-foreground">
              علّم العامل حاضراً في مواقع عمله — حاضر {presentCount} من {people.length} •{" "}
              {date}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
              قيمة الحضور اليوم: {formatSAR(dayTotalHalalas)}
            </div>
            <Button variant="outline" onClick={() => window.print()}>
              طباعة الكشف
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="att-date" className="text-sm font-medium">
                التاريخ
              </label>
              <Input
                id="att-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setConflicts({});
                  setLastResult(null);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="att-search" className="text-sm font-medium">
                بحث عن عامل
              </label>
              <Input
                id="att-search"
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

        {lastResult && (
          <p
            role="status"
            className={
              lastResult.names.length > 0
                ? "rounded-md bg-success/10 px-3 py-2 text-sm text-success"
                : "rounded-md bg-warning/10 px-3 py-2 text-sm text-warning"
            }
          >
            {lastResult.names.length > 0
              ? `تم تسجيل ${lastResult.personName} حاضراً في: ${lastResult.names.join("، ")}`
              : `لم يتم التسجيل في أي مشروع — ${lastResult.personName} غير معين في مشروع يعمل بهذا التاريخ`}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-success" />
            مسجَّل حضور
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-warning" />
            إجازة
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-border" />
            لم يُسجَّل
          </span>
        </div>

        {peopleLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        ) : people.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">لا يوجد عمال مطابقون.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {people.map((p) => {
              const eligible = eligibleByPerson.get(p.id) ?? [];
              const rows = rowsByPerson.get(p.id) ?? [];
              const present = rows.find((r) => r.status === "PRESENT");
              const other = !present ? rows[0] : undefined;
              const personConflicts = conflicts[p.id] ?? [];
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center",
                    present && "border-success/40 bg-success/5",
                    !present && other && "opacity-75",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant={p.type === "CRAFTSMAN" ? "default" : "secondary"}>
                        {PERSON_TYPE_LABELS[p.type]}
                      </Badge>
                      {present ? (
                        <Badge variant="success">مسجَّل حضور</Badge>
                      ) : other ? (
                        <Badge variant="warning">إجازة</Badge>
                      ) : (
                        <Badge variant="outline">لم يُسجَّل</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {eligible.length > 0 ? (
                        <>المواقع: {eligible.map((a) => a.projectName).join("، ")}</>
                      ) : (
                        "غير معين في موقع عمل اليوم"
                      )}
                    </div>
                    {present && (
                      <div className="mt-1 text-xs font-medium text-success">
                        حاضر في {present.projectName}
                      </div>
                    )}
                    {!present && other && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        إجازة في {other.projectName}
                      </div>
                    )}
                    {!present && personConflicts.length > 0 && (
                      <div className="mt-1 text-xs font-medium text-warning">
                        مسجل حاضر في «{personConflicts[0].existingProjectName}» — يوم مدفوع واحد لكل شخص.
                      </div>
                    )}
                  </div>
                  {canEdit && !present && eligible.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        className="min-h-[44px]"
                        disabled={busyKey === `${p.id}:PRESENT`}
                        onClick={() => mark(p.id, "PRESENT")}
                      >
                        {busyKey === `${p.id}:PRESENT` ? "…" : "حاضر"}
                      </Button>
                    </div>
                  )}
                  {!present && personConflicts.length > 0 && canEdit && (
                    <div className="flex flex-wrap gap-1">
                      {eligible.map((a) => (
                        <Button
                          key={a.projectId}
                          size="sm"
                          variant="outline"
                          disabled={movingId === p.id}
                          onClick={() => moveHere(p.id, a.projectId)}
                        >
                          {movingId === p.id ? "جارٍ النقل…" : `نقل إلى ${a.projectName}`}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="hidden print:block">
        <div className="flex items-center justify-between border-b border-foreground/20 pb-3">
          <Image
            src="/tarek-al-wakil-logo.png"
            alt="شعار طارق الوكيل"
            width={1408}
            height={768}
            className="h-12 w-auto object-contain"
          />
          <span className="text-xl font-bold">الوكيل — كشف الحضور اليومي</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          التاريخ: {date} • حاضر: {presentCount} • من {people.length} • تاريخ الطباعة:{" "}
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
            {people.map((p) => {
              const rows = rowsByPerson.get(p.id) ?? [];
              const presentRow = rows.find((r) => r.status === "PRESENT");
              const otherRow = !presentRow ? rows[0] : undefined;
              return (
                <tr key={p.id} className="border-b">
                  <td className="py-2">{p.name}</td>
                  <td className="py-2">{PERSON_TYPE_LABELS[p.type]}</td>
                  <td className="py-2 font-semibold">
                    {presentRow
                      ? `حاضر في ${presentRow.projectName}`
                      : otherRow
                        ? `إجازة في ${otherRow.projectName}`
                        : "لم يسجل"}
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
    </AppShell>
  );
}
