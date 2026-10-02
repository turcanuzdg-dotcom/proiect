"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/types/domain";

interface ActionButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  pendingLabel?: string;
  onSuccess?: () => void;
}

/** Buton care rulează o acțiune de server, cu stare de încărcare și mesaj de confirmare. */
export function ActionButton({ action, children, pendingLabel, onSuccess, disabled, ...props }: ActionButtonProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await action();
          if (result.ok) {
            if (result.message) toast.success(result.message);
            onSuccess?.();
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
