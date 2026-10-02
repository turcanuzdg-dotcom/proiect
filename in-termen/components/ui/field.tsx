import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

interface FieldProps {
  id: string;
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
}

/**
 * Etichetă + câmp + indiciu + eroare. Câmpul primește prin convenție
 * id-ul, iar mesajele au id-urile `${id}-hint` și `${id}-error` (pentru aria-describedby).
 */
export function Field({ id, label, children, hint, error, optional, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="text-muted-foreground ml-1 font-normal">(opțional)</span> : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-[13px] leading-snug">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-[13px] leading-snug font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string, hint?: boolean): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
