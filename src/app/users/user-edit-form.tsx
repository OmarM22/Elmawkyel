"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { userPatchSchema, type UserPatchInput } from "@/lib/validation";
import { ROLE_LABELS, type UserRow } from "@/types";

interface UserEditFormProps {
  user: UserRow;
  onDone: () => void;
}

/** Edit name/role/active flag, or reset the password (empty = unchanged). */
export function UserEditForm({ user, onDone }: UserEditFormProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserPatchInput>({
    resolver: zodResolver(userPatchSchema),
    defaultValues: { name: user.name, role: user.role, active: user.active },
  });

  async function onSubmit(values: UserPatchInput) {
    setServerError(null);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? "فشل الحفظ");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["users"] });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تعديل {user.username}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ue-name" className="text-sm font-medium">
              الاسم
            </label>
            <Input id="ue-name" {...register("name")} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ue-role" className="text-sm font-medium">
              الدور
            </label>
            <select
              id="ue-role"
              {...register("role")}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ue-password" className="text-sm font-medium">
              كلمة مرور جديدة (اتركها فارغة للإبقاء)
            </label>
            <Input
              id="ue-password"
              type="password"
              autoComplete="new-password"
              {...register("password", { setValueAs: (v) => (v === "" ? undefined : v) })}
              aria-invalid={!!errors.password}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
            <input type="checkbox" {...register("active")} className="size-4" />
            نشط
          </label>
          {serverError && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {serverError}
            </p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "جارٍ الحفظ…" : "حفظ التعديلات"}
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
