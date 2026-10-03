"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatSAR, toHalalas } from "@/lib/money";
import type { WeekSummary } from "@/types";

interface SettleFormProps {
  week: WeekSummary;
  projectId: string;
  onDone: () => void;
}

function remainingSar(dueHalalas: number, paidHalalas: number): string {
  return ((dueHalalas - paidHalalas) / 100).toFixed(2);
}

/** Record payments against a week's dues. Amounts default to the remaining balance. */
export function SettleForm({ week, projectId, onDone }: SettleFormProps) {
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(week.dues.map((d) => [d.personId, remainingSar(d.dueHalalas, d.paidHalalas)])),
  );
  const [notes, setNotes] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const clean: { personId: string; amountHalalas: number }[] = [];
    for (const d of week.dues) {
      const raw = (amounts[d.personId] ?? "").trim();
      if (!raw) continue;
      const amountHalalas = toHalalas(raw);
      if (amountHalalas <= 0) continue;
      if (amountHalalas > d.dueHalalas - d.paidHalalas) {
        setServerError(`المبلغ يتجاوز المتبقي لـ ${d.personName}`);
        return;
      }
      clean.push({ personId: d.personId, amountHalalas });
    }
    if (clean.length === 0) {
      setServerError("أدخل مبلغاً واحداً على الأقل");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/weeks/${week.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments: clean, notes: notes.trim() ? notes.trim() : undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(body.error ?? "فشلت التسوية");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["weeks", projectId] });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          تسوية الأسبوع {week.weekNumber} ({week.startDate} ← {week.endDate})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {week.dues.map((d) => {
            const remaining = d.dueHalalas - d.paidHalalas;
            return (
              <div
                key={d.personId}
                className="grid grid-cols-1 items-end gap-2 rounded-lg border p-3 sm:grid-cols-3"
              >
                <div>
                  <div className="font-medium">{d.personName}</div>
                  <div className="text-xs text-muted-foreground">
                    المستحق: {formatSAR(d.dueHalalas)} • المدفوع: {formatSAR(d.paidHalalas)} • المتبقي:{" "}
                    {formatSAR(remaining)}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label htmlFor={`pay-${d.personId}`} className="text-sm font-medium">
                    مبلغ الدفعة (ر.س)
                  </label>
                  <Input
                    id={`pay-${d.personId}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={amounts[d.personId] ?? ""}
                    onChange={(e) => setAmounts((m) => ({ ...m, [d.personId]: e.target.value }))}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="settle-notes" className="text-sm font-medium">
              ملاحظات (اختياري)
            </label>
            <Input
              id="settle-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: دفعة نقدية"
            />
          </div>
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "جارٍ الحفظ…" : "تأكيد الدفع"}
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
