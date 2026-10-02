import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("bg-muted animate-pulse rounded-lg", className)} {...props} />;
}
