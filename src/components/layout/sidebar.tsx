"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  HandCoins,
  LayoutDashboard,
  Receipt,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, roles: ["ADMIN"] },
  { href: "/attendance", label: "الحضور اليومي", icon: ClipboardCheck, roles: ["ADMIN"] },
  { href: "/attendance/by-project", label: "تسجيل اليومية", icon: ClipboardList, roles: ["ADMIN"] },
  { href: "/projects", label: "المشاريع", icon: Building2, roles: ["ADMIN"] },
  { href: "/people", label: "الأشخاص", icon: Users, roles: ["ADMIN"] },
  { href: "/weekly", label: "الحصر الأسبوعي", icon: CalendarDays, roles: ["ADMIN"] },
  { href: "/reports", label: "التقارير", icon: BarChart3, roles: ["ADMIN"] },
  { href: "/settlements", label: "التسويات", icon: Receipt, roles: ["ADMIN"] },
  { href: "/settlements/worker", label: "تصفية العمال", icon: HandCoins, roles: ["ADMIN"] },
];

export function SidebarNav({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => item.roles.includes(role));

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex flex-col items-center gap-3 border-b border-border/60 px-2 pb-5 pt-2">
        <div className="flex w-full items-center justify-center rounded-lg bg-white/90 p-1.5 transition-colors dark:bg-transparent dark:p-0">
          <Image
            src="/tarek-al-wakil-logo.png"
            alt="شعار طارق الوكيل"
            width={1408}
            height={768}
            priority
            className="h-12 w-auto object-contain"
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="text-sm font-bold tracking-wide text-foreground">الوكيل</div>
          <div className="text-[11px] font-medium tracking-widest text-muted-foreground">
            TAREK AL-WAKIL
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 pt-1 overflow-y-auto" aria-label="التنقل الرئيسي">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 border-s-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2.5 border-t border-border/60 px-2 pt-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-elevated text-sm font-semibold text-primary">
          {(userName || "؟").charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">{userName}</div>
          <div className="truncate text-[11px] text-muted-foreground">{ROLE_LABELS[role]}</div>
        </div>
      </div>
    </div>
  );
}
