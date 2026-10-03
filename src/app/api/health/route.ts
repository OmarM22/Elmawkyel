import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isDemoMode } from "@/server/store";

/** Liveness + data-mode indicator for the settings page. Requires login. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  return NextResponse.json({
    ok: true,
    mode: isDemoMode() ? "demo" : "database",
    time: new Date().toISOString(),
  });
}
