"use client";

import { Switch } from "@/components/ui/switch";
import { REMINDER_OFFSET_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { daysBetween, formatRoDate, isISODate, shiftISODate, type ISODate } from "@/lib/utils/dates";
import type { ReminderDayPreference } from "@/types/domain";

interface ReminderTogglesProps {
  value: ReminderDayPreference[];
  onChange: (value: ReminderDayPreference[]) => void;
  expiryDate: string | null;
  today: ISODate;
  disabled?: boolean;
}

/** Comutatoare pentru pragurile de reminder, cu data calculată pentru fiecare. */
export function ReminderToggles({ value, onChange, expiryDate, today, disabled }: ReminderTogglesProps) {
  const validExpiry = expiryDate && isISODate(expiryDate) ? expiryDate : null;

  return (
    <fieldset
      disabled={disabled}
      className="divide-border border-border bg-surface flex flex-col divide-y rounded-2xl border"
    >
      <legend className="sr-only">Remindere înainte de expirare</legend>
      {value.map((pref, index) => {
        const id = `reminder-${pref.daysBefore}`;
        const date = validExpiry ? shiftISODate(validExpiry, -pref.daysBefore) : null;
        const past = date ? daysBetween(today, date) < 0 : false;
        return (
          <div key={pref.daysBefore} className="flex items-center gap-4 px-4 py-3">
            <label htmlFor={id} className={cn("min-w-0 flex-1 cursor-pointer", disabled && "cursor-not-allowed")}>
              <span className="block text-sm font-medium">{REMINDER_OFFSET_LABELS[pref.daysBefore]}</span>
              <span className="text-muted-foreground block text-[13px]">
                {!date
                  ? "Data se calculează după ce alegi termenul"
                  : past
                    ? `${formatRoDate(date)} — a trecut deja, nu se programează`
                    : formatRoDate(date)}
              </span>
            </label>
            <Switch
              id={id}
              checked={pref.enabled}
              onCheckedChange={(checked) => {
                const next = [...value];
                next[index] = { ...pref, enabled: checked };
                onChange(next);
              }}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
