import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { assignPersonToProject, unassignPersonFromProject } from "@/server/store";
import { canManage } from "@/lib/validation";

const bodySchema = z.object({ personId: z.string().min(1, "اختر الشخص") });

/** Assign a person to the project (idempotent). ADMIN/MANAGER only. */
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  try {
    const { id } = await params;
    const assignment = await assignPersonToProject(id, parsed.data.personId);
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل التعيين";
    const status = message === "المشروع غير موجود" || message === "الشخص غير موجود" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/** End a person's assignment (history-preserving). ADMIN/MANAGER only. */
export async function DELETE(
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  const { id } = await params;
  const assignment = await unassignPersonFromProject(id, parsed.data.personId);
  return NextResponse.json({ assignment });
}
