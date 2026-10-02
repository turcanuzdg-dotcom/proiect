import { cn } from "@/lib/utils/cn";

/** Semnul „În Termen”: un calendar cu bifă, simplu și lizibil la dimensiuni mici. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#1b3358" />
      <rect x="8" y="9.5" width="16" height="14" rx="3" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M12 7.5v4M20 7.5v4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path
        d="m12.5 17 2.4 2.4 4.8-4.9"
        fill="none"
        stroke="#5eead4"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-foreground text-[17px] font-semibold tracking-tight">În Termen</span>
    </span>
  );
}
