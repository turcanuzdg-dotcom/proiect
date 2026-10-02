import { ChevronRight, Paperclip, UserRound } from "lucide-react";
import Link from "next/link";

import { CategoryIcon, categoryLabel } from "@/components/documents/category-icon";
import { StatusBadge, STATUS_STYLES } from "@/components/documents/status-badge";
import type { DocumentView } from "@/lib/data/views";
import { cn } from "@/lib/utils/cn";
import { formatExpiryDistance, formatRoDate } from "@/lib/utils/dates";

/** Rând compact de document (liste din dashboard, familie, lista de documente). */
export function DocumentListItem({
  document,
  showCategory = true,
}: {
  document: DocumentView;
  showCategory?: boolean;
}) {
  const style = STATUS_STYLES[document.status];
  return (
    <Link
      href={`/documents/${document.id}`}
      className="group hover:bg-subtle flex items-center gap-3 rounded-xl px-3 py-3 transition-colors sm:gap-4"
    >
      <CategoryIcon category={document.category} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-foreground truncate text-[15px] font-medium">{document.title}</p>
          {document.is_demo ? (
            <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px] font-medium">
              Demo
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px]">
          <span
            className={cn(document.status !== "safe" && document.status !== "no_expiry" && `font-medium ${style.text}`)}
          >
            {formatExpiryDistance(document.daysLeft)}
          </span>
          {document.expiry_date ? <span aria-hidden>·</span> : null}
          {document.expiry_date ? <span>{formatRoDate(document.expiry_date)}</span> : null}
          {showCategory ? (
            <span className="hidden sm:inline">
              <span aria-hidden>· </span>
              {categoryLabel(document.category)}
            </span>
          ) : null}
          {document.memberName ? (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>·</span>
              <UserRound className="size-3" aria-hidden />
              {document.memberName}
            </span>
          ) : null}
          {document.file_path ? <Paperclip className="size-3" aria-label="Are fișier atașat" /> : null}
        </p>
      </div>
      <StatusBadge status={document.status} className="hidden sm:inline-flex" />
      <ChevronRight
        className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
