import { Bell, Files, LayoutDashboard, Settings, UsersRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Acasă", icon: LayoutDashboard },
  { href: "/documents", label: "Documente", icon: Files },
  { href: "/reminders", label: "Remindere", icon: Bell },
  { href: "/family", label: "Familie", icon: UsersRound },
  { href: "/settings", label: "Setări", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/documents")
    return pathname === "/documents" || (pathname.startsWith("/documents/") && pathname !== "/documents/new");
  return pathname === href || pathname.startsWith(`${href}/`);
}
