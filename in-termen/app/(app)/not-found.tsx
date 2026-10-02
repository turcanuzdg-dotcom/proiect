import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="bg-primary-soft text-primary flex size-12 items-center justify-center rounded-2xl" aria-hidden>
        <FileQuestion className="size-6" />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">Nu am găsit ce cauți</h1>
      <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
        Documentul poate să fi fost șters sau linkul nu mai este valid.
      </p>
      <Button asChild className="mt-6">
        <Link href="/documents">Înapoi la documente</Link>
      </Button>
    </div>
  );
}
