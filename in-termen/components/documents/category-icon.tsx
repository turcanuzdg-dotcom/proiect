import { Car, Folder, HeartPulse, House, IdCard, ReceiptText, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import { CATEGORY_META } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import type { DocumentCategory } from "@/types/domain";

export const CATEGORY_ICONS: Record<DocumentCategory, LucideIcon> = {
  personal_documents: IdCard,
  vehicle: Car,
  insurance: ShieldCheck,
  home_warranty: House,
  bills_subscriptions: ReceiptText,
  health: HeartPulse,
  family: Users,
  other: Folder,
};

export function categoryLabel(category: string): string {
  return CATEGORY_META[category as DocumentCategory]?.label ?? "Altele";
}

interface CategoryIconProps {
  category: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { box: "size-8 rounded-lg", icon: "size-4" },
  md: { box: "size-10 rounded-xl", icon: "size-5" },
  lg: { box: "size-12 rounded-xl", icon: "size-6" },
};

/** Iconul categoriei într-o casetă neutră (fără culori de status). */
export function CategoryIcon({ category, size = "md", className }: CategoryIconProps) {
  const Icon = CATEGORY_ICONS[category as DocumentCategory] ?? Folder;
  return (
    <span
      className={cn(
        "bg-primary-soft text-primary flex shrink-0 items-center justify-center",
        SIZES[size].box,
        className,
      )}
      aria-hidden
    >
      <Icon className={SIZES[size].icon} strokeWidth={1.85} />
    </span>
  );
}
