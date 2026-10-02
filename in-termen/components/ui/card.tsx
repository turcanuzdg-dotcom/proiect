import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("border-border bg-surface shadow-card rounded-2xl border", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0 sm:p-6 sm:pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-foreground text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-sm leading-relaxed", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("border-border flex flex-wrap items-center gap-3 border-t px-5 py-4 sm:px-6", className)}
      {...props}
    />
  );
}
