"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type Role, type UserRow } from "@/types";
import { UserEditForm } from "./user-edit-form";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

const createSchema = z.object({
  username: z.string().trim().min(3, "اسم المستخدم ٣ أحرف على الأقل"),
  email: z.string().trim().email("البريد الإلكتروني غير صالح"),
  name: z.string().trim().min(2, "أدخل الاسم"),
  password: z.string().min(8, "كلمة المرور ٨ أحرف على الأقل"),
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]),
});

type CreateValues = z.infer<typeof createSchema>;

export default function UsersPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const isAdmin = session?.user?.role === "ADMIN";
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => getJson<{ users: UserRow[] }>("/api/users"),
    enabled: isAdmin,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({ resolver: zodResolver(createSchema) });

  async function onSubmit(values: CreateValues) {
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "فشل إنشاء المستخدم");
      setOk(`تم إنشاء حساب ${body.user.username} بنجاح`);
      reset();
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إنشاء المستخدم");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">إدارة المستخدمين</h1>
          <p className="text-sm text-muted-foreground">إنشاء الحسابات وإدارتها — للمدير فقط</p>
        </div>

        {!isAdmin && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">غير مصرح لك بعرض هذه الصفحة. هذه الصفحة لمدير النظام فقط.</p>
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <>
            {editing && <UserEditForm user={editing} onDone={() => setEditing(null)} />}
            <Card>
              <CardHeader>
                <CardTitle>المستخدمون الحاليون</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-20 animate-pulse rounded-lg bg-muted" />
                ) : !data || data.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا يوجد مستخدمون.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 text-right font-medium">الاسم</th>
                          <th className="py-2 text-right font-medium">اسم المستخدم</th>
                          <th className="py-2 text-right font-medium">البريد</th>
                          <th className="py-2 text-right font-medium">الدور</th>
                          <th className="py-2 text-right font-medium">الحالة</th>
                          <th className="py-2 text-right font-medium">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.users.map((u) => (
                          <tr key={u.id} className="border-b last:border-0">
                            <td className="py-2 font-medium">
                              {u.name}{" "}
                              {session?.user?.id === u.id && (
                                <Badge variant="outline">حسابك</Badge>
                              )}
                            </td>
                            <td className="py-2" dir="ltr">
                              {u.username}
                            </td>
                            <td className="py-2" dir="ltr">
                              {u.email}
                            </td>
                            <td className="py-2">
                              <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                                {ROLE_LABELS[u.role as Role]}
                              </Badge>
                            </td>
                            <td className="py-2">{u.active ? "نشط" : "موقوف"}</td>
                            <td className="py-2">
                              <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                                تعديل
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>إنشاء مستخدم جديد</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="u-name" className="text-sm font-medium">
                      الاسم
                    </label>
                    <Input id="u-name" {...register("name")} />
                    {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="u-username" className="text-sm font-medium">
                      اسم المستخدم
                    </label>
                    <Input id="u-username" dir="ltr" {...register("username")} />
                    {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="u-email" className="text-sm font-medium">
                      البريد الإلكتروني
                    </label>
                    <Input id="u-email" type="email" dir="ltr" {...register("email")} />
                    {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="u-password" className="text-sm font-medium">
                      كلمة المرور
                    </label>
                    <Input id="u-password" type="password" autoComplete="new-password" {...register("password")} />
                    {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="u-role" className="text-sm font-medium">
                      الدور
                    </label>
                    <select
                      id="u-role"
                      {...register("role")}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="VIEWER">مشاهد</option>
                      <option value="MANAGER">مشرف</option>
                      <option value="ADMIN">مدير النظام</option>
                    </select>
                    {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
                  </div>
                  <div className="flex items-end sm:col-span-2">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "جارٍ الإنشاء…" : "إنشاء المستخدم"}
                    </Button>
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-destructive sm:col-span-2">
                      {error}
                    </p>
                  )}
                  {ok && (
                    <p role="status" className="text-sm text-success sm:col-span-2">
                      {ok}
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
