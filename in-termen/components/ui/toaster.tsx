"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-border !shadow-raised !font-sans",
          title: "!text-sm !font-medium",
          description: "!text-[13px]",
        },
      }}
    />
  );
}
