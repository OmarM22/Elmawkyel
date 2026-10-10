import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { listAttendance, recordAttendanceBatch } from "@/server/store";

const batchSchema = z.object({
  projectId: z.string().min(1, "اختر المشروع"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صالح"),
  records: z
    .array(
      z.object({
        personId: z.string().min(1),
        status: z.enum(["PRESENT", "LEAVE"]),
        notes: z.string().max(500).optional(),
      }),
    )
    .min(1, "لا توجد سجلات"),
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const rows = await listAttendance({
    projectId: searchParams.get("projectId") ?? undefined,
    personId: searchParams.get("personId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  return NextResponse.json({ attendance: rows });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "صلاحيات غير كافية" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  try {
    const result = await recordAttendanceBatch({
      ...parsed.data,
      createdBy: session.user.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشل تسجيل الحضور" },
      { status: 400 },
    );
  }
}
