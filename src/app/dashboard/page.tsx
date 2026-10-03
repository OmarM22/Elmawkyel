"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, CalendarDays, ClipboardCheck, Minus, RefreshCw, TrendingDown, TrendingUp, TriangleAlert, Users, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSAR } from "@/lib/money";
import type { DashboardData } from "@/types";

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/dashboard");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

function SkeletonCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-9 w-2/3 animate-pulse rounded-lg bg-muted" />
      </CardContent>
    </Card>
  );
}

/** Week-over-week delta line. `judge` colors up/down as good/bad (attendance); cost stays neutral. */
function DeltaLine({ value, format, judge }: { value: number; format: (v: number) => string; judge: boolean }) {
  if (value === 0) {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3.5" />
        لا تغيير عن الأسبوع الماضي
      </p>
    );
  }
  const up = value > 0;
  return (
    <p
      className={`mt-1 flex items-center gap-1 text-xs ${
        judge ? (up ? "text-success" : "text-destructive") : "text-muted-foreground"
      }`}
    >
      {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {up ? `+${format(value)}` : format(value)} عن الأسبوع الماضي
    </p>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });
  const canRecord = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

  const rate =
    data && data.today.present + data.today.absent > 0
      ? Math.round((data.today.present / (data.today.present + data.today.absent)) * 100)
      : null;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">لوحة التحكم</h1>
            <p className="text-sm text-muted-foreground">نظرة عامة على المشاريع والعمالة والتكلفة</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canRecord && (
              <Button asChild>
                <Link href="/attendance">
                  <ClipboardCheck className="size-4" />
                  تسجيل اليومية
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/weekly">الحصر الأسبوعي</Link>
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching} aria-label="تحديث البيانات">
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              تحديث
            </Button>
          </div>
        </div>

        {data && data.endingSoon.length > 0 && (
          <Card className="border-warning/50">
            <CardContent className="flex flex-col gap-2 pt-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                <TriangleAlert className="size-4" />
                مشاريع تنتهي قريباً
              </p>
              {data.endingSoon.map((p) => (
                <p key={p.id} className="text-sm text-muted-foreground">
                  {p.name} — ينتهي {p.endDate} (متبقٍ {p.daysLeft} {p.daysLeft === 1 ? "يوم واحد" : "أيام"})
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard title="المشاريع النشطة" />
            <SkeletonCard title="إجمالي العمال والصنايعية" />
            <SkeletonCard title="يوميات الأسبوع" />
            <SkeletonCard title="تكلفة العمالة" />
          </div>
        )}

        {isError && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">تعذر تحميل البيانات. حاول تحديث الصفحة.</p>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                href="/projects"
                aria-label="عرض المشاريع"
                className="block rounded-lg transition-shadow hover:shadow-md"
              >
                <Card className="h-full">
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">المشاريع النشطة</CardTitle>
                    <Building2 className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{data.activeProjects}</div>
                    <p className="text-xs text-muted-foreground">من إجمالي {data.totalProjects} مشاريع</p>
                  </CardContent>
                </Card>
              </Link>
              <Link
                href="/people"
                aria-label="عرض الأشخاص"
                className="block rounded-lg transition-shadow hover:shadow-md"
              >
                <Card className="h-full">
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي العمال والصنايعية</CardTitle>
                    <Users className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{data.totalPeople}</div>
                    <p className="text-xs text-muted-foreground">{data.activePeople} نشط حالياً</p>
                  </CardContent>
                </Card>
              </Link>
              <Link
                href="/weekly"
                aria-label="عرض الحصر الأسبوعي"
                className="block rounded-lg transition-shadow hover:shadow-md"
              >
                <Card className="h-full">
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">يوميات الأسبوع</CardTitle>
                    <CalendarDays className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{data.weekAttendance}</div>
                    <p className="text-xs text-muted-foreground">
                      {data.weekLabel} • غياب: {data.weekAbsent} • إجازة: {data.weekLeave}
                    </p>
                    <DeltaLine value={data.weekAttendanceDelta} format={String} judge />
                  </CardContent>
                </Card>
              </Link>
              <Link
                href="/weekly"
                aria-label="عرض تكلفة الأسبوع"
                className="block rounded-lg transition-shadow hover:shadow-md"
              >
                <Card className="h-full">
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">تكلفة العمالة</CardTitle>
                    <Wallet className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{formatSAR(data.weekHalalas)}</div>
                    <p className="text-xs text-muted-foreground">{data.weekLabel}</p>
                    <DeltaLine value={data.weekHalalasDelta} format={formatSAR} judge={false} />
                  </CardContent>
                </Card>
              </Link>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>اليوم ({data.today.date})</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span>
                    حاضر: <strong>{data.today.present}</strong>
                  </span>
                  <span>
                    غائب: <strong>{data.today.absent}</strong>
                  </span>
                  <span>
                    إجازة: <strong>{data.today.leave}</strong>
                  </span>
                  <span>
                    نسبة الحضور: <strong>{rate === null ? "—" : `${rate}٪`}</strong>
                  </span>
                </div>
                {data.today.absentPeople.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">الغائبون اليوم:</span>
                    {data.today.absentPeople.map((p) => (
                      <Badge key={p.id} variant="outline">
                        {p.name}
                      </Badge>
                    ))}
                  </div>
                )}
                {data.today.missingProjects.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">لم تُسجَّل اليوم:</span>
                    {data.today.missingProjects.map((p) => (
                      <Badge key={p.id} variant="outline">
                        {p.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">تم تسجيل جميع المشاريع العاملة اليوم.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>تكلفة المشاريع ({data.weekLabel})</CardTitle>
              </CardHeader>
              <CardContent>
                {data.perProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد يوميات في هذه الفترة.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 text-right font-medium">المشروع</th>
                          <th className="py-2 text-right font-medium">أيام الحضور</th>
                          <th className="py-2 text-right font-medium">التكلفة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.perProject.map((p) => (
                          <tr key={p.projectId} className="border-b last:border-0">
                            <td className="py-2">{p.projectName}</td>
                            <td className="py-2">{p.days}</td>
                            <td className="py-2 font-semibold">{formatSAR(p.halalas)}</td>
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
                <CardTitle>التكلفة اليومية (آخر ١٤ يومًا)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto" dir="ltr">
                  <BarChart
                    width={640}
                    height={260}
                    data={data.daily.map((d) => ({ ...d, sar: d.halalas / 100 }))}
                    margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => v.slice(5)}
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v: number) => v.toLocaleString("en-US")}
                      tick={{ fontSize: 12 }}
                      width={60}
                    />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toLocaleString("en-US")} ر.س`, "التكلفة"]}
                      labelFormatter={(label) => `اليوم ${String(label)}`}
                    />
                    <Bar dataKey="sar" fill="var(--chart-1, #2563eb)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </div>
              </CardContent>
            </Card>

            {data.weekAttendance === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    لا توجد يوميات مسجلة بعد. ابدأ من صفحة «تسجيل اليومية» باختيار المشروع والتاريخ.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
