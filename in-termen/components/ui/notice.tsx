import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

const TONES = {
  info: { icon: Info, className: "border-upcoming-border bg-upcoming-soft text-[#173f7a]" },
  warning: { icon: TriangleAlert, className: "border-urgent-border bg-urgent-soft text-[#7a2e0e]" },
  danger: { icon: CircleAlert, className: "border-expired-border bg-expired-soft text-[#7a1a12]" },
  neutral: { icon: Info, className: "border-border bg-subtle text-foreground" },
} as const;

interface NoticeProps {
  tone?: keyof typeof TONES;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Notice({ tone = "info", title, children, className }: NoticeProps) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3.5 text-sm leading-relaxed", toneClass, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}
