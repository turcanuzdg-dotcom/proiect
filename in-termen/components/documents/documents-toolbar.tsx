"use client";

import { LayoutGrid, List, LoaderCircle, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_META, STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import type { DocumentFilters } from "@/lib/validations/document";
import { DOCUMENT_CATEGORIES, DOCUMENT_STATUSES } from "@/types/domain";

const DEFAULTS: DocumentFilters = { q: "", category: "all", status: "all", sort: "expiry", view: "grid" };

const SORT_LABELS: Record<DocumentFilters["sort"], string> = {
  expiry: "Cel mai apropiat termen",
  newest: "Cele mai noi",
  category: "Categorie",
  title: "Titlu (A–Z)",
};

export function DocumentsToolbar({ filters }: { filters: DocumentFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(patch: Partial<DocumentFilters>) {
    const nextFilters = { ...filters, ...patch };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters) as Array<[keyof DocumentFilters, string]>) {
      if (value && value !== DEFAULTS[key]) params.set(key, value);
    }
    const search = params.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }));
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function onSearchChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: value.trim() }), 300);
  }

  const hasFilters = filters.q !== "" || filters.category !== "all" || filters.status !== "all";

  return (
    <div className="border-border bg-surface shadow-card flex flex-col gap-3 rounded-2xl border p-3 sm:p-4">
      <div className="relative">
        <Label htmlFor="cautare" className="sr-only">
          Caută după titlu
        </Label>
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="cautare"
          type="search"
          value={query}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Caută după titlu"
          className="pr-9 pl-9"
          autoComplete="off"
        />
        {pending ? (
          <LoaderCircle
            className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
            aria-label="Se actualizează"
          />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="col-span-1 sm:w-48">
          <Label htmlFor="filtru-categorie" className="sr-only">
            Categorie
          </Label>
          <NativeSelect
            id="filtru-categorie"
            value={filters.category}
            onChange={(event) => navigate({ category: event.target.value as DocumentFilters["category"] })}
            className="h-10"
          >
            <option value="all">Toate categoriile</option>
            {DOCUMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_META[category].label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="col-span-1 sm:w-44">
          <Label htmlFor="filtru-status" className="sr-only">
            Status
          </Label>
          <NativeSelect
            id="filtru-status"
            value={filters.status}
            onChange={(event) => navigate({ status: event.target.value as DocumentFilters["status"] })}
            className="h-10"
          >
            <option value="all">Toate statusurile</option>
            {DOCUMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].filterLabel}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="col-span-2 sm:w-56">
          <Label htmlFor="sortare" className="sr-only">
            Sortare
          </Label>
          <NativeSelect
            id="sortare"
            value={filters.sort}
            onChange={(event) => navigate({ sort: event.target.value as DocumentFilters["sort"] })}
            className="h-10"
          >
            {(Object.keys(SORT_LABELS) as Array<DocumentFilters["sort"]>).map((sort) => (
              <option key={sort} value={sort}>
                Sortare: {SORT_LABELS[sort]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="col-span-2 flex items-center gap-2 sm:ml-auto">
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                navigate({ q: "", category: "all", status: "all" });
              }}
              className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium"
            >
              <X className="size-4" aria-hidden />
              Resetează filtrele
            </button>
          ) : null}
          <div className="border-input ml-auto flex rounded-lg border p-0.5" role="group" aria-label="Mod de afișare">
            {(["grid", "list"] as const).map((view) => {
              const Icon = view === "grid" ? LayoutGrid : List;
              const active = filters.view === view;
              return (
                <button
                  key={view}
                  type="button"
                  aria-pressed={active}
                  aria-label={view === "grid" ? "Afișare ca grilă" : "Afișare ca listă"}
                  onClick={() => navigate({ view })}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md transition-colors",
                    active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
