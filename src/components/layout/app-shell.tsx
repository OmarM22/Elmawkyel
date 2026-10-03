"use client";

import type { ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarNav } from "./sidebar";
import { ROLE_LABELS, type Role } from "@/types";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const role = (session?.user?.role ?? "VIEWER") as Role;
  const userName = session?.user?.name || session?.user?.username || "مستخدم";

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l bg-card print:hidden md:block">
        <SidebarNav role={role} userName={userName} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur print:hidden">
          <div className="flex items-center gap-2 md:hidden">
            <span className="text-sm font-bold">الوكيل</span>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
            <span className="text-sm text-muted-foreground">{userName}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="gap-2"
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </Button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 print:hidden md:hidden" aria-label="التنقل">
          <SidebarNavMobile role={role} />
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarNavMobile({ role }: { role: Role }) {
  // Compact horizontal nav reuses the same items via SidebarNav links is overkill;
  // render a minimal inline copy to keep mobile usable.
  return <MobileLinks role={role} />;
}

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MOBILE_LINKS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "لوحة التحكم", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/projects", label: "المشاريع", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/people", label: "الأشخاص", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/attendance", label: "اليومية", roles: ["ADMIN", "MANAGER"] },
  { href: "/weekly", label: "الأسبوعي", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/reports", label: "التقارير", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/settlements", label: "التسويات", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/users", label: "المستخدمون", roles: ["ADMIN"] },
  { href: "/settings", label: "الإعدادات", roles: ["ADMIN", "MANAGER", "VIEWER"] },
];

function MobileLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <>
      {MOBILE_LINKS.filter((l) => l.roles.includes(role)).map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
            pathname === l.href ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </>
  );
}
