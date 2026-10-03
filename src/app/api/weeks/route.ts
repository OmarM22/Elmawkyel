import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listWeeks } from "@/server/store";

/** Project weeks with dues, payments, and status. Requires ?projectId=. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "اختر المشروع" }, { status: 400 });
  try {
    const weeks = await listWeeks(projectId);
    return NextResponse.json({ weeks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر تحميل الأسابيع" },
      { status: 404 },
    );
  }
}
