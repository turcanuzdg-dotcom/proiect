import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/layout/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationBell, type BellItem } from "@/components/layout/notification-bell";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";

interface AppShellProps {
  children: ReactNode;
  user: { name: string; email: string };
  notifications: { items: BellItem[]; unread: number; enabled: boolean };
}

export function AppShell({ children, user, notifications }: AppShellProps) {
  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Bara laterală (desktop) */}
      <aside className="border-border bg-surface fixed inset-y-0 left-0 hidden w-64 flex-col border-r px-4 py-5 lg:flex">
        <Link href="/dashboard" className="mb-8 rounded-lg px-2 py-1" aria-label="În Termen — acasă">
          <Logo />
        </Link>
        <SidebarNav unreadCount={notifications.enabled ? notifications.unread : 0} />
        <div className="bg-subtle text-muted-foreground mt-auto rounded-xl p-3.5 text-[13px] leading-snug">
          <p className="text-foreground flex items-center gap-1.5 font-medium">
            <Lock className="size-3.5" aria-hidden />
            Date private
          </p>
          <p className="mt-1">Documentele și fișierele tale sunt vizibile doar pentru tine.</p>
        </div>
      </aside>

      {/* Bara de sus */}
      <header className="border-border/80 bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="rounded-lg lg:hidden" aria-label="În Termen — acasă">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            {notifications.enabled ? (
              <NotificationBell items={notifications.items} unreadCount={notifications.unread} />
            ) : null}
            <UserMenu name={user.name} email={user.email} />
          </div>
        </div>
      </header>

      <main id="continut" className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-6 sm:pt-8 lg:px-8 lg:pb-16">
        {children}
      </main>

      <MobileNav />
    </div>
  );
}
