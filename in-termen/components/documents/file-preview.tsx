"use client";

import { ExternalLink, FileText, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getSignedFileUrl } from "@/lib/actions/documents";

interface FilePreviewProps {
  path: string;
  name: string;
  mimeType: string | null;
  /** URL semnat generat pe server, valabil câteva minute. */
  initialUrl: string | null;
}

/** Previzualizare securizată: fișierul se deschide doar printr-un URL semnat, de scurtă durată. */
export function FilePreview({ path, name, mimeType, initialUrl }: FilePreviewProps) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, startTransition] = useTransition();
  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  function refresh(openAfter = false) {
    startTransition(async () => {
      const result = await getSignedFileUrl(path);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setUrl(result.data.url);
      if (openAfter) window.open(result.data.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <div className="bg-subtle">
        {url && isImage ? (
          // URL semnat temporar din Storage privat; next/image nu este potrivit aici.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Previzualizare: ${name}`}
            className="max-h-[28rem] w-full object-contain"
            onError={() => setUrl(null)}
          />
        ) : url && isPdf ? (
          <object
            data={url}
            type="application/pdf"
            className="h-[28rem] w-full"
            aria-label={`Previzualizare PDF: ${name}`}
          >
            <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-2 text-sm">
              <FileText className="size-8" aria-hidden />
              Browserul nu poate afișa PDF-ul aici. Deschide-l într-o filă nouă.
            </div>
          </object>
        ) : (
          <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-3 text-sm">
            <FileText className="size-8" aria-hidden />
            <span>Previzualizarea a expirat din motive de securitate.</span>
            <Button variant="outline" size="sm" onClick={() => refresh()} disabled={pending}>
              <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
              Reîncarcă previzualizarea
            </Button>
          </div>
        )}
      </div>
      <div className="border-border bg-surface flex flex-wrap items-center gap-3 border-t p-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
        <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={pending}>
          <ExternalLink aria-hidden />
          Deschide
        </Button>
      </div>
    </div>
  );
}

/** Buton pentru fișierele din istoricul reînnoirilor (URL semnat la cerere). */
export function SignedFileButton({ path, label }: { path: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="link"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await getSignedFileUrl(path);
          if (result.ok) window.open(result.data.url, "_blank", "noopener,noreferrer");
          else toast.error(result.error);
        })
      }
    >
      {label}
    </Button>
  );
}
