import { BellRing, CalendarCheck } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ManualReminderDialog } from "@/components/reminders/manual-reminder-dialog";
import { ReminderItem, type ReminderItemData } from "@/components/reminders/reminder-item";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { requireSession } from "@/lib/auth";
import { listReminders, type ReminderWithDocument } from "@/lib/data/queries";
import {
  effectiveReminderAt,
  groupReminders,
  isReminderDue,
  REMINDER_GROUP_LABELS,
  type ReminderGroupKey,
} from "@/lib/reminders/schedule";
import { isEmailConfigured } from "@/lib/server-config";
import { formatRoDateTime, shiftISODate, todayInTimeZone } from "@/lib/utils/dates";
import type { ReminderChannel, ReminderStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Remindere" };

const GROUP_ORDER: ReminderGroupKey[] = ["today", "next7", "next30", "later"];
const VISIBLE_PER_GROUP = 5;

export default async function RemindersPage() {
  const { supabase, profile } = await requireSession();
  const [active, completed] = await Promise.all([
    listReminders(supabase, { status: "active" }),
    listReminders(supabase, { status: "completed", limit: 10 }),
  ]);

  const today = todayInTimeZone(profile.timezone);
  const now = new Date();
  const groups = groupReminders(active, today, profile.timezone);
  const emailConfigured = isEmailConfigured();

  const toItem = (reminder: ReminderWithDocument): ReminderItemData => {
    const at = effectiveReminderAt(reminder);
    return {
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      when: formatRoDateTime(at, profile.timezone),
      whenIso: at,
      channel: reminder.channel as ReminderChannel,
      status: reminder.status as ReminderStatus,
      overdue: isReminderDue(reminder, now),
      documentId: reminder.document_id,
      documentTitle: reminder.documents?.title ?? null,
    };
  };

  return (
    <>
      <PageHeader
        title="Remindere"
        description="Ce trebuie verificat și când. Bifează ce ai rezolvat sau amână pentru mai târziu."
        actions={<ManualReminderDialog today={today} emailConfigured={emailConfigured} />}
      />

      {!emailConfigured ? (
        <Notice tone="neutral" className="mb-6">
          Notificările prin e-mail nu sunt configurate încă. Reminderele apar în aplicație, în clopoțelul din colțul de
          sus.
        </Notice>
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Niciun reminder activ"
          description="Reminderele se creează automat când adaugi un document cu termen. Poți adăuga și remindere manuale."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {GROUP_ORDER.map((key) =>
            groups[key].length > 0 ? (
              <section key={key} aria-labelledby={`grup-${key}`}>
                <h2
                  id={`grup-${key}`}
                  className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide uppercase"
                >
                  {key === "today" ? <BellRing className="text-urgent size-4" aria-hidden /> : null}
                  {REMINDER_GROUP_LABELS[key]}
                  <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium tracking-normal normal-case">
                    {groups[key].length}
                  </span>
                </h2>
                <ul className="flex flex-col gap-3">
                  {groups[key].slice(0, VISIBLE_PER_GROUP).map((reminder) => (
                    <ReminderItem
                      key={reminder.id}
                      reminder={toItem(reminder)}
                      minSnoozeDate={shiftISODate(today, 1)}
                    />
                  ))}
                </ul>
                {groups[key].length > VISIBLE_PER_GROUP ? (
                  <details className="group mt-3">
                    <summary className="border-input text-primary hover:bg-surface cursor-pointer list-none rounded-xl border border-dashed px-4 py-3 text-center text-sm font-medium group-open:mb-3">
                      <span className="group-open:hidden">Arată încă {groups[key].length - VISIBLE_PER_GROUP}</span>
                      <span className="hidden group-open:inline">Arată mai puține</span>
                    </summary>
                    <ul className="flex flex-col gap-3">
                      {groups[key].slice(VISIBLE_PER_GROUP).map((reminder) => (
                        <ReminderItem
                          key={reminder.id}
                          reminder={toItem(reminder)}
                          minSnoozeDate={shiftISODate(today, 1)}
                        />
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
            ) : null,
          )}
        </div>
      )}

      {completed.length > 0 ? (
        <section aria-labelledby="grup-finalizate" className="mt-10">
          <h2 id="grup-finalizate" className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
            Finalizate recent
          </h2>
          <ul className="flex flex-col gap-3">
            {completed.map((reminder) => (
              <ReminderItem key={reminder.id} reminder={toItem(reminder)} minSnoozeDate={shiftISODate(today, 1)} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
