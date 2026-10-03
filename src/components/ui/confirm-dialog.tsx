"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  error?: string | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** RTL modal confirmation. No overlay libraries — shadcn-styled primitives only. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "تأكيد",
  error,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="destructive" onClick={onConfirm} disabled={busy}>
              {busy ? "جارٍ التنفيذ…" : confirmLabel}
            </Button>
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              إلغاء
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
