"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "border-border bg-surface shadow-raised data-[state=open]:animate-fade-in z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
