import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deletePerson, getPersonDetail, updatePerson } from "@/server/store";
import { canManage, personPatchSchema } from "@/lib/validation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const { id } = await params;
  const person = await getPersonDetail(id);
  if (!person) return NextResponse.json({ error: "الشخص غير موجود" }, { status: 404 });
  return NextResponse.json({ person });
}

export async function PATCH(
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
  const parsed = personPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  const { id } = await params;
  const person = await updatePerson(id, parsed.data);
  if (!person) return NextResponse.json({ error: "الشخص غير موجود" }, { status: 404 });
  return NextResponse.json({ person });
}

/**
 * Hard-delete a person with no history. Blocked (409) when attendance,
 * payments, or an open assignment reference them — deactivate instead.
 * ADMIN/MANAGER only.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: "صلاحيات غير كافية" }, { status: 403 });
  }
  try {
    const { id } = await params;
    await deletePerson(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل الحذف";
    const status = message === "الشخص غير موجود" ? 404 : message.startsWith("لا يمكن حذف") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
