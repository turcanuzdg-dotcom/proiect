"use client";

import { Bell, Files, LayoutDashboard, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils/cn";

const LEFT = [
  { href: "/dashboard", label: "Acasă", icon: LayoutDashboard },
  { href: "/documents", label: "Documente", icon: Files },
];
const RIGHT = [
  { href: "/reminders", label: "Remindere", icon: Bell },
  { href: "/settings", label: "Setări", icon: Settings },
];

function NavLink({ href, label, icon: Icon, pathname }: (typeof LEFT)[number] & { pathname: string }) {
  const active = isActivePath(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
      {label}
    </Link>
  );
}

/** Bara de jos pe mobil, cu butonul central „Adaugă”. */
export function MobileNav() {
  const pathname = usePathname();
  const addActive = pathname === "/documents/new";
  return (
    <nav
      aria-label="Navigare principală"
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-center px-2">
        {LEFT.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
        <Link
          href="/documents/new"
          aria-current={addActive ? "page" : undefined}
          className="group text-primary -mt-6 flex flex-1 flex-col items-center gap-1 text-[11px] font-semibold"
        >
          <span
            aria-hidden
            className="bg-primary text-primary-foreground shadow-raised ring-background group-hover:bg-primary-hover flex size-12 items-center justify-center rounded-2xl ring-4 transition-transform group-active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.25} />
          </span>
          Adaugă
        </Link>
        {RIGHT.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}
