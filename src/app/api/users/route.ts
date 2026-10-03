import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createUser, listUsers } from "@/server/store";
import { hashPassword } from "@/lib/password";

const createSchema = z.object({
  username: z.string().trim().min(3, "اسم المستخدم ٣ أحرف على الأقل").max(50),
  email: z.string().trim().email("البريد الإلكتروني غير صالح"),
  name: z.string().trim().min(2, "أدخل الاسم").max(100),
  password: z.string().min(8, "كلمة المرور ٨ أحرف على الأقل"),
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]),
});

function isAdmin(role: string | undefined) {
  return role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "هذه الصفحة للمدير فقط" }, { status: 403 });
  }
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "صلاحيات غير كافية" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  try {
    const user = await createUser({
      ...parsed.data,
      passwordHash: await hashPassword(parsed.data.password),
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشل إنشاء المستخدم" },
      { status: 400 },
    );
  }
}
