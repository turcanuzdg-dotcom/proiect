import { FileSearch, Files, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DocumentCard } from "@/components/documents/document-card";
import { DocumentListItem } from "@/components/documents/document-list-item";
import { DocumentsToolbar } from "@/components/documents/documents-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth";
import { listDocuments, sortByUrgency } from "@/lib/data/queries";
import type { DocumentView } from "@/lib/data/views";
import { CATEGORY_META } from "@/lib/constants";
import { todayInTimeZone } from "@/lib/utils/dates";
import { documentFiltersSchema, type DocumentFilters } from "@/lib/validations/document";

export const metadata: Metadata = { title: "Documente" };

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function applyFilters(documents: DocumentView[], filters: DocumentFilters): DocumentView[] {
  const query = normalize(filters.q);
  const filtered = documents.filter(
    (doc) =>
      (query === "" || normalize(doc.title).includes(query)) &&
      (filters.category === "all" || doc.category === filters.category) &&
      (filters.status === "all" || doc.status === filters.status),
  );

  switch (filters.sort) {
    case "newest":
      return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "title":
      return filtered.sort((a, b) => a.title.localeCompare(b.title, "ro"));
    case "category":
      return filtered.sort(
        (a, b) =>
          CATEGORY_META[a.category].label.localeCompare(CATEGORY_META[b.category].label, "ro") ||
          a.title.localeCompare(b.title, "ro"),
      );
    default:
      return sortByUrgency(filtered);
  }
}

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const { supabase, profile } = await requireSession();
  const raw = await searchParams;
  const filters = documentFiltersSchema.parse({
    q: typeof raw.q === "string" ? raw.q : "",
    category: raw.category,
    status: raw.status,
    sort: raw.sort,
    view: raw.view,
  });

  const today = todayInTimeZone(profile.timezone);
  const documents = await listDocuments(supabase, today);
  const visible = applyFilters(documents, filters);

  return (
    <>
      <PageHeader
        title="Documente"
        description="Toate actele și termenele tale, într-un singur loc."
        actions={
          documents.length > 0 ? (
            <Button asChild>
              <Link href="/documents/new">
                <Plus aria-hidden />
                Adaugă un document
              </Link>
            </Button>
          ) : null
        }
      />

      {documents.length === 0 ? (
        <EmptyState
          icon={Files}
          title="Nu ai încă documente"
          description="Adaugă primul act: buletinul, RCA-ul sau o garanție. Îți arătăm imediat când expiră."
          action={
            <Button asChild size="lg">
              <Link href="/documents/new">
                <Plus aria-hidden />
                Adaugă un document
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          <DocumentsToolbar filters={filters} />
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {visible.length === documents.length
              ? `${documents.length} ${documents.length === 1 ? "document" : documents.length >= 20 ? "de documente" : "documente"}`
              : `${visible.length} din ${documents.length} documente`}
          </p>

          {visible.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title="Niciun document nu corespunde filtrelor"
              description="Încearcă alt cuvânt sau resetează filtrele."
              action={
                <Button asChild variant="outline">
                  <Link href="/documents">Resetează filtrele</Link>
                </Button>
              }
            />
          ) : filters.view === "list" ? (
            <ul className="border-border bg-surface shadow-card rounded-2xl border p-2">
              {visible.map((doc) => (
                <li key={doc.id}>
                  <DocumentListItem document={doc} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((doc) => (
                <li key={doc.id}>
                  <DocumentCard document={doc} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
