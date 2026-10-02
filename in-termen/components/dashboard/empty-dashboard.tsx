import { FileText, Plus } from "lucide-react";
import Link from "next/link";

import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { seedDemoData } from "@/lib/actions/settings";

/** Starea goală pentru un cont nou: ilustrație, CTA principal și varianta demonstrativă. */
export function EmptyDashboard() {
  return (
    <section className="border-border bg-surface shadow-card relative overflow-hidden rounded-2xl border px-6 py-12 text-center sm:py-16">
      <div className="relative mx-auto mb-6 h-28 w-40" aria-hidden>
        <div className="border-border bg-subtle absolute top-4 left-2 h-24 w-20 -rotate-6 rounded-xl border" />
        <div className="border-border bg-subtle absolute top-3 right-2 h-24 w-20 rotate-6 rounded-xl border" />
        <div className="border-border bg-surface shadow-raised absolute top-0 left-1/2 flex h-24 w-20 -translate-x-1/2 flex-col gap-2 rounded-xl border p-3">
          <FileText className="text-primary size-6" strokeWidth={1.75} />
          <span className="bg-muted h-1.5 w-full rounded" />
          <span className="bg-muted h-1.5 w-3/4 rounded" />
          <span className="bg-safe-soft text-safe mt-auto inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold">
            În regulă
          </span>
        </div>
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Niciun document încă</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-md text-[15px] leading-relaxed">
        Fotografiază sau încarcă un act. Aplicația îți spune ce expiră și când trebuie să acționezi.
      </p>
      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/documents/new">
            <Plus aria-hidden />
            Adaugă un document
          </Link>
        </Button>
        <ActionButton action={seedDemoData} variant="ghost" size="lg" pendingLabel="Se pregătesc datele…">
          Vezi cum funcționează cu date demonstrative
        </ActionButton>
      </div>
    </section>
  );
}
