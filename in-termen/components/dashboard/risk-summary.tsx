import { CalendarClock, CircleAlert, CircleCheck, Clock, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { STATUS_STYLES } from "@/components/documents/status-badge";
import { cn } from "@/lib/utils/cn";
import type { StatusSummary } from "@/lib/utils/status";
import type { DocumentStatus } from "@/types/domain";

const TILES: Array<{ status: DocumentStatus; label: string; hint: string; icon: LucideIcon }> = [
  { status: "expired", label: "Expirate", hint: "termen depășit", icon: CircleAlert },
  { status: "urgent", label: "În 7 zile", hint: "de verificat acum", icon: Clock },
  { status: "upcoming", label: "În 30 de zile", hint: "pregătește din timp", icon: CalendarClock },
  { status: "safe", label: "Mai târziu", hint: "peste 30 de zile", icon: CircleCheck },
];

export function RiskSummary({ summary }: { summary: StatusSummary }) {
  return (
    <section
      aria-labelledby="sumar-titlu"
      className="border-border bg-surface shadow-card rounded-2xl border p-4 sm:p-5"
    >
      <h2 id="sumar-titlu" className="sr-only">
        Sumarul termenelor
      </h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TILES.map(({ status, label, hint, icon: Icon }) => {
          const count = summary[status];
          const style = STATUS_STYLES[status];
          const active = count > 0;
          return (
            <li key={status}>
              <Link
                href={`/documents?status=${status}`}
                className={cn(
                  "flex h-full flex-col gap-3 rounded-xl border p-3.5 transition-colors sm:p-4",
                  active
                    ? cn(style.soft, style.border, "hover:brightness-[0.98]")
                    : "border-border bg-subtle hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-[13px] font-medium",
                    active ? style.text : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden strokeWidth={2.2} />
                  {label}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "text-3xl font-semibold tracking-tight tabular-nums",
                      active ? style.text : "text-foreground/40",
                    )}
                  >
                    {count}
                  </span>
                  <span className="text-muted-foreground text-xs">{hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
