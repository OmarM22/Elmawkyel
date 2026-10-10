import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getWorkerStatement } from "@/server/store";

/** Full account statement of one worker across all projects and weeks. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const personId = searchParams.get("personId");
  if (!personId) return NextResponse.json({ error: "اختر العامل" }, { status: 400 });
  try {
    const statement = await getWorkerStatement(personId);
    return NextResponse.json({ statement });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر تحميل الكشف" },
      { status: 404 },
    );
  }
}
