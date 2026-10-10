import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { quickMark } from "@/server/store";
import { canManage } from "@/lib/validation";

const quickMarkSchema = z.object({
  personId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صالح"),
  status: z.enum(["PRESENT"]),
});

/**
 * Workforce-first quick mark: record one status across every eligible
 * project (open assignment, ACTIVE project, working day). PRESENT keeps
 * UNIQUE(person, date) — an existing payable mark elsewhere is reported
 * as a conflict instead of duplicated. ADMIN only.
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
  const parsed = quickMarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  try {
    const result = await quickMark(
      parsed.data.personId,
      parsed.data.date,
      parsed.data.status,
      session.user.id,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشل التسجيل" },
      { status: 400 },
    );
  }
}
