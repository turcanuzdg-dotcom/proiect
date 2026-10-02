import { Paperclip, UserRound } from "lucide-react";
import Link from "next/link";

import { CategoryIcon, categoryLabel } from "@/components/documents/category-icon";
import { StatusBadge, STATUS_STYLES } from "@/components/documents/status-badge";
import type { DocumentView } from "@/lib/data/views";
import { cn } from "@/lib/utils/cn";
import { formatExpiryDistance, formatRoDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

export function DocumentCard({ document }: { document: DocumentView }) {
  const style = STATUS_STYLES[document.status];
  return (
    <Link
      href={`/documents/${document.id}`}
      className="group border-border bg-surface shadow-card hover:border-input hover:shadow-raised flex h-full flex-col rounded-2xl border p-4 transition-[box-shadow,border-color] sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <CategoryIcon category={document.category} />
        <StatusBadge status={document.status} />
      </div>
      <p className="text-muted-foreground mt-4 text-[13px]">
        {categoryLabel(document.category)}
        {document.is_demo ? " · Demo" : ""}
      </p>
      <h2 className="mt-0.5 line-clamp-2 text-base leading-snug font-semibold tracking-tight">{document.title}</h2>
      <div className="mt-auto pt-4">
        <p
          className={cn(
            "text-sm font-medium",
            document.status === "safe" || document.status === "no_expiry" ? "text-foreground" : style.text,
          )}
        >
          {formatExpiryDistance(document.daysLeft)}
        </p>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px]">
          {document.expiry_date
            ? formatRoDate(document.expiry_date)
            : document.amount
              ? formatMoney(document.amount, document.currency)
              : "Păstrat pentru evidență"}
          {document.memberName ? (
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3" aria-hidden />
              {document.memberName}
            </span>
          ) : null}
          {document.file_path ? (
            <span className="inline-flex items-center">
              <Paperclip className="size-3" aria-hidden />
              <span className="sr-only">Are fișier atașat</span>
            </span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}
