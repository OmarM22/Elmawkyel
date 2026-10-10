import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { payWorker } from "@/server/store";
import { canManage } from "@/lib/validation";

const paySchema = z.object({
  personId: z.string().min(1, "اختر العامل"),
  amountHalalas: z.number().int("المبلغ يجب أن يكون عدداً صحيحاً").positive("المبلغ يجب أن يكون موجباً"),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Pay a worker across open dues, oldest week first. Partial allowed;
 * overpayment rejected. Weeks that become fully paid flip to SETTLED.
 * ADMIN only.
 */
export async function POST(req: Request) {
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
  const parsed = paySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  try {
    const result = await payWorker(
      parsed.data.personId,
      parsed.data.amountHalalas,
      parsed.data.notes,
      session.user.id,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشل الدفع" },
      { status: 400 },
    );
  }
}
