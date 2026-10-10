import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listOpenAssignments } from "@/server/store";

/** Every open assignment (quick-mark feed). Any authenticated user. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const assignments = await listOpenAssignments();
  return NextResponse.json({ assignments });
}
