import { Plus, UserRound, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { DocumentListItem } from "@/components/documents/document-list-item";
import { DeleteMemberButton } from "@/components/family/delete-member-button";
import { MemberDialog } from "@/components/family/member-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { requireSession } from "@/lib/auth";
import { listDocuments, listFamilyMembers, sortByUrgency } from "@/lib/data/queries";
import type { DocumentView } from "@/lib/data/views";
import { formatRoDate, todayInTimeZone } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Familie" };

function PersonSection({
  title,
  subtitle,
  documents,
  addHref,
  actions,
}: {
  title: string;
  subtitle: string;
  documents: DocumentView[];
  addHref: string;
  actions?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-border flex flex-wrap items-center gap-3 border-b p-4 sm:px-5">
        <span className="bg-accent-soft text-accent flex size-10 items-center justify-center rounded-full" aria-hidden>
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-[13px]">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <Button asChild variant="outline" size="sm">
            <Link href={addHref}>
              <Plus aria-hidden />
              Adaugă document
            </Link>
          </Button>
        </div>
      </div>
      <div className="p-2 sm:p-3">
        {documents.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">Niciun document asociat.</p>
        ) : (
          <ul>
            {sortByUrgency(documents).map((doc) => (
              <li key={doc.id}>
                <DocumentListItem document={doc} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function documentCountLabel(count: number): string {
  if (count === 1) return "1 document";
  return `${count} ${count >= 20 ? "de documente" : "documente"}`;
}

export default async function FamilyPage() {
  const { supabase, profile } = await requireSession();
  const today = todayInTimeZone(profile.timezone);
  const [members, documents] = await Promise.all([listFamilyMembers(supabase), listDocuments(supabase, today)]);

  const own = documents.filter((d) => d.family_member_id === null);

  return (
    <>
      <PageHeader
        title="Familie"
        description="Grupează documentele pe persoane: copii, partener, părinți."
        actions={<MemberDialog today={today} />}
      />

      <Notice tone="neutral" className="mb-6" title="Organizare locală, în contul tău">
        Persoanele adăugate aici nu primesc invitații și nu au acces la aplicație. Le folosești doar ca să știi al cui
        este fiecare document.
      </Notice>

      <div className="flex flex-col gap-5">
        <PersonSection
          title="Eu (titularul contului)"
          subtitle={documentCountLabel(own.length)}
          documents={own}
          addHref="/documents/new"
        />

        {members.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="Nicio persoană adăugată"
            description="Adaugă membrii familiei ca să le urmărești separat pașapoartele, actele de la școală sau polițele medicale."
            action={<MemberDialog today={today} />}
          />
        ) : (
          members.map((member) => {
            const memberDocs = documents.filter((d) => d.family_member_id === member.id);
            const subtitle = [
              member.relationship,
              member.birth_date ? `născut(ă) pe ${formatRoDate(member.birth_date)}` : null,
              documentCountLabel(memberDocs.length),
              member.is_demo ? "demonstrativ" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <PersonSection
                key={member.id}
                title={member.full_name}
                subtitle={subtitle}
                documents={memberDocs}
                addHref={`/documents/new?persoana=${member.id}`}
                actions={
                  <>
                    <MemberDialog member={member} today={today} />
                    <DeleteMemberButton
                      memberId={member.id}
                      name={member.full_name}
                      documentCount={memberDocs.length}
                    />
                  </>
                }
              />
            );
          })
        )}
      </div>
    </>
  );
}
