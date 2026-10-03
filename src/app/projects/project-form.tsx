"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { projectCreateSchema, type ProjectCreateInput } from "@/lib/validation";
import {
  DAY_OF_WEEK_LABELS,
  PERSON_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  type PersonRow,
  type ProjectRow,
  type TeamMember,
} from "@/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

interface ProjectFormProps {
  initial?: ProjectRow | null;
  onDone: () => void;
}

/** Create/edit form for projects. Empty end date means open-ended. */
export function ProjectForm({ initial, onDone }: ProjectFormProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const editing = !!initial;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectCreateInput>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      name: initial?.name ?? "",
      startDate: initial?.startDate ?? "",
      endDate: initial?.endDate ?? undefined,
      status: initial?.status ?? "ACTIVE",
      workingDays: (initial?.workingDays ?? [
        "SATURDAY",
        "SUNDAY",
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
      ]) as ProjectCreateInput["workingDays"],
    },
  });

  const { data: peopleData } = useQuery({
    queryKey: ["people-active"],
    queryFn: () => getJson<{ people: PersonRow[] }>("/api/people?active=true"),
  });
  const { data: teamData } = useQuery({
    queryKey: ["project-team", initial?.id],
    queryFn: () =>
      getJson<{ project: ProjectRow; team: TeamMember[] }>(`/api/projects/${initial!.id}`),
    enabled: !!initial,
  });
  const [selected, setSelected] = useState<string[] | null>(null);
  const effectiveSelected =
    selected ?? teamData?.team.map((t) => t.personId) ?? [];

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const base = prev ?? teamData?.team.map((t) => t.personId) ?? [];
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  }

  async function onSubmit(values: ProjectCreateInput) {
    setServerError(null);
    const payload = { ...values, endDate: values.endDate?.trim() ? values.endDate : undefined };
    const url = editing ? `/api/projects/${initial!.id}` : "/api/projects";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? "فشل الحفظ");
      return;
    }
    const savedId = editing ? initial!.id : (body.project?.id as string | undefined);
    if (!savedId) {
      setServerError("فشل الحفظ");
      return;
    }
    // Sync workforce selection: assign newly checked, end-date newly unchecked.
    const original = initial ? (teamData?.team.map((t) => t.personId) ?? []) : [];
    const added = effectiveSelected.filter((id) => !original.includes(id));
    const removed = original.filter((id) => !effectiveSelected.includes(id));
    let failures = 0;
    for (const pid of added) {
      const r = await fetch(`/api/projects/${savedId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: pid }),
      });
      if (!r.ok) failures += 1;
    }
    for (const pid of removed) {
      const r = await fetch(`/api/projects/${savedId}/assignments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: pid }),
      });
      if (!r.ok) failures += 1;
    }
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    await queryClient.invalidateQueries({ queryKey: ["project", savedId] });
    if (failures > 0) {
      setServerError(`تم حفظ المشروع لكن تعذر تحديث ${failures} من تعيينات العمالة`);
      return;
    }
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing ? "تعديل المشروع" : "إضافة مشروع جديد"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-name" className="text-sm font-medium">
              اسم المشروع
            </label>
            <Input id="project-name" {...register("name")} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-status" className="text-sm font-medium">
              الحالة
            </label>
            <select
              id="project-status"
              {...register("status")}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(Object.keys(PROJECT_STATUS_LABELS) as (keyof typeof PROJECT_STATUS_LABELS)[]).map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {errors.status && <p className="text-sm text-destructive">{errors.status.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-start" className="text-sm font-medium">
              تاريخ البداية
            </label>
            <Input id="project-start" type="date" {...register("startDate")} aria-invalid={!!errors.startDate} />
            {errors.startDate && <p className="text-sm text-destructive">{errors.startDate.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-end" className="text-sm font-medium">
              تاريخ النهاية (اتركه فارغاً للمفتوح)
            </label>
            <Input id="project-end" type="date" {...register("endDate")} aria-invalid={!!errors.endDate} />
            {errors.endDate && <p className="text-sm text-destructive">{errors.endDate.message}</p>}
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">أيام العمل</legend>
            <div className="flex flex-wrap gap-3">
              {Object.entries(DAY_OF_WEEK_LABELS).map(([day, label]) => (
                <label key={day} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" value={day} {...register("workingDays")} className="size-4" />
                  {label}
                </label>
              ))}
            </div>
            {errors.workingDays && <p className="text-sm text-destructive">{errors.workingDays.message}</p>}
          </fieldset>
          {serverError && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {serverError}
            </p>
          )}
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">
              العمال المعينون على المشروع ({effectiveSelected.length})
            </legend>
            {(peopleData?.people ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد عمال نشطون.</p>
            ) : (
              <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {(peopleData?.people ?? []).map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={effectiveSelected.includes(p.id)}
                      onChange={() => toggleSelected(p.id)}
                      className="size-4"
                    />
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{PERSON_TYPE_LABELS[p.type]}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "إضافة"}
            </Button>
            <Button type="button" variant="outline" onClick={onDone}>
              إلغاء
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
