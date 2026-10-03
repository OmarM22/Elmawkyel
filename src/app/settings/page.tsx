"use client";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectRow } from "@/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

const DAY_LABELS: Record<string, string> = {
  SATURDAY: "السبت",
  SUNDAY: "الأحد",
  MONDAY: "الاثنين",
  TUESDAY: "الثلاثاء",
  WEDNESDAY: "الأربعاء",
  THURSDAY: "الخميس",
  FRIDAY: "الجمعة",
};

export default function SettingsPage() {
  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getJson<{ projects: ProjectRow[] }>("/api/projects"),
  });
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => getJson<{ mode: "demo" | "database" }>("/api/health"),
  });
  const isDemo = health?.mode !== "database";

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">الإعدادات</h1>
          <p className="text-sm text-muted-foreground">حالة النظام وإعدادات المشاريع</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>حالة النظام</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">وضع البيانات</span>
              <Badge variant="secondary">
                {isDemo ? "تجريبي (بدون قاعدة بيانات)" : "قاعدة بيانات PostgreSQL"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">المصادقة</span>
              <Badge variant="secondary">تسجيل دخول داخلي فقط</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">العملة</span>
              <span className="font-semibold">ريال سعودي (SAR)</span>
            </div>
            {isDemo && (
              <p className="mt-2 text-xs text-muted-foreground">
                لربط قاعدة بيانات PostgreSQL: حدّد DATABASE_URL الحقيقي، واضبط USE_DEMO_DATA=false، ثم نفّذ
                ترحيلات Prisma والبذر (seed) لإنشاء المدير الأول.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>أيام العمل لكل مشيوع</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(data?.projects ?? []).map((p) => (
              <div key={p.id} className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0">
                <span className="font-medium">{p.name}</span>
                <div className="flex flex-wrap gap-1">
                  {p.workingDays.map((d) => (
                    <Badge key={d} variant="outline">
                      {DAY_LABELS[d] || d}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
            {(!data || data.projects.length === 0) && (
              <p className="text-sm text-muted-foreground">لا توند مشاييع.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
