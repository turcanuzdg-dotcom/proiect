import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-foreground text-sm leading-none font-medium peer-disabled:opacity-70", className)}
      {...props}
    />
  );
}
