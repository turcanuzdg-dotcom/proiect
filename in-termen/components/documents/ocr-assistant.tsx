"use client";

import { LoaderCircle, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";

import { categoryLabel } from "@/components/documents/category-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { formatRoDate, isISODate } from "@/lib/utils/dates";
import type { UploadedFileRef } from "@/types/domain";

interface OcrAssistantProps {
  file: UploadedFileRef | null;
  values: { title: string; category: string; issuer: string; issueDate: string; expiryDate: string };
  onApplyExpiryDate: (date: string) => void;
}

type Phase =
  | { kind: "closed" }
  | { kind: "demo" }
  | { kind: "consent"; provider: string }
  | { kind: "running"; provider: string }
  | { kind: "result"; provider: string; date: string | null; text: string }
  | { kind: "error"; message: string };

/**
 * „Extrage date din document (beta)”.
 * - Fără furnizor OCR configurat: arată o SIMULARE transparentă, construită din datele introduse.
 * - Cu furnizor configurat: cere acordul explicit înainte de a trimite fișierul.
 */
export function OcrAssistant({ file, values, onApplyExpiryDate }: OcrAssistantProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });
  const [checking, setChecking] = useState(false);
  const [consent, setConsent] = useState(false);

  async function start() {
    setChecking(true);
    try {
      const response = await fetch("/api/ocr", { cache: "no-store" });
      const status = (await response.json()) as { configured?: boolean; provider?: string | null };
      if (!status.configured || !status.provider) {
        setPhase({ kind: "demo" });
      } else if (!file) {
        setPhase({ kind: "error", message: "Încarcă mai întâi un fișier, apoi încearcă extragerea." });
      } else {
        setConsent(false);
        setPhase({ kind: "consent", provider: status.provider });
      }
    } catch {
      setPhase({ kind: "demo" });
    } finally {
      setChecking(false);
    }
  }

  async function run(provider: string) {
    if (!file) return;
    setPhase({ kind: "running", provider });
    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path, consent: true }),
      });
      const json = (await response.json()) as {
        suggestedExpiryDate?: string | null;
        textPreview?: string;
        error?: string;
      };
      if (!response.ok) {
        setPhase({ kind: "error", message: json.error ?? "Extragerea nu a reușit. Completează datele manual." });
        return;
      }
      setPhase({ kind: "result", provider, date: json.suggestedExpiryDate ?? null, text: json.textPreview ?? "" });
    } catch {
      setPhase({ kind: "error", message: "Extragerea nu a reușit. Completează datele manual." });
    }
  }

  const close = () => setPhase({ kind: "closed" });
  const rows: Array<[string, string]> = [
    ["Titlu", values.title || "—"],
    ["Categorie", values.category ? categoryLabel(values.category) : "—"],
    ["Emitent / furnizor", values.issuer || "—"],
    ["Data emiterii", isISODate(values.issueDate) ? formatRoDate(values.issueDate) : "—"],
    ["Data expirării", isISODate(values.expiryDate) ? formatRoDate(values.expiryDate) : "—"],
  ];

  return (
    <>
      <Button variant="secondary" onClick={start} disabled={checking}>
        {checking ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
        Extrage date din document (beta)
      </Button>

      <Dialog open={phase.kind !== "closed"} onOpenChange={(open) => (!open ? close() : undefined)}>
        <DialogContent>
          {phase.kind === "demo" ? (
            <>
              <DialogHeader>
                <DialogTitle>Extragere de date (beta)</DialogTitle>
                <DialogDescription>Funcție demonstrativă — verifică manual datele extrase.</DialogDescription>
              </DialogHeader>
              <Notice tone="warning" title="Nu a fost citit niciun fișier">
                Recunoașterea automată a textului nu este configurată încă. Mai jos vezi o simulare construită din
                datele pe care le-ai introdus tu. Fișierul tău nu a fost trimis nicăieri.
              </Notice>
              <dl className="divide-border border-border mt-4 divide-y rounded-xl border">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <DialogFooter>
                <Button onClick={close}>Am înțeles</Button>
              </DialogFooter>
            </>
          ) : null}

          {phase.kind === "consent" ? (
            <>
              <DialogHeader>
                <DialogTitle>Trimitem fișierul pentru recunoaștere?</DialogTitle>
                <DialogDescription>Avem nevoie de acordul tău înainte de a trimite documentul.</DialogDescription>
              </DialogHeader>
              <Notice tone="info" title="Notă de confidențialitate">
                Pentru a citi textul, fișierul „{file?.name}” va fi trimis către serviciul extern {phase.provider}.
                Acesta poate conține date personale. Nu trimitem nimic fără confirmarea ta, iar rezultatul trebuie
                verificat manual.
              </Notice>
              <div className="mt-4 flex items-start gap-3">
                <Checkbox id="ocr-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
                <Label htmlFor="ocr-consent" className="leading-snug font-normal">
                  Sunt de acord ca acest fișier să fie trimis către {phase.provider} pentru extragerea datelor.
                </Label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={close}>
                  Renunță
                </Button>
                <Button onClick={() => run(phase.provider)} disabled={!consent}>
                  Trimite și extrage
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {phase.kind === "running" ? (
            <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
              <LoaderCircle className="text-primary size-8 animate-spin" aria-hidden />
              <DialogTitle className="mt-4 text-base">Se citește documentul…</DialogTitle>
              <DialogDescription>Poate dura câteva secunde.</DialogDescription>
            </div>
          ) : null}

          {phase.kind === "result" ? (
            <>
              <DialogHeader>
                <DialogTitle>Rezultatul extragerii (beta)</DialogTitle>
                <DialogDescription>Verifică manual datele extrase înainte de a le folosi.</DialogDescription>
              </DialogHeader>
              {phase.date ? (
                <div className="border-border bg-subtle rounded-xl border p-4">
                  <p className="text-muted-foreground text-[13px]">Dată de expirare sugerată</p>
                  <p className="mt-1 text-lg font-semibold">{formatRoDate(phase.date)}</p>
                </div>
              ) : (
                <Notice tone="warning">Nu am găsit o dată de expirare în text. Completează data manual.</Notice>
              )}
              {phase.text ? (
                <details className="mt-3 text-sm">
                  <summary className="text-primary cursor-pointer font-medium">Vezi textul recunoscut</summary>
                  <pre className="bg-subtle mt-2 max-h-48 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
                    {phase.text}
                  </pre>
                </details>
              ) : null}
              <DialogFooter>
                <Button variant="outline" onClick={close}>
                  Închide
                </Button>
                {phase.date ? (
                  <Button
                    onClick={() => {
                      onApplyExpiryDate(phase.date as string);
                      close();
                    }}
                  >
                    Folosește această dată
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}

          {phase.kind === "error" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlert className="text-urgent size-5" aria-hidden />
                  Extragerea nu este disponibilă
                </DialogTitle>
                <DialogDescription>{phase.message}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={close}>Am înțeles</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
