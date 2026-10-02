import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SectionCardProps {
  title: string;
  count?: number;
  href?: string;
  linkLabel?: string;
  description?: string;
  children: ReactNode;
}

export function SectionCard({ title, count, href, linkLabel = "Vezi toate", description, children }: SectionCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            {title}
            {typeof count === "number" ? (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                {count}
              </span>
            ) : null}
          </CardTitle>
          {description ? <p className="text-muted-foreground mt-1 text-[13px]">{description}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="text-primary rounded text-sm font-medium hover:underline">
            {linkLabel}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="px-2 pt-2 pb-2 sm:px-3 sm:pb-3">{children}</CardContent>
    </Card>
  );
}
