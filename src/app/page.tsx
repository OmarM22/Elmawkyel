import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/*
 * Root: authenticated users go to the dashboard, everyone else to /login.
 * /login is the ONLY public page (proxy.ts enforces the rest).
 */
export default async function Home() {
  const session = await getServerSession(authOptions);
  redirect(session ? "/dashboard" : "/login");
}
