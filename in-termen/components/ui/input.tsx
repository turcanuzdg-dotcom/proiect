import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export const inputClassName =
  "flex h-11 w-full min-w-0 rounded-lg border border-control bg-surface px-3 text-[15px] text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/80 hover:border-control-hover focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-destructive/15 sm:text-sm";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(inputClassName, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClassName, "h-auto min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

/** Select nativ: cel mai accesibil pe mobil și cu tastatura. */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        inputClassName,
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23556275' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
