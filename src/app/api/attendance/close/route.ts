import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { closeAttendanceDay, getDayClose, reopenAttendanceDay } from "@/server/store";
import { canManage } from "@/lib/validation";

const closeBodySchema = z.object({
  projectId: z.string().min(1, "اختر المشروع"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صالح"),
});

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Day-close status for one project + date. Any authenticated user. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const date = searchParams.get("date") ?? "";
  if (!projectId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return badRequest("المشروع والتاريخ مطلوبان");
  }
  const close = await getDayClose(projectId, date);
  return NextResponse.json({ closed: close !== null, close });
}

/**
 * Close the day: locks the project+date after review. No rows are created.
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
  const parsed = closeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  try {
    const result = await closeAttendanceDay(parsed.data.projectId, parsed.data.date, session.user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشل الإغلاق" },
      { status: 400 },
    );
  }
}

/**
 * Reopen a closed day: removes the close record and unlocks the day.
 * ADMIN only.
 */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "إعادة الفتح للمدير فقط" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const parsed = closeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  try {
    const result = await reopenAttendanceDay(parsed.data.projectId, parsed.data.date);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشلت إعادة الفتح" },
      { status: 400 },
    );
  }
}
