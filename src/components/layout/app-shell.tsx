"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Receipt,
  HandCoins,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { ROLE_LABELS, type Role } from "@/types";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const role = (session?.user?.role ?? "ADMIN") as Role;
  const userName = session?.user?.name || session?.user?.username || "مستخدم";

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l bg-sidebar print:hidden md:block">
        <SidebarNav role={role} userName={userName} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-sidebar/95 px-4 py-3 backdrop-blur print:hidden">
          <div className="flex items-center gap-2 md:hidden">
            <Image
              src="/tarek-al-wakil-logo.png"
              alt="الوكيل"
              width={1408}
              height={768}
              priority
              className="h-8 w-auto object-contain"
            />
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
            <span className="text-sm text-muted-foreground">{userName}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="gap-2"
            >
              <LogOut className="size-4" />
              تسجيل الخروج
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 pb-28 md:p-6 md:pb-6 print:pb-6">{children}</main>
        <MobileBottomBar role={role} />
      </div>
    </div>
  );
}

interface MobileLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const MOBILE_LINKS: MobileLink[] = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard, roles: ["ADMIN"] },
  { href: "/attendance", label: "الحضور", icon: ClipboardCheck, roles: ["ADMIN"] },
  { href: "/attendance/by-project", label: "اليومية", icon: ClipboardList, roles: ["ADMIN"] },
  { href: "/projects", label: "المشاريع", icon: Building2, roles: ["ADMIN"] },
  { href: "/people", label: "الأشخاص", icon: Users, roles: ["ADMIN"] },
  { href: "/weekly", label: "الأسبوعي", icon: CalendarDays, roles: ["ADMIN"] },
  { href: "/reports", label: "التقارير", icon: BarChart3, roles: ["ADMIN"] },
  { href: "/settlements", label: "التسويات", icon: Receipt, roles: ["ADMIN"] },
  { href: "/settlements/worker", label: "التصفية", icon: HandCoins, roles: ["ADMIN"] },
];

/** Thumb-reach bottom tab bar (phones only). Replaces the old top scroll row. */
function MobileBottomBar({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="التنقل السريع"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-sidebar/95 backdrop-blur print:hidden md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex gap-1 overflow-x-auto px-2 py-1.5">
        {MOBILE_LINKS.filter((l) => l.roles.includes(role)).map((l) => {
          const active = pathname === l.href;
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[48px] min-w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-medium",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" />
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
