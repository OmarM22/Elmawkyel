"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardCheck,
  HardHat,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/projects", label: "المشاريع", icon: Building2, roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/people", label: "الأشخاص", icon: Users, roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/attendance", label: "تسجيل اليومية", icon: ClipboardCheck, roles: ["ADMIN", "MANAGER"] },
  { href: "/weekly", label: "الحصر الأسبوعي", icon: CalendarDays, roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/reports", label: "التقارير", icon: BarChart3, roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/settlements", label: "التسويات", icon: Receipt, roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/users", label: "المستخدمون", icon: UsersRound, roles: ["ADMIN"] },
  { href: "/settings", label: "الإعدادات", icon: Settings, roles: ["ADMIN", "MANAGER", "VIEWER"] },
];

export function SidebarNav({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => item.roles.includes(role));

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-center gap-3 px-2 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <HardHat className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">الوكيل</div>
          <div className="truncate text-xs text-muted-foreground">{userName}</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1" aria-label="التنقل الرئيسي">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
