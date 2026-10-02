import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-input bg-surface flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="relative mb-5" aria-hidden>
        <div className="bg-primary-soft/70 absolute -inset-3 rounded-full" />
        <div className="bg-surface text-primary shadow-card ring-border relative flex size-14 items-center justify-center rounded-2xl ring-1">
          <Icon className="size-7" strokeWidth={1.75} />
        </div>
      </div>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="text-muted-foreground mt-1.5 max-w-sm text-sm leading-relaxed">{description}</div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
