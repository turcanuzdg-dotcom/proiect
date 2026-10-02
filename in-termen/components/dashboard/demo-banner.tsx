import { FlaskConical } from "lucide-react";

import { ActionButton } from "@/components/ui/action-button";
import { removeDemoData } from "@/lib/actions/settings";

/** Afișat cât timp există date demonstrative în cont. */
export function DemoBanner() {
  return (
    <div className="border-upcoming-border bg-upcoming-soft flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
      <span
        className="bg-surface text-upcoming flex size-9 shrink-0 items-center justify-center rounded-xl"
        aria-hidden
      >
        <FlaskConical className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-[#173f7a]">
        <p className="font-semibold">Vezi cum funcționează cu date demonstrative</p>
        <p>Documentele marcate „Demo” sunt fictive. Le poți șterge oricând, iar datele tale rămân neatinse.</p>
      </div>
      <ActionButton
        action={removeDemoData}
        variant="outline"
        size="sm"
        pendingLabel="Se șterg…"
        className="self-start sm:self-center"
      >
        Șterge datele demonstrative
      </ActionButton>
    </div>
  );
}
