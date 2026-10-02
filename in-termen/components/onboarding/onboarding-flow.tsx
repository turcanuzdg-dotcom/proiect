"use client";

import { ArrowLeft, ArrowRight, Bell, Check, LoaderCircle, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CATEGORY_ICONS } from "@/components/documents/category-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { completeOnboarding } from "@/lib/actions/settings";
import { CATEGORY_META } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import type { DocumentCategory } from "@/types/domain";

const ONBOARDING_CATEGORIES: DocumentCategory[] = [
  "personal_documents",
  "vehicle",
  "insurance",
  "home_warranty",
  "bills_subscriptions",
  "health",
  "family",
];

export function OnboardingFlow({ name, emailConfigured }: { name: string; emailConfigured: boolean }) {
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [email, setEmail] = useState(false);
  const [demo, setDemo] = useState(true);
  const [pending, startTransition] = useTransition();

  function toggle(category: DocumentCategory) {
    setCategories((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );
  }

  function finish() {
    startTransition(async () => {
      const result = await completeOnboarding({ categories, emailNotifications: email, addDemoData: demo });
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="w-full max-w-xl">
      <p className="text-accent text-sm font-medium">Pasul {step + 1} din 3</p>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")}
          />
        ))}
      </div>

      <section className="border-border bg-surface shadow-card mt-6 rounded-2xl border p-6 sm:p-8" aria-live="polite">
        {step === 0 ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              {name ? `Salut, ${name}! ` : ""}Ce vrei să urmărești?
            </h1>
            <p className="text-muted-foreground mt-2 text-[15px]">
              Alege tot ce te interesează. Ne ajută să-ți arătăm exemple potrivite. Poți adăuga oricând orice tip de
              document.
            </p>
            <fieldset className="mt-6">
              <legend className="sr-only">Categorii urmărite</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {ONBOARDING_CATEGORIES.map((category) => {
                  const Icon = CATEGORY_ICONS[category];
                  const selected = categories.includes(category);
                  return (
                    <label
                      key={category}
                      className={cn(
                        "has-[:focus-visible]:outline-ring flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                        selected
                          ? "border-primary bg-primary-soft/60 ring-primary ring-1"
                          : "border-border hover:bg-subtle",
                      )}
                    >
                      <input type="checkbox" className="sr-only" checked={selected} onChange={() => toggle(category)} />
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-lg",
                          selected ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary",
                        )}
                        aria-hidden
                      >
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="flex-1 text-[15px] font-medium">{CATEGORY_META[category].label}</span>
                      {selected ? <Check className="text-primary size-4" strokeWidth={2.5} aria-hidden /> : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Cum vrei să primești remindere?</h1>
            <p className="text-muted-foreground mt-2 text-[15px]">
              Îți amintim implicit cu 45, 30, 14, 7 zile și cu o zi înainte de fiecare termen.
            </p>
            <div className="divide-border border-border mt-6 flex flex-col divide-y rounded-xl border">
              <div className="flex items-center gap-4 p-4">
                <span
                  className="bg-accent-soft text-accent flex size-9 items-center justify-center rounded-lg"
                  aria-hidden
                >
                  <Bell className="size-[18px]" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">În aplicație</p>
                  <p className="text-muted-foreground text-[13px]">
                    Mereu activ. Vezi reminderele în clopoțel și pe panou.
                  </p>
                </div>
                <Check className="text-accent size-5" aria-label="Activ" />
              </div>
              <div className="flex items-center gap-4 p-4">
                <span
                  className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg"
                  aria-hidden
                >
                  <Mail className="size-[18px]" />
                </span>
                <Label htmlFor="onb-email" className="flex-1 cursor-pointer font-normal">
                  <span className="block text-sm font-medium">Și prin e-mail</span>
                  <span id="onb-email-desc" className="text-muted-foreground block text-[13px]">
                    {emailConfigured
                      ? "Opțional. Un e-mail în ziua reminderului."
                      : "Notificările prin e-mail nu sunt configurate încă."}
                  </span>
                </Label>
                <Switch
                  id="onb-email"
                  checked={email}
                  disabled={!emailConfigured}
                  aria-describedby="onb-email-desc"
                  onCheckedChange={setEmail}
                />
              </div>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Totul este pregătit</h1>
            <p className="text-muted-foreground mt-2 text-[15px]">
              Pe panou vezi ce expiră și ce trebuie făcut. Primul pas: adaugă un document cu data lui de expirare.
            </p>
            <div className="bg-subtle mt-6 flex items-start gap-3 rounded-xl p-4">
              <Checkbox id="onb-demo" checked={demo} onCheckedChange={(v) => setDemo(v === true)} />
              <Label htmlFor="onb-demo" className="cursor-pointer leading-snug font-normal">
                <span className="font-medium">Vezi cum funcționează cu date demonstrative</span>
                <span className="text-muted-foreground mt-0.5 block text-[13px]">
                  Adăugăm câteva documente fictive (RCA, pașaport, garanție…). Le ștergi dintr-un clic când vrei.
                </span>
              </Label>
            </div>
          </>
        ) : null}
      </section>

      <div className="mt-6 flex items-center gap-3">
        {step > 0 ? (
          <Button variant="ghost" size="lg" onClick={() => setStep(step - 1)} disabled={pending}>
            <ArrowLeft aria-hidden />
            Înapoi
          </Button>
        ) : null}
        <div className="ml-auto">
          {step < 2 ? (
            <Button size="lg" onClick={() => setStep(step + 1)}>
              Continuă
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button size="lg" onClick={finish} disabled={pending} aria-busy={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {pending ? "Se pregătește…" : "Mergi la panou"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
