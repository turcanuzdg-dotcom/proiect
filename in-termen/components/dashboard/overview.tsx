import Link from "next/link";

import { STATUS_STYLES } from "@/components/documents/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import type { StatusSummary } from "@/lib/utils/status";
import { DOCUMENT_STATUSES } from "@/types/domain";

/** „Ai X documente urmărite” + bară de distribuție pe statusuri (cu legendă text). */
export function Overview({ summary, withFiles }: { summary: StatusSummary; withFiles: number }) {
  const total = summary.total;
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-sm">Situația ta</p>
        <p className="mt-1 text-xl font-semibold tracking-tight">
          Ai {total} {total === 1 ? "document urmărit" : total >= 20 ? "de documente urmărite" : "documente urmărite"}
        </p>
        {total > 0 ? (
          <>
            <div className="bg-muted mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
              {DOCUMENT_STATUSES.map((status) =>
                summary[status] > 0 ? (
                  <div
                    key={status}
                    className={cn("h-full first:rounded-l-full last:rounded-r-full", STATUS_STYLES[status].dot)}
                    style={{ width: `${(summary[status] / total) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              {DOCUMENT_STATUSES.map((status) => (
                <li key={status} className="flex items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", STATUS_STYLES[status].dot)} aria-hidden />
                  <span className="text-muted-foreground">{STATUS_META[status].label}</span>
                  <span className="ml-auto font-medium tabular-nums">{summary[status]}</span>
                </li>
              ))}
            </ul>
            <p className="border-border text-muted-foreground mt-4 border-t pt-3 text-[13px]">
              {withFiles} din {total} au fișierul atașat.{" "}
              <Link href="/documents" className="text-primary font-medium hover:underline">
                Vezi documentele
              </Link>
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
