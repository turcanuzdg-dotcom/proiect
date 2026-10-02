import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Clock,
  Infinity as InfinityIcon,
  type LucideIcon,
} from "lucide-react";

import { STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import type { DocumentStatus } from "@/types/domain";

export const STATUS_ICONS: Record<DocumentStatus, LucideIcon> = {
  expired: CircleAlert,
  urgent: Clock,
  upcoming: CalendarClock,
  safe: CircleCheck,
  no_expiry: InfinityIcon,
};

/** Clasele de culoare pentru fiecare status (text / fundal / contur). */
export const STATUS_STYLES: Record<DocumentStatus, { text: string; soft: string; border: string; dot: string }> = {
  expired: { text: "text-expired", soft: "bg-expired-soft", border: "border-expired-border", dot: "bg-expired" },
  urgent: { text: "text-urgent", soft: "bg-urgent-soft", border: "border-urgent-border", dot: "bg-urgent" },
  upcoming: { text: "text-upcoming", soft: "bg-upcoming-soft", border: "border-upcoming-border", dot: "bg-upcoming" },
  safe: { text: "text-safe", soft: "bg-safe-soft", border: "border-safe-border", dot: "bg-safe" },
  no_expiry: { text: "text-none", soft: "bg-none-soft", border: "border-none-border", dot: "bg-none" },
};

interface StatusBadgeProps {
  status: DocumentStatus;
  className?: string;
  size?: "sm" | "md";
}

/** Status cu icon + text: culoarea nu este niciodată singurul indiciu. */
export function StatusBadge({ status, className, size = "sm" }: StatusBadgeProps) {
  const Icon = STATUS_ICONS[status];
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[13px]",
        style.text,
        style.soft,
        style.border,
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden strokeWidth={2.25} />
      {STATUS_META[status].label}
    </span>
  );
}
