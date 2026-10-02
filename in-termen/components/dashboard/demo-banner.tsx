import { FlaskConical } from "lucide-react";

import { ActionButton } from "@/components/ui/action-button";
import { removeDemoData } from "@/lib/actions/settings";

/**
 * Afișat cât timp există date demonstrative în cont. Compact, ca să nu împingă
 * sumarul termenelor în josul ecranului (ierarhie vizuală, atenție selectivă).
 */
export function DemoBanner() {
  return (
    <div className="border-upcoming-border bg-upcoming-soft flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 text-sm text-[#173f7a]">
      <FlaskConical className="text-upcoming size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Date demonstrative.</span> Documentele marcate „Demo” sunt fictive.
      </p>
      <ActionButton action={removeDemoData} variant="link" size="sm" pendingLabel="Se șterg…">
        Șterge datele demo
      </ActionButton>
    </div>
  );
}
