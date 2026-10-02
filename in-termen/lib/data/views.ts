import { daysUntilExpiry, type ISODate } from "@/lib/utils/dates";
import { getDocumentStatus } from "@/lib/utils/status";
import type { DocumentRow } from "@/types/database";
import type { DocumentCategory, DocumentStatus } from "@/types/domain";

/** Documentul așa cum îl afișează interfața: rândul din baza de date plus statusul calculat. */
export interface DocumentView extends DocumentRow {
  category: DocumentCategory;
  status: DocumentStatus;
  daysLeft: number | null;
  memberName: string | null;
}

export type DocumentRowWithMember = DocumentRow & {
  family_members: { id: string; full_name: string } | null;
};

export function toDocumentView(row: DocumentRowWithMember, today: ISODate): DocumentView {
  const { family_members: member, ...rest } = row;
  return {
    ...rest,
    category: rest.category as DocumentCategory,
    status: getDocumentStatus(rest.expiry_date, today),
    daysLeft: daysUntilExpiry(rest.expiry_date, today),
    memberName: member?.full_name ?? null,
  };
}
