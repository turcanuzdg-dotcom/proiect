"use client";

import { Check } from "lucide-react";

import { CATEGORY_ICONS } from "@/components/documents/category-icon";
import { CATEGORY_META } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/types/domain";

interface CategoryPickerProps {
  value: DocumentCategory | undefined;
  onChange: (category: DocumentCategory) => void;
  error?: string;
  /** Categoriile alese la onboarding apar primele. */
  preferred?: ReadonlyArray<string>;
}

/** Grup de butoane radio native (accesibile cu tastatura: săgeți, Tab, Spațiu), afișate ca plăcuțe. */
export function CategoryPicker({ value, onChange, error, preferred = [] }: CategoryPickerProps) {
  const ordered = [
    ...DOCUMENT_CATEGORIES.filter((c) => preferred.includes(c)),
    ...DOCUMENT_CATEGORIES.filter((c) => !preferred.includes(c)),
  ];
  return (
    <fieldset aria-describedby={error ? "category-error" : undefined}>
      <legend className="sr-only">Categoria documentului</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {ordered.map((category) => {
          const Icon = CATEGORY_ICONS[category];
          const meta = CATEGORY_META[category];
          const selected = value === category;
          return (
            <label
              key={category}
              className={cn(
                "has-[:focus-visible]:outline-ring relative flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                selected
                  ? "border-primary bg-primary-soft/60 ring-primary ring-1"
                  : "border-border bg-surface hover:border-input hover:bg-subtle",
              )}
            >
              <input
                type="radio"
                name="category"
                value={category}
                checked={selected}
                onChange={() => onChange(category)}
                className="sr-only"
              />
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  selected ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary",
                )}
                aria-hidden
              >
                <Icon className="size-5" strokeWidth={1.85} />
              </span>
              <span className="min-w-0 pr-5">
                <span className="block text-[15px] font-medium">{meta.label}</span>
                <span className="text-muted-foreground mt-0.5 block text-[13px] leading-snug">{meta.description}</span>
              </span>
              {selected ? (
                <Check className="text-primary absolute top-3.5 right-3.5 size-4" strokeWidth={2.5} aria-hidden />
              ) : null}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id="category-error" role="alert" className="text-destructive mt-3 text-[13px] font-medium">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
