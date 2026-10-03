import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProject, getProjectTeam, updateProject } from "@/server/store";
import { canManage, projectPatchSchema } from "@/lib/validation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  const team = await getProjectTeam(id);
  return NextResponse.json({ project, team });
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
  const parsed = projectPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  const { id } = await params;
  const project = await updateProject(id, parsed.data);
  if (!project) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  return NextResponse.json({ project });
}
