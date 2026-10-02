"use server";

import { revalidatePath } from "next/cache";

import { fail, getActionSession, mapDatabaseError, NOT_AUTHENTICATED } from "@/lib/actions/context";
import { daysBetween, todayInTimeZone } from "@/lib/utils/dates";
import { fieldErrorsFrom, firstErrorMessage, uuidSchema } from "@/lib/validations/common";
import { saveFamilyMemberInputSchema, type FamilyMemberValues } from "@/lib/validations/misc";
import type { ActionResult } from "@/types/domain";

function revalidateFamilyPages() {
  revalidatePath("/family");
  revalidatePath("/documents");
  revalidatePath("/dashboard");
}

export async function saveFamilyMember(
  memberId: string | null,
  values: FamilyMemberValues,
): Promise<ActionResult<{ id: string }>> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const parsed = saveFamilyMemberInputSchema.safeParse({ memberId, values });
  if (!parsed.success) return fail(firstErrorMessage(parsed.error), fieldErrorsFrom(parsed.error));

  const { fullName, relationship, birthDate } = parsed.data.values;
  if (birthDate && daysBetween(todayInTimeZone(session.profile.timezone), birthDate) > 0) {
    return fail("Data nașterii nu poate fi în viitor.", {
      "values.birthDate": ["Data nașterii nu poate fi în viitor."],
    });
  }

  const row = { full_name: fullName, relationship: relationship || null, birth_date: birthDate || null };
  const query = parsed.data.memberId
    ? session.supabase.from("family_members").update(row).eq("id", parsed.data.memberId)
    : session.supabase.from("family_members").insert(row);

  const { data, error } = await query.select("id").maybeSingle();
  if (error) return fail(mapDatabaseError(error));
  if (!data) return fail("Persoana nu a fost găsită.");

  revalidateFamilyPages();
  return {
    ok: true,
    data: { id: data.id },
    message: parsed.data.memberId ? "Modificările au fost salvate." : "Persoana a fost adăugată.",
  };
}

export async function deleteFamilyMember(memberId: string): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;
  if (!uuidSchema.safeParse(memberId).success) return fail("Persoană invalidă.");

  // Documentele persoanei rămân în cont, fără persoană asociată (on delete set null).
  const { error } = await session.supabase.from("family_members").delete().eq("id", memberId);
  if (error) return fail(mapDatabaseError(error));

  revalidateFamilyPages();
  return { ok: true, data: undefined, message: "Persoana a fost ștearsă. Documentele ei au rămas în cont." };
}
