import Link from "next/link";

import { categoryLabel } from "@/components/documents/category-icon";
import { StatusBadge, STATUS_STYLES } from "@/components/documents/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DocumentView } from "@/lib/data/views";
import { cn } from "@/lib/utils/cn";
import { formatExpiryDistance } from "@/lib/utils/dates";
import { format, parseISO } from "date-fns";
import { ro } from "date-fns/locale";

/** „Ce urmează”: următoarele termene, în ordine cronologică, ca o axă a timpului. */
export function UpcomingTimeline({ documents }: { documents: DocumentView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ce urmează</CardTitle>
      </CardHeader>
      <CardContent className="pt-3 sm:pt-4">
        {documents.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Nu ai termene viitoare înregistrate.</p>
        ) : (
          <ol className="relative">
            {documents.map((doc, index) => {
              const date = parseISO(doc.expiry_date as string);
              const last = index === documents.length - 1;
              return (
                <li key={doc.id} className="relative flex gap-4 pb-4 last:pb-0">
                  {!last ? (
                    <span aria-hidden className="bg-border absolute top-14 left-[23px] h-[calc(100%-3.25rem)] w-px" />
                  ) : null}
                  <div
                    className={cn(
                      "flex w-12 shrink-0 flex-col items-center rounded-xl border py-1.5",
                      STATUS_STYLES[doc.status].border,
                      STATUS_STYLES[doc.status].soft,
                    )}
                  >
                    <span
                      className={cn("text-lg leading-tight font-semibold tabular-nums", STATUS_STYLES[doc.status].text)}
                    >
                      {format(date, "d")}
                    </span>
                    <span className="text-muted-foreground text-[11px] font-medium uppercase">
                      {format(date, "MMM", { locale: ro }).replace(".", "")}
                    </span>
                  </div>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="hover:bg-subtle -my-1 min-w-0 flex-1 rounded-lg px-2 py-1"
                  >
                    <p className="truncate text-[15px] font-medium">{doc.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-[13px]">
                      {formatExpiryDistance(doc.daysLeft)} · {categoryLabel(doc.category)}
                    </p>
                  </Link>
                  <StatusBadge status={doc.status} className="mt-1 hidden self-start sm:inline-flex" />
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
