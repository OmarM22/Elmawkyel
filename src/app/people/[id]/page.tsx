"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatSAR, sumHalalas } from "@/lib/money";
import { PERSON_TYPE_LABELS, type AttendanceRow, type PersonDetail } from "@/types";

async function fetchPerson(id: string): Promise<{ person: PersonDetail }> {
  const res = await fetch(`/api/people/${id}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

async function fetchLog(id: string): Promise<{ attendance: AttendanceRow[] }> {
  const res = await fetch(`/api/attendance?personId=${id}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

const STATUS_LABELS: Record<AttendanceRow["status"], string> = {
  PRESENT: "حاضر",
  ABSENT: "غائب",
  LEAVE: "إجازة",
};

const STATUS_VARIANTS: Record<AttendanceRow["status"], "success" | "destructive" | "warning"> = {
  PRESENT: "success",
  ABSENT: "destructive",
  LEAVE: "warning",
};

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["person", id],
    queryFn: () => fetchPerson(id),
  });
  const logQuery = useQuery({
    queryKey: ["attendance", "person", id],
    queryFn: () => fetchLog(id),
  });
  const log = [...(logQuery.data?.attendance ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Link href="/people" className="text-sm text-primary hover:underline">
          → العودة إلى الأشخاص
        </Link>

        {isLoading && (
          <Card>
            <CardContent className="pt-6">
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        )}
        {isError && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">تعذر تحميل بيانات الشخص.</p>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-xl">{data.person.name}</CardTitle>
                <Badge variant={data.person.type === "CRAFTSMAN" ? "default" : "secondary"}>
                  {PERSON_TYPE_LABELS[data.person.type]}
                </Badge>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">الأجر اليومي الحالي</div>
                  <div className="font-semibold">{data.person.currentDailyRate} ر.س</div>
                </div>
                <div>
                  <div className="text-muted-foreground">الهاتف</div>
                  <div className="font-semibold" dir="ltr">
                    {data.person.phone || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">الحالة</div>
                  <div className={cn("font-semibold", data.person.active ? "text-success" : "text-destructive")}>
                    {data.person.active ? "نشط" : "غير نشط"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">إجمالي المستحق</div>
                  <div className="font-semibold">
                    {formatSAR(sumHalalas(data.person.assignments.map((a) => a.totalHalalas)))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>السجل حسب المشروع</CardTitle>
              </CardHeader>
              <CardContent>
                {data.person.assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد يوميات مسجلة لهذا الشخص بعد.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 text-right font-medium">المشروع</th>
                          <th className="py-2 text-right font-medium">الأيام</th>
                          <th className="py-2 text-right font-medium">الأجر</th>
                          <th className="py-2 text-right font-medium">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.person.assignments.map((a) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="py-2">{a.projectName}</td>
                            <td className="py-2">{a.days}</td>
                            <td className="py-2">{a.dailyRate} ر.س</td>
                            <td className="py-2 font-semibold">{formatSAR(a.totalHalalas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  الأجر المعروض هو الأجر المحفوظ وقت تسجيل كل يومية (لا يتأثر بتغيير الأجر الحالي).
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>سجل اليوميات ({log.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {log.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد يوميات مسجلة لهذا الشخص بعد.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 text-right font-medium">التاريخ</th>
                          <th className="py-2 text-right font-medium">المشروع</th>
                          <th className="py-2 text-right font-medium">الحالة</th>
                          <th className="py-2 text-right font-medium">الأجر</th>
                          <th className="py-2 text-right font-medium">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {log.map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2" dir="ltr">
                              {r.date}
                            </td>
                            <td className="py-2">{r.projectName}</td>
                            <td className="py-2">
                              <Badge variant={STATUS_VARIANTS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                            </td>
                            <td className="py-2">{formatSAR(Math.round(r.dailyRate * 100) * r.hours)}</td>
                            <td className="py-2 text-muted-foreground">{r.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
