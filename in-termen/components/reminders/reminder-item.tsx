"use client";

import {
  AlarmClock,
  CalendarDays,
  Check,
  ChevronDown,
  Ellipsis,
  LoaderCircle,
  Mail,
  RotateCcw,
  Smartphone,
  Trash,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { completeReminder, deleteReminder, reopenReminder, snoozeReminder } from "@/lib/actions/reminders";
import { cn } from "@/lib/utils/cn";
import type { ActionResult } from "@/types/domain";

export interface ReminderItemData {
  id: string;
  title: string;
  body: string | null;
  when: string;
  whenIso: string;
  channel: "in_app" | "email";
  status: "pending" | "snoozed" | "completed" | "dismissed";
  overdue: boolean;
  documentId: string | null;
  documentTitle: string | null;
}

export function ReminderItem({ reminder, minSnoozeDate }: { reminder: ReminderItemData; minSnoozeDate: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dateDialog, setDateDialog] = useState(false);
  const [customDate, setCustomDate] = useState(minSnoozeDate);
  const completed = reminder.status === "completed";

  function run(action: () => Promise<ActionResult<unknown>>, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (result.message) toast.success(result.message);
        after?.();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <li
      className={cn(
        "bg-surface shadow-card flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center",
        reminder.overdue && !completed ? "border-urgent-border" : "border-border",
        completed && "opacity-75",
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[15px] leading-snug font-medium",
            completed && "decoration-muted-foreground/50 line-through",
          )}
        >
          {reminder.title}
        </p>
        {reminder.body ? (
          <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">{reminder.body}</p>
        ) : null}
        <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span
            className={cn(
              "inline-flex items-center gap-1",
              reminder.overdue && !completed && "text-urgent font-medium",
            )}
          >
            <CalendarDays className="size-3.5" aria-hidden />
            <time dateTime={reminder.whenIso}>{reminder.when}</time>
            {reminder.overdue && !completed ? " · scadent" : ""}
          </span>
          {reminder.status === "snoozed" ? (
            <span className="inline-flex items-center gap-1">
              <AlarmClock className="size-3.5" aria-hidden />
              Amânat
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            {reminder.channel === "email" ? (
              <Mail className="size-3.5" aria-hidden />
            ) : (
              <Smartphone className="size-3.5" aria-hidden />
            )}
            {reminder.channel === "email" ? "În aplicație + e-mail" : "În aplicație"}
          </span>
          {reminder.documentId ? (
            <Link href={`/documents/${reminder.documentId}`} className="text-primary font-medium hover:underline">
              {reminder.documentTitle ?? "Vezi documentul"}
            </Link>
          ) : (
            <span>Reminder manual</span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {completed ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => reopenReminder(reminder.id))}>
            <RotateCcw aria-hidden />
            Redeschide
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => completeReminder(reminder.id))}
            >
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              Finalizat
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={pending}>
                  <AlarmClock aria-hidden />
                  Amână
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {([1, 3, 7] as const).map((days) => (
                  <DropdownMenuItem
                    key={days}
                    onSelect={() =>
                      run(() => snoozeReminder({ reminderId: reminder.id, option: { kind: "days", days } }))
                    }
                  >
                    {days === 1 ? "Cu o zi" : `Cu ${days} zile`}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDateDialog(true)}>
                  <CalendarDays aria-hidden />
                  Alege o dată…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {!reminder.documentId ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Mai multe acțiuni" disabled={pending}>
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem destructive onSelect={() => run(() => deleteReminder(reminder.id))}>
                <Trash aria-hidden />
                Șterge reminderul
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <Dialog open={dateDialog} onOpenChange={setDateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Amână reminderul</DialogTitle>
            <DialogDescription>Alege ziua în care vrei să-ți amintim din nou.</DialogDescription>
          </DialogHeader>
          <Field id={`snooze-${reminder.id}`} label="Data">
            <Input
              id={`snooze-${reminder.id}`}
              type="date"
              min={minSnoozeDate}
              value={customDate}
              onChange={(event) => setCustomDate(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateDialog(false)}>
              Renunță
            </Button>
            <Button
              disabled={pending || !customDate}
              onClick={() =>
                run(
                  () => snoozeReminder({ reminderId: reminder.id, option: { kind: "date", date: customDate } }),
                  () => setDateDialog(false),
                )
              }
            >
              Amână
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
