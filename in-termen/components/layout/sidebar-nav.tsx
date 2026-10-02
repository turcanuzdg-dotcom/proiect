"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath, NAV_ITEMS } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils/cn";

export function SidebarNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigare principală" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.9} aria-hidden />
            <span className="flex-1">{label}</span>
            {href === "/reminders" && unreadCount > 0 ? (
              <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                {unreadCount}
                <span className="sr-only"> necitite</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
