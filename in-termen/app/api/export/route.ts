import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { CATEGORY_META, REMINDER_CHANNEL_LABELS, REMINDER_STATUS_LABELS, STATUS_META } from "@/lib/constants";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { todayInTimeZone } from "@/lib/utils/dates";
import { toCsv } from "@/lib/utils/csv";
import { getDocumentStatus } from "@/lib/utils/status";
import type { DocumentCategory, ReminderChannel, ReminderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

/**
 * Exportul datelor proprii.
 *   /api/export?format=json                    -> documente, remindere, familie, reînnoiri
 *   /api/export?format=csv&type=documents      -> documente (CSV)
 *   /api/export?format=csv&type=reminders      -> remindere (CSV)
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  if (!checkRateLimit("export", session.user.id).allowed) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const type = request.nextUrl.searchParams.get("type") === "reminders" ? "reminders" : "documents";
  const { supabase, profile } = session;
  const today = todayInTimeZone(profile.timezone);
  const stamp = today;

  const [documents, reminders, family, renewals] = await Promise.all([
    supabase.from("documents").select("*, family_members(full_name)").order("created_at"),
    supabase.from("reminders").select("*, documents(title)").order("remind_at"),
    supabase.from("family_members").select("*").order("created_at"),
    supabase.from("renewals").select("*").order("created_at"),
  ]);
  if (documents.error || reminders.error || family.error || renewals.error) {
    return NextResponse.json({ error: "Exportul nu a reușit. Încearcă din nou." }, { status: 500 });
  }

  if (format === "json") {
    const body = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        app: "În Termen",
        note: "Fișierele atașate nu sunt incluse; le poți descărca din pagina fiecărui document.",
        documents: documents.data,
        reminders: reminders.data,
        family_members: family.data,
        renewals: renewals.data,
      },
      null,
      2,
    );
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="in-termen-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv =
    type === "documents"
      ? toCsv(
          [
            "Titlu",
            "Categorie",
            "Status",
            "Data expirării",
            "Data emiterii",
            "Emitent",
            "Persoană",
            "Sumă",
            "Monedă",
            "Link reînnoire",
            "Notițe",
            "Fișier",
            "Demonstrativ",
          ],
          (documents.data ?? []).map((d) => [
            d.title,
            CATEGORY_META[d.category as DocumentCategory]?.label ?? d.category,
            STATUS_META[getDocumentStatus(d.expiry_date, today)].label,
            d.expiry_date,
            d.issue_date,
            d.issuer,
            d.family_members?.full_name ?? "",
            d.amount,
            d.currency,
            d.renewal_url,
            d.notes,
            d.file_name,
            d.is_demo ? "da" : "nu",
          ]),
        )
      : toCsv(
          ["Titlu", "Document", "Moment (UTC)", "Amânat până la (UTC)", "Status", "Canal", "Detalii"],
          (reminders.data ?? []).map((r) => [
            r.title,
            r.documents?.title ?? "",
            r.remind_at,
            r.snoozed_until,
            REMINDER_STATUS_LABELS[r.status as ReminderStatus] ?? r.status,
            REMINDER_CHANNEL_LABELS[r.channel as ReminderChannel] ?? r.channel,
            r.body,
          ]),
        );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="in-termen-${type === "documents" ? "documente" : "remindere"}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
