import { BellRing, CircleCheck, FilePen, FilePlus, Paperclip, RefreshCcw, Timer, type LucideIcon } from "lucide-react";

import { ACTIVITY_LABELS } from "@/lib/constants";
import { formatRoDate, formatRoDateTime } from "@/lib/utils/dates";
import type { ActivityLogRow, Json } from "@/types/database";
import type { ActivityAction } from "@/types/domain";

const ICONS: Record<ActivityAction, LucideIcon> = {
  created: FilePlus,
  updated: FilePen,
  renewed: RefreshCcw,
  file_uploaded: Paperclip,
  file_removed: Paperclip,
  reminder_completed: CircleCheck,
  reminder_snoozed: Timer,
  reminder_created: BellRing,
};

function metaString(metadata: Json | null, key: string): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = metadata[key];
    return typeof value === "string" ? value : null;
  }
  return null;
}

function detail(entry: ActivityLogRow, timeZone: string): string | null {
  const action = entry.action as ActivityAction;
  if (action === "renewed") {
    const previous = metaString(entry.metadata, "previous_expiry_date");
    const next = metaString(entry.metadata, "new_expiry_date");
    if (next) return `${previous ? formatRoDate(previous) : "fără termen"} → ${formatRoDate(next)}`;
  }
  if (action === "file_uploaded" || action === "file_removed") return metaString(entry.metadata, "file_name");
  if (action === "reminder_completed") return metaString(entry.metadata, "title");
  if (action === "reminder_snoozed") {
    const until = metaString(entry.metadata, "until");
    return until ? `până pe ${formatRoDateTime(until, timeZone)}` : null;
  }
  return null;
}

/** Istoricul documentului: creare, modificări, reînnoiri, remindere finalizate. */
export function DocumentTimeline({ entries, timeZone }: { entries: ActivityLogRow[]; timeZone: string }) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">Nu există încă evenimente.</p>;
  }
  return (
    <ol className="relative flex flex-col gap-4">
      <span aria-hidden className="bg-border absolute top-2 bottom-2 left-[15px] w-px" />
      {entries.map((entry) => {
        const action = entry.action as ActivityAction;
        const Icon = ICONS[action] ?? FilePen;
        const extra = detail(entry, timeZone);
        return (
          <li key={entry.id} className="relative flex gap-3">
            <span className="border-border bg-surface text-muted-foreground relative flex size-8 shrink-0 items-center justify-center rounded-full border">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium">{ACTIVITY_LABELS[action] ?? entry.action}</p>
              {extra ? <p className="text-muted-foreground text-[13px] break-words">{extra}</p> : null}
              <p className="text-muted-foreground text-xs">
                <time dateTime={entry.created_at}>{formatRoDateTime(entry.created_at, timeZone)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
