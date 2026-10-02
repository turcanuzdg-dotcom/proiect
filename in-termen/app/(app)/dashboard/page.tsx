import { CircleCheck, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DemoBanner } from "@/components/dashboard/demo-banner";
import { EmptyDashboard } from "@/components/dashboard/empty-dashboard";
import { Overview } from "@/components/dashboard/overview";
import { RiskSummary } from "@/components/dashboard/risk-summary";
import { SectionCard } from "@/components/dashboard/section-card";
import { UpcomingTimeline } from "@/components/dashboard/upcoming-timeline";
import { WelcomeGuide } from "@/components/dashboard/welcome-guide";
import { DocumentListItem } from "@/components/documents/document-list-item";
import { Button } from "@/components/ui/button";
import { firstName, requireSession } from "@/lib/auth";
import { listDocuments, sortByUrgency } from "@/lib/data/queries";
import { todayInTimeZone } from "@/lib/utils/dates";
import { needsAttention, summarizeStatuses } from "@/lib/utils/status";

export const metadata: Metadata = { title: "Acasă" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { supabase, user, profile } = await requireSession();
  const params = await searchParams;
  const today = todayInTimeZone(profile.timezone);
  const documents = await listDocuments(supabase, today);

  const summary = summarizeStatuses(documents, today);
  const attention = sortByUrgency(documents.filter((d) => needsAttention(d.status)));
  const upcoming = documents
    .filter((d) => d.daysLeft !== null && d.daysLeft >= 0)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 5);
  const safe = documents.filter((d) => d.status === "safe" || d.status === "no_expiry");
  const hasDemo = documents.some((d) => d.is_demo);
  const showWelcome = params["bun-venit"] === "1";
  const name = firstName(profile.full_name, user.email);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Bun venit{name ? `, ${name}` : ""}</h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">Iată ce merită verificat astăzi.</p>
        </div>
        {documents.length > 0 ? (
          <Button asChild size="lg" className="hidden sm:inline-flex">
            <Link href="/documents/new">
              <Plus aria-hidden />
              Adaugă un document
            </Link>
          </Button>
        ) : null}
      </div>

      {showWelcome ? <WelcomeGuide /> : null}
      {hasDemo ? <DemoBanner /> : null}

      {documents.length === 0 ? (
        <EmptyDashboard />
      ) : (
        <>
          <RiskSummary summary={summary} />

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="flex flex-col gap-6 lg:col-span-3">
              <SectionCard
                title="Necesită atenție"
                count={attention.length}
                href={attention.length > 0 ? "/documents?sort=expiry" : undefined}
              >
                {attention.length === 0 ? (
                  <div className="flex items-center gap-3 px-3 py-5 text-sm">
                    <CircleCheck className="text-safe size-5 shrink-0" aria-hidden />
                    <p>
                      <span className="font-medium">Nimic urgent.</span>{" "}
                      <span className="text-muted-foreground">Niciun termen în următoarele 30 de zile.</span>
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col">
                    {attention.slice(0, 6).map((doc) => (
                      <li key={doc.id}>
                        <DocumentListItem document={doc} />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                title="În regulă"
                count={safe.length}
                description={
                  summary.no_expiry > 0
                    ? `${summary.safe} cu termen peste 30 de zile · ${summary.no_expiry} fără termen`
                    : undefined
                }
                href={safe.length > 4 ? "/documents?status=safe" : undefined}
              >
                {safe.length === 0 ? (
                  <p className="text-muted-foreground px-3 py-5 text-sm">
                    Documentele cu termen de peste 30 de zile vor apărea aici.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {safe.slice(0, 4).map((doc) => (
                      <li key={doc.id}>
                        <DocumentListItem document={doc} />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            <div className="flex flex-col gap-6 lg:col-span-2">
              <UpcomingTimeline documents={upcoming} />
              <Overview summary={summary} withFiles={documents.filter((d) => d.file_path).length} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
