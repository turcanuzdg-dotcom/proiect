"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="bg-urgent-soft text-urgent flex size-12 items-center justify-center rounded-2xl" aria-hidden>
        <TriangleAlert className="size-6" />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">Nu am putut încărca pagina</h1>
      <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
        Poate fi o problemă temporară de conexiune. Datele tale sunt în siguranță.
      </p>
      <Button onClick={reset} className="mt-6">
        <RotateCcw aria-hidden />
        Încearcă din nou
      </Button>
    </div>
  );
}
