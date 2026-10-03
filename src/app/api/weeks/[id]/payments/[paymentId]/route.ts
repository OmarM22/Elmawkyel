import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { voidWeekPayment } from "@/server/store";

/**
 * Void a single payment (correction path). ADMIN only — reversals of
 * money records get the strictest gate. Reopens the week when a balance
 * reappears; writes an audit entry either way.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "إلغاء المدفوعات للمدير فقط" }, { status: 403 });
  }
  try {
    const { id, paymentId } = await params;
    const result = await voidWeekPayment(id, paymentId, session.user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل إلغاء الدفعة";
    const status = message === "الدفعة غير موجودة" || message === "الأسبوع غير موجود" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
