import { cn } from "@/lib/utils/cn";

interface ProgressProps {
  value: number;
  label: string;
  className?: string;
}

export function Progress({ value, label, className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn("bg-muted h-2 w-full overflow-hidden rounded-full", className)}
    >
      <div className="bg-accent h-full rounded-full transition-[width] duration-300" style={{ width: `${clamped}%` }} />
    </div>
  );
}
