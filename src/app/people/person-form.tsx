"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { personCreateSchema, type PersonCreateInput } from "@/lib/validation";
import { PERSON_TYPE_LABELS, type PersonRow } from "@/types";

interface PersonFormProps {
  initial?: PersonRow | null;
  onDone: () => void;
}

/** Create/edit form for people. Always validates the full create schema. */
export function PersonForm({ initial, onDone }: PersonFormProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const editing = !!initial;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PersonCreateInput>({
    resolver: zodResolver(personCreateSchema),
    defaultValues: {
      name: initial?.name ?? "",
      type: initial?.type ?? "WORKER",
      phone: initial?.phone ?? "",
      currentDailyRate: initial?.currentDailyRate ?? 200,
      active: initial?.active ?? true,
    },
  });

  async function onSubmit(values: PersonCreateInput) {
    setServerError(null);
    const url = editing ? `/api/people/${initial!.id}` : "/api/people";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? "فشل الحفظ");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["people"] });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing ? "تعديل بيانات الشخص" : "إضافة شخص جديد"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="person-name" className="text-sm font-medium">
              الاسم
            </label>
            <Input id="person-name" {...register("name")} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="person-type" className="text-sm font-medium">
              النوع
            </label>
            <select
              id="person-type"
              {...register("type")}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(Object.keys(PERSON_TYPE_LABELS) as (keyof typeof PERSON_TYPE_LABELS)[]).map((t) => (
                <option key={t} value={t}>
                  {PERSON_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="person-phone" className="text-sm font-medium">
              الهاتف (اختياري)
            </label>
            <Input
              id="person-phone"
              dir="ltr"
              placeholder="05xxxxxxxx"
              {...register("phone")}
              aria-invalid={!!errors.phone}
            />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="person-rate" className="text-sm font-medium">
              الأجر اليومي (ر.س)
            </label>
            <Input
              id="person-rate"
              type="number"
              min={0}
              step="0.01"
              {...register("currentDailyRate", { valueAsNumber: true })}
              aria-invalid={!!errors.currentDailyRate}
            />
            {errors.currentDailyRate && (
              <p className="text-sm text-destructive">{errors.currentDailyRate.message}</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" {...register("active")} className="size-4" />
            نشط (يظهر في كشوف التسجيل)
          </label>
          {serverError && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {serverError}
            </p>
          )}
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
