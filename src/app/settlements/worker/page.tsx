"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatSAR, toHalalas } from "@/lib/money";
import type { PersonRow, WorkerStatement } from "@/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

/*
 * Worker payoff page: full account statement of one worker across every
 * project and week, with oldest-first payment allocation. Separate from
 * the weekly flow — this settles the person, not the period.
 */
export default function WorkerSettlementPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canManage = session?.user?.role === "ADMIN";

  const [personId, setPersonId] = useState("");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastAllocations, setLastAllocations] = useState<
    { weekId: string; projectName: string; amountHalalas: number }[] | null
  >(null);

  const { data: peopleData } = useQuery({
    queryKey: ["people-active"],
    queryFn: () => getJson<{ people: PersonRow[] }>("/api/people?active=true"),
  });
  const { data: statementData, isLoading: statementLoading } = useQuery({
    queryKey: ["worker-statement", personId],
    queryFn: () => getJson<{ statement: WorkerStatement }>(`/api/settlements/statement?personId=${personId}`),
    enabled: personId !== "",
  });
  const statement = statementData?.statement ?? null;
  // Amount input defaults to the full remaining balance until the user types.
  const amountValue =
    amountTouched || !statement ? amount : (statement.totalRemaining / 100).toFixed(2);

  async function pay() {
    if (!personId || !statement) return;
    setServerError(null);
    setLastAllocations(null);
    let amountHalalas: number;
    try {
      amountHalalas = toHalalas(amountValue);
    } catch {
      setServerError("المبلغ غير صالح");
      return;
    }
    if (amountHalalas <= 0) {
      setServerError("أدخل مبلغاً موجباً");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settlements/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          amountHalalas,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(body.error ?? "فشل الدفع");
        return;
      }
      setLastAllocations(body.allocations ?? []);
      setAmount("");
      setAmountTouched(false);
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["worker-statement", personId] });
      await queryClient.invalidateQueries({ queryKey: ["weeks"] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">تصفية العمال</h1>
          <p className="text-sm text-muted-foreground">كشف حساب العامل عبر كل المشاريع — الدفع يوزَّع على الأقدم أولاً</p>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ws-person" className="text-sm font-medium">
                العامل
              </label>
              <select
                id="ws-person"
                value={personId}
                onChange={(e) => {
                  setPersonId(e.target.value);
                  setLastAllocations(null);
                  setServerError(null);
                  setAmount("");
                  setAmountTouched(false);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">اختر العامل…</option>
                {(peopleData?.people ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {personId && statementLoading && (
          <Card>
            <CardContent className="pt-6">
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        )}

        {statement && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  حساب {statement.personName} — المتبقي: {formatSAR(statement.totalRemaining)}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span>
                    إجمالي المستحق: <strong>{formatSAR(statement.totalDue)}</strong>
                  </span>
                  <span>
                    إجمالي المدفوع: <strong>{formatSAR(statement.totalPaid)}</strong>
                  </span>
                </div>
                {statement.dues.length === 0 ? (
                  <p className="text-muted-foreground">لا مستحقات لهذا العامل.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 text-right font-medium">المشروع</th>
                          <th className="py-2 text-right font-medium">الأسبوع</th>
                          <th className="py-2 text-right font-medium">المستحق</th>
                          <th className="py-2 text-right font-medium">المدفوع</th>
                          <th className="py-2 text-right font-medium">المتبقي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.dues.map((d) => (
                          <tr key={`${d.projectId}-${d.weekId}`} className="border-b last:border-0">
                            <td className="py-2">{d.projectName}</td>
                            <td className="py-2" dir="ltr">
                              #{d.weekNumber} ({d.weekStartDate})
                            </td>
                            <td className="py-2">{formatSAR(d.dueHalalas)}</td>
                            <td className="py-2">{formatSAR(d.paidHalalas)}</td>
                            <td className="py-2 font-semibold">{formatSAR(d.dueHalalas - d.paidHalalas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {statement.payments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>سجل المدفوعات ({statement.payments.length})</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {statement.payments.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2 text-sm">
                      <span className="font-semibold">{formatSAR(p.amountHalalas)}</span>
                      <span className="text-muted-foreground">
                        {p.projectName} • أسبوع {p.weekNumber} • <span dir="ltr">{p.paidAt.slice(0, 10)}</span>
                      </span>
                      {p.notes && <span className="text-muted-foreground">• {p.notes}</span>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {canManage && statement.totalRemaining > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>دفع للعامل</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="ws-amount" className="text-sm font-medium">
                        المبلغ (ر.س) — يُوزَّع على الأقدم أولاً
                      </label>
                      <Input
                        id="ws-amount"
                        type="number"
                        min={0}
                        step="0.01"
                        value={amountValue}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setAmountTouched(true);
                        }}
                        placeholder={(statement.totalRemaining / 100).toFixed(2)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="ws-notes" className="text-sm font-medium">
                        ملاحظات (اختياري)
                      </label>
                      <Input
                        id="ws-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="مثال: تصفية نهائية"
                      />
                    </div>
                  </div>
                  {serverError && (
                    <p role="alert" className="text-sm text-destructive">
                      {serverError}
                    </p>
                  )}
                  {lastAllocations && lastAllocations.length > 0 && (
                    <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                      تم التوزيع:{" "}
                      {lastAllocations
                        .map((a) => `${a.projectName} (${formatSAR(a.amountHalalas)})`)
                        .join("، ")}
                    </div>
                  )}
                  <div>
                    <Button onClick={pay} disabled={saving}>
                      {saving ? "جارٍ الدفع…" : "تأكيد الدفع"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {canManage && statement.totalRemaining <= 0 && statement.totalDue > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="flex items-center gap-2 text-sm font-medium text-success">
                    <Badge variant="secondary">مصفّى بالكامل</Badge>
                    لا يوجد رصيد مستحق لهذا العامل.
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
