"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plane, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DAY_OF_WEEK_LABELS, PERSON_TYPE_LABELS, type AttendanceRow, type PersonRow, type ProjectRow, type TeamMember, type WeekSummary } from "@/types";
import { formatSAR } from "@/lib/money";

type StatusChoice = "PRESENT" | "ABSENT" | "LEAVE";

const STATUS_META: { value: StatusChoice; label: string; icon: typeof Check }[] = [
  { value: "PRESENT", label: "حاضر", icon: Check },
  { value: "ABSENT", label: "غائب", icon: Minus },
  { value: "LEAVE", label: "إجازة", icon: Plane },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const JS_DAY_TO_NAME = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AttendancePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canEdit = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [choices, setChoices] = useState<Record<string, StatusChoice>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getJson<{ projects: ProjectRow[] }>("/api/projects"),
  });
  const { data: peopleData, isLoading: peopleLoading } = useQuery({
    queryKey: ["people-active"],
    queryFn: () => getJson<{ people: PersonRow[] }>("/api/people?active=true"),
  });
  const { data: existing } = useQuery({
    queryKey: ["attendance", projectId, date],
    queryFn: () =>
      getJson<{ attendance: AttendanceRow[] }>(
        `/api/attendance?projectId=${projectId}&from=${date}&to=${date}`,
      ),
    enabled: projectId !== "" && date !== "",
  });

  const people = useMemo(() => peopleData?.people ?? [], [peopleData]);
  const existingByPerson = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const r of existing?.attendance ?? []) map.set(r.personId, r);
    return map;
  }, [existing]);

  // Non-blocking warning when the date falls on a project rest day.
  const selectedProject = useMemo(
    () => projectsData?.projects.find((p) => p.id === projectId) ?? null,
    [projectsData, projectId],
  );
  const dateDayName = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return JS_DAY_TO_NAME[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
  }, [date]);
  const isNonWorkingDay =
    !!selectedProject && !!dateDayName && !selectedProject.workingDays.includes(dateDayName);

  // Project team scope (defaults to team-only when a team is assigned).
  const { data: teamData } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getJson<{ project: ProjectRow; team: TeamMember[] }>(`/api/projects/${projectId}`),
    enabled: projectId !== "",
  });
  const team = useMemo(() => teamData?.team ?? [], [teamData?.team]);
  const [teamOnly, setTeamOnly] = useState(true);
  const visiblePeople = useMemo(() => {
    if (!teamOnly || team.length === 0) return people;
    const ids = new Set(team.map((t) => t.personId));
    return people.filter((p) => ids.has(p.id));
  }, [people, team, teamOnly]);

  // Settled-week pre-check: fail early instead of after filling the grid.
  const { data: weeksData } = useQuery({
    queryKey: ["weeks", projectId],
    queryFn: () => getJson<{ weeks: WeekSummary[] }>(`/api/weeks?projectId=${projectId}`),
    enabled: projectId !== "",
  });
  const lockedWeek = useMemo(
    () =>
      (weeksData?.weeks ?? []).find(
        (w) => w.status === "SETTLED" && date >= w.startDate && date <= w.endDate,
      ) ?? null,
    [weeksData, date],
  );

  // Live summary of the current grid state (counts + cost at snapshot rates).
  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let leave = 0;
    let halalas = 0;
    for (const p of visiblePeople) {
      const st = choices[p.id] ?? existingByPerson.get(p.id)?.status ?? "PRESENT";
      if (st === "PRESENT") {
        present += 1;
        halalas += Math.round(p.currentDailyRate * 100);
      } else if (st === "ABSENT") {
        absent += 1;
      } else {
        leave += 1;
      }
    }
    return { present, absent, leave, halalas };
  }, [visiblePeople, choices, existingByPerson]);

  function setChoice(id: string, value: StatusChoice) {
    setChoices((c) => ({ ...c, [id]: value }));
  }

  function markAllPresent() {
    const next: Record<string, StatusChoice> = {};
    for (const p of visiblePeople) next[p.id] = "PRESENT";
    setChoices(next);
  }

  async function submit() {
    if (!projectId || !date) return;
    setSaving(true);
    setError(null);
    setResult(null);
    const records = visiblePeople.map((p) => ({
      personId: p.id,
      status: choices[p.id] ?? "PRESENT",
      notes: notes[p.id]?.trim() ? notes[p.id].trim() : undefined,
    }));
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, date, records }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "فشل تسجيل الحضور");
      setResult(`تم الحفظ: ${body.recorded} جديد، ${body.updated} محدّث`);
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تسجيل الحضور");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">تسجيل اليومية</h1>
          <p className="text-sm text-muted-foreground">
            اختر المشروع والتاريخ، ثم سجّل حضور جميع الأفراد دفعة واحدة
          </p>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project" className="text-sm font-medium">
                المشروع
              </label>
              <select
                id="project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
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
              <label htmlFor="date" className="text-sm font-medium">
                التاريخ
              </label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {isNonWorkingDay && selectedProject && dateDayName && (
          <Card className="border-warning/50">
            <CardContent className="pt-6">
              <p className="flex items-center gap-2 text-sm font-medium text-warning">
                <TriangleAlert className="size-4" />
                تنبيه: يوم {DAY_OF_WEEK_LABELS[dateDayName]} ({date}) ليس من أيام العمل المسجلة لهذا المشروع
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                أيام العمل: {selectedProject.workingDays.map((d) => DAY_OF_WEEK_LABELS[d] || d).join("، ")} —
                يمكنك المتابعة عند الحاجة (عمل إضافي).
              </p>
            </CardContent>
          </Card>
        )}

        {!projectId && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">اختر المشروع لعرض الأفراد وتسجيل حضورهم.</p>
            </CardContent>
          </Card>
        )}

        {projectId && team.length > 0 && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={teamOnly}
              onChange={(e) => setTeamOnly(e.target.checked)}
              className="size-4"
            />
            عرض فريق المشروع فقط ({team.length})
          </label>
        )}

        {projectId && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>كشف الحضور — {date}</CardTitle>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={markAllPresent}>
                  تحديد الكل حاضر
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {lockedWeek && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  هذا اليوم ({date}) ضمن الأسبوع {lockedWeek.weekNumber} المسوّى — لا يمكن تسجيل أو تعديل الحضور.
                </p>
              )}
              {peopleLoading && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
              {!peopleLoading && visiblePeople.length === 0 && (
                <p className="text-sm text-muted-foreground">لا يوجد عمال لعرضهم.</p>
              )}
              {visiblePeople.map((person) => {
                const current = choices[person.id] ?? existingByPerson.get(person.id)?.status ?? "PRESENT";
                return (
                  <div
                    key={person.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{person.name}</span>
                        <Badge variant={person.type === "CRAFTSMAN" ? "default" : "secondary"}>
                          {PERSON_TYPE_LABELS[person.type]}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        الأجر اليومي: {person.currentDailyRate} ر.س
                        {existingByPerson.has(person.id) && " • مسجل مسبقاً لهذا اليوم"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1" role="group" aria-label={`حالة ${person.name}`}>
                      {STATUS_META.map((s) => {
                        const Icon = s.icon;
                        const active = current === s.value;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => setChoice(person.id, s.value)}
                            aria-pressed={active}
                            className={cn(
                              "flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                              active
                                ? s.value === "PRESENT"
                                  ? "border-transparent bg-success/15 text-success"
                                  : s.value === "ABSENT"
                                    ? "border-transparent bg-destructive/15 text-destructive"
                                    : "border-transparent bg-warning/15 text-warning"
                                : "text-muted-foreground hover:bg-accent",
                            )}
                          >
                            <Icon className="size-3.5" />
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                    {canEdit && (
                      <Input
                        placeholder="ملاحظات (اختياري)"
                        value={notes[person.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [person.id]: e.target.value }))}
                        className="sm:w-48"
                        aria-label={`ملاحظات ${person.name}`}
                      />
                    )}
                  </div>
                );
              })}

              {!canEdit && (
                <p className="text-sm text-muted-foreground">صلاحية العرض فقط — التسجيل للمشرفين.</p>
              )}
              {result && (
                <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                  {result}
                </p>
              )}
              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              {visiblePeople.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  الملخص: {summary.present} حاضر • {summary.absent} غائب • {summary.leave} إجازة • الإجمالي:{" "}
                  {formatSAR(summary.halalas)}
                </p>
              )}
              {canEdit && visiblePeople.length > 0 && (
                <Button onClick={submit} disabled={saving || !!lockedWeek} className="mt-2 w-full sm:w-auto">
                  {saving ? "جارٍ الحفظ…" : `حفظ حضور ${visiblePeople.length} أفراد`}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
