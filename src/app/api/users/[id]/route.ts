import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateUser } from "@/server/store";
import { hashPassword } from "@/lib/password";
import { userPatchSchema } from "@/lib/validation";

function isAdmin(role: string | undefined) {
  return role === "ADMIN";
}

/**
 * Update a user (name, role, active flag, or reset password). ADMIN only.
 * Self-protection: an admin cannot demote or deactivate their own account.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "هذه الصفحة للمدير فقط" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const parsed = userPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  const { id } = await params;
  if (
    id === session.user.id &&
    (parsed.data.active === false ||
      (parsed.data.role !== undefined && parsed.data.role !== session.user.role))
  ) {
    return NextResponse.json({ error: "لا يمكنك تغيير دور حسابك أو إيقافه" }, { status: 403 });
  }
  const { password, ...rest } = parsed.data;
  const user = await updateUser(id, {
    ...rest,
    passwordHash: password ? await hashPassword(password) : undefined,
  });
  if (!user) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  return NextResponse.json({ user });
}
