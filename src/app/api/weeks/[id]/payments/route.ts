import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { recordWeekPayments } from "@/server/store";
import { canManage } from "@/lib/validation";

const settleSchema = z.object({
  payments: z
    .array(
      z.object({
        personId: z.string().min(1),
        amountHalalas: z.number().int("المبلغ يجب أن يكون عدداً صحيحاً").positive("المبلغ يجب أن يكون موجباً"),
      }),
    )
    .min(1, "لا توجد مدفوعات"),
  notes: z.string().trim().max(500).optional(),
});

/** Record week payments (partial or full). Fully-paid weeks become SETTLED. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: "صلاحيات غير كافية" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const parsed = settleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  try {
    const { id } = await params;
    const result = await recordWeekPayments(id, {
      ...parsed.data,
      createdBy: session.user.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشلت التسوية" },
      { status: 400 },
    );
  }
}
