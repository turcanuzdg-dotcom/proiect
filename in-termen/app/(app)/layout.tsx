import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth";
import { listDueNotifications } from "@/lib/data/queries";
import { formatRoDateTime } from "@/lib/utils/dates";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user, profile } = await requireSession();
  if (!profile.onboarding_completed) redirect("/onboarding");

  const notifications = profile.in_app_notifications ? await listDueNotifications(supabase) : { items: [], unread: 0 };

  return (
    <AppShell
      user={{ name: profile.full_name, email: user.email ?? "" }}
      notifications={{
        enabled: profile.in_app_notifications,
        unread: notifications.unread,
        items: notifications.items.map((item) => ({
          id: item.id,
          title: item.title,
          when: formatRoDateTime(item.snoozed_until ?? item.remind_at, profile.timezone),
          documentId: item.document_id,
          unread: item.read_at === null,
        })),
      }}
    >
      {children}
    </AppShell>
  );
}
