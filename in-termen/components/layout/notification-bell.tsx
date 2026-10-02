"use client";

import { Bell, BellRing } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markNotificationsRead } from "@/lib/actions/reminders";
import { cn } from "@/lib/utils/cn";

export interface BellItem {
  id: string;
  title: string;
  when: string;
  documentId: string | null;
  unread: boolean;
}

export function NotificationBell({ items, unreadCount }: { items: BellItem[]; unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [localUnread, setLocalUnread] = useState(unreadCount);
  const [syncedCount, setSyncedCount] = useState(unreadCount);

  // Când serverul trimite un număr nou (după o acțiune), îl preluăm.
  if (unreadCount !== syncedCount) {
    setSyncedCount(unreadCount);
    setLocalUnread(unreadCount);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && localUnread > 0) {
      setLocalUnread(0);
      startTransition(async () => {
        await markNotificationsRead();
      });
    }
  }

  const label = localUnread > 0 ? `Notificări: ${localUnread} necitite` : "Notificări";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={label}
        className="text-muted-foreground hover:bg-muted hover:text-foreground relative flex size-10 items-center justify-center rounded-full transition-colors"
      >
        {localUnread > 0 ? <BellRing className="size-5" aria-hidden /> : <Bell className="size-5" aria-hidden />}
        {localUnread > 0 ? (
          <span
            aria-hidden
            className="bg-primary text-primary-foreground ring-background absolute top-1 right-1 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-[18px] font-semibold ring-2"
          >
            {localUnread > 9 ? "9+" : localUnread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent aria-label="Notificări">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notificări</p>
          <span className="text-muted-foreground text-xs">În aplicație</span>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium">Nimic de verificat acum</p>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Îți vom arăta aici reminderele când le vine momentul.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.documentId ? `/documents/${item.documentId}` : "/reminders"}
                  onClick={() => setOpen(false)}
                  className="hover:bg-subtle flex gap-3 px-4 py-2.5 transition-colors"
                >
                  <span
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.unread ? "bg-primary" : "bg-transparent")}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-sm leading-snug font-medium">{item.title}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {item.when}
                      {item.unread ? <span className="sr-only"> · necitit</span> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-border border-t p-2">
          <Link
            href="/reminders"
            onClick={() => setOpen(false)}
            className="text-primary hover:bg-primary-soft block rounded-lg px-3 py-2 text-center text-sm font-medium"
          >
            Vezi toate reminderele
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
