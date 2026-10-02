import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1.5 text-[15px] leading-relaxed">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
