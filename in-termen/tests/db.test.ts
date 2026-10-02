/**
 * Testele migrărilor SQL: rulează schema, RLS, politicile Storage și funcțiile RPC
 * pe un PostgreSQL real, în memorie (PGlite), cu stub-uri pentru auth și storage.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildDemoPayload } from "@/lib/demo";
import { buildReminderPreferences, generateReminderSchedule, toReminderPayload } from "@/lib/reminders/schedule";

const ROOT = join(__dirname, "..", "supabase");
const ALICE = "a11ce000-0000-4000-8000-000000000001";
const BOB = "b0b00000-0000-4000-8000-000000000002";
const TODAY = "2026-10-03";

let db: PGlite;

async function asUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec("reset role");
  if (userId) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await db.exec("set role authenticated");
  } else {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec("set role anon");
  }
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

function documentPayload(overrides: Record<string, string> = {}) {
  return {
    title: "RCA automobil",
    category: "insurance",
    issuer: "Asigurări Exemplu",
    notes: "",
    family_member_id: "",
    issue_date: "",
    expiry_date: "2026-10-15",
    currency: "MDL",
    amount: "1150",
    renewal_url: "",
    file_path: "",
    file_name: "",
    file_mime_type: "",
    ...overrides,
  };
}

function plannedFor(expiryDate: string, title = "RCA automobil") {
  return toReminderPayload(
    generateReminderSchedule({
      documentTitle: title,
      expiryDate,
      preferences: buildReminderPreferences(),
      today: TODAY,
      timeZone: "Europe/Chisinau",
    }),
  );
}

const PREFS = buildReminderPreferences().map((p) => ({ days_before: p.daysBefore, enabled: p.enabled }));

async function saveDocument(
  documentId: string | null,
  payload = documentPayload(),
  reminders: unknown[] = plannedFor("2026-10-15"),
) {
  const [row] = await rows<{ id: string }>("select public.save_document($1, $2::jsonb, $3::jsonb, $4::jsonb) as id", [
    documentId,
    JSON.stringify(payload),
    JSON.stringify(PREFS),
    JSON.stringify(reminders),
  ]);
  return row.id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(__dirname, "fixtures", "supabase-stubs.sql"), "utf8"));
  for (const file of readdirSync(join(ROOT, "migrations")).sort()) {
    await db.exec(readFileSync(join(ROOT, "migrations", file), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@example.test', '{"full_name": "Ana Exemplu"}'),
      ('${BOB}', 'bob@example.test', '{}');
  `);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("reset role");
  await db.exec(`
    delete from public.activity_logs; delete from public.renewals; delete from public.reminders;
    delete from public.reminder_preferences; delete from public.documents; delete from public.family_members;
    delete from storage.objects;
  `);
});

describe("profiluri", () => {
  it("se creează automat la înregistrare, cu numele din metadate", async () => {
    const profiles = await rows<{ id: string; full_name: string; timezone: string; default_currency: string }>(
      "select id, full_name, timezone, default_currency from public.profiles order by full_name desc",
    );
    expect(profiles).toEqual([
      { id: ALICE, full_name: "Ana Exemplu", timezone: "Europe/Chisinau", default_currency: "MDL" },
      { id: BOB, full_name: "", timezone: "Europe/Chisinau", default_currency: "MDL" },
    ]);
  });

  it("fiecare își vede și modifică doar propriul profil", async () => {
    await asUser(ALICE, async () => {
      expect(await rows("select id from public.profiles")).toEqual([{ id: ALICE }]);
      await db.query("update public.profiles set full_name = 'Atac' where id = $1", [BOB]);
    });
    const [bob] = await rows<{ full_name: string }>("select full_name from public.profiles where id = $1", [BOB]);
    expect(bob.full_name).toBe("");
  });
});

describe("save_document", () => {
  it("salvează documentul, preferințele, reminderele și jurnalul împreună", async () => {
    const id = await asUser(ALICE, () => saveDocument(null));
    const [doc] = await rows<{ user_id: string; title: string; amount: string; expiry_date: string }>(
      "select user_id, title, amount::text, expiry_date::text from public.documents where id = $1",
      [id],
    );
    expect(doc).toEqual({ user_id: ALICE, title: "RCA automobil", amount: "1150.00", expiry_date: "2026-10-15" });
    expect(
      await rows(
        "select days_before from public.reminder_preferences where document_id = $1 order by days_before desc",
        [id],
      ),
    ).toEqual([45, 30, 14, 7, 1].map((d) => ({ days_before: d })));
    const reminders = await rows<{ days_before: number | null; remind_at: string }>(
      "select days_before, to_char(remind_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as remind_at from public.reminders where document_id = $1 order by remind_at",
      [id],
    );
    expect(reminders).toEqual([
      { days_before: null, remind_at: "2026-10-03 06:00" },
      { days_before: 7, remind_at: "2026-10-08 06:00" },
      { days_before: 1, remind_at: "2026-10-14 06:00" },
    ]);
    expect(await rows("select action from public.activity_logs where document_id = $1", [id])).toEqual([
      { action: "created" },
    ]);
  });

  it("la actualizare înlocuiește reminderele active, dar păstrează pe cele finalizate", async () => {
    const id = await asUser(ALICE, () => saveDocument(null));
    await db.exec(`update public.reminders set status = 'completed', completed_at = now() where days_before is null`);

    await asUser(ALICE, () =>
      saveDocument(
        id,
        documentPayload({ expiry_date: "2027-01-06", title: "RCA reînnoit" }),
        plannedFor("2027-01-06", "RCA reînnoit"),
      ),
    );

    const statuses = await rows<{ status: string; n: number }>(
      "select status, count(*)::int as n from public.reminders where document_id = $1 group by status order by status",
      [id],
    );
    expect(statuses).toEqual([
      { status: "completed", n: 1 },
      { status: "pending", n: 5 },
    ]);
    const actions = await rows<{ action: string }>(
      "select action from public.activity_logs where document_id = $1 order by created_at, action",
      [id],
    );
    expect(actions.map((a) => a.action).sort()).toEqual(["created", "updated"]);
  });

  it("este atomic: o eroare la remindere anulează și documentul", async () => {
    const bad = [{ title: "x", remind_at: "2026-10-04T06:00:00Z", channel: "sms", days_before: 1 }];
    await expect(asUser(ALICE, () => saveDocument(null, documentPayload(), bad))).rejects.toThrow();
    expect(await rows("select id from public.documents")).toEqual([]);
    expect(await rows("select id from public.activity_logs")).toEqual([]);
  });

  it("respinge datele invalide (categorie necunoscută, emitere după expirare)", async () => {
    await expect(asUser(ALICE, () => saveDocument(null, documentPayload({ category: "masina" })))).rejects.toThrow(
      /documents_category_check/,
    );
    await expect(
      asUser(ALICE, () =>
        saveDocument(null, documentPayload({ issue_date: "2027-01-01", expiry_date: "2026-01-01" }), []),
      ),
    ).rejects.toThrow(/documents_dates_check/);
  });

  it("acceptă doar fișiere din dosarul propriu", async () => {
    await expect(
      asUser(ALICE, () =>
        saveDocument(
          null,
          documentPayload({ file_path: `${BOB}/x.pdf`, file_name: "x.pdf", file_mime_type: "application/pdf" }),
        ),
      ),
    ).rejects.toThrow(/documents_file_path_check/);
  });
});

describe("izolarea datelor (RLS)", () => {
  it("un utilizator nu vede, nu modifică și nu șterge documentele altuia", async () => {
    const id = await asUser(ALICE, () => saveDocument(null));

    await asUser(BOB, async () => {
      expect(await rows("select id from public.documents")).toEqual([]);
      expect(await rows("select id from public.reminders")).toEqual([]);
      expect(await rows("select id from public.activity_logs")).toEqual([]);
      await db.query("update public.documents set title = 'furat' where id = $1", [id]);
      await db.query("delete from public.documents where id = $1", [id]);
      await expect(saveDocument(id)).rejects.toThrow(/document_not_found/);
    });

    const [doc] = await rows<{ title: string }>("select title from public.documents where id = $1", [id]);
    expect(doc.title).toBe("RCA automobil");
  });

  it("nu permite legarea de documentele sau persoanele altui utilizator", async () => {
    const docId = await asUser(ALICE, () => saveDocument(null));
    const [member] = await asUser(ALICE, () =>
      rows<{ id: string }>("insert into public.family_members (full_name) values ('Ana Popescu') returning id"),
    );

    await asUser(BOB, async () => {
      await expect(
        db.query("insert into public.reminders (document_id, title, remind_at) values ($1, 'x', now())", [docId]),
      ).rejects.toThrow(/row-level security/);
      await expect(saveDocument(null, documentPayload({ family_member_id: member.id }))).rejects.toThrow(
        /row-level security/,
      );
      await expect(
        db.query("insert into public.documents (user_id, title, category) values ($1, 'x', 'other')", [ALICE]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("vizitatorii neautentificați nu au acces", async () => {
    await asUser(ALICE, () => saveDocument(null));
    await asUser(null, async () => {
      await expect(db.query("select * from public.documents")).rejects.toThrow(/permission denied/);
      await expect(saveDocument(null)).rejects.toThrow(/permission denied/);
    });
  });
});

describe("renew_document", () => {
  it("păstrează istoricul și mută documentul pe noul termen", async () => {
    const id = await asUser(ALICE, () =>
      saveDocument(
        null,
        documentPayload({ file_path: `${ALICE}/vechi.pdf`, file_name: "vechi.pdf", file_mime_type: "application/pdf" }),
      ),
    );

    await asUser(ALICE, () =>
      db.query("select public.renew_document($1, $2::date, $3, $4::jsonb, $5::jsonb)", [
        id,
        "2027-10-15",
        "Reînnoit la același asigurător",
        JSON.stringify({ path: `${ALICE}/nou.pdf`, name: "nou.pdf", mime_type: "application/pdf" }),
        JSON.stringify(plannedFor("2027-10-15")),
      ]),
    );

    const [doc] = await rows<{ expiry_date: string; file_path: string }>(
      "select expiry_date::text, file_path from public.documents where id = $1",
      [id],
    );
    expect(doc).toEqual({ expiry_date: "2027-10-15", file_path: `${ALICE}/nou.pdf` });

    const [renewal] = await rows(
      "select previous_expiry_date::text, new_expiry_date::text, previous_file_path, note from public.renewals",
    );
    expect(renewal).toEqual({
      previous_expiry_date: "2026-10-15",
      new_expiry_date: "2027-10-15",
      previous_file_path: `${ALICE}/vechi.pdf`,
      note: "Reînnoit la același asigurător",
    });

    const [{ n }] = await rows<{ n: number }>(
      "select count(*)::int as n from public.reminders where document_id = $1 and status = 'pending'",
      [id],
    );
    expect(n).toBe(5);
    const actions = await rows<{ action: string }>("select action from public.activity_logs where document_id = $1", [
      id,
    ]);
    expect(actions.map((a) => a.action)).toContain("renewed");
  });

  it("nu permite reînnoirea documentului altui utilizator", async () => {
    const id = await asUser(ALICE, () => saveDocument(null));
    await asUser(BOB, async () => {
      await expect(
        db.query("select public.renew_document($1, '2027-10-15'::date, null, null, '[]'::jsonb)", [id]),
      ).rejects.toThrow(/document_not_found/);
    });
  });
});

describe("date demonstrative", () => {
  it("se adaugă (idempotent) și se șterg fără să atingă datele reale", async () => {
    const payload = buildDemoPayload({
      today: TODAY,
      timeZone: "Europe/Chisinau",
      channel: "in_app",
      currency: "MDL",
      reminderDays: [45, 30, 14, 7, 1],
    });

    await asUser(ALICE, async () => {
      await saveDocument(null, documentPayload({ title: "Document real" }));
      for (let i = 0; i < 2; i += 1) {
        await db.query("select public.seed_demo_data($1::jsonb, $2::jsonb)", [
          JSON.stringify(payload.familyMember),
          JSON.stringify(payload.documents),
        ]);
      }
    });

    const demo = await rows<{ title: string; expiry_date: string | null; member: string | null }>(
      `select d.title, d.expiry_date::text, f.full_name as member
       from public.documents d left join public.family_members f on f.id = d.family_member_id
       where d.is_demo order by d.title`,
    );
    expect(demo).toHaveLength(7);
    expect(demo.find((d) => d.title === "RCA automobil")?.expiry_date).toBe("2026-10-15");
    expect(demo.find((d) => d.title === "Abonament internet")?.expiry_date).toBeNull();
    expect(demo.find((d) => d.title === "Verificare anuală detector fum")?.expiry_date).toBe("2026-09-28");
    expect(demo.find((d) => d.title === "Pașaport")?.member).toBe("Ana Popescu");
    expect(await rows("select full_name, relationship from public.family_members")).toEqual([
      { full_name: "Ana Popescu", relationship: "Copil" },
    ]);

    await asUser(ALICE, () => db.query("select public.remove_demo_data()"));
    expect(await rows("select title from public.documents")).toEqual([{ title: "Document real" }]);
    expect(await rows("select id from public.family_members")).toEqual([]);
  });
});

describe("delete_my_data", () => {
  it("șterge doar datele utilizatorului curent", async () => {
    await asUser(ALICE, () => saveDocument(null));
    await asUser(BOB, () => saveDocument(null, documentPayload({ title: "Al lui Bob" })));

    await asUser(ALICE, () => db.query("select public.delete_my_data()"));

    expect(await rows("select title from public.documents")).toEqual([{ title: "Al lui Bob" }]);
    const [{ n }] = await rows<{ n: number }>("select count(*)::int as n from public.reminders where user_id = $1", [
      ALICE,
    ]);
    expect(n).toBe(0);
  });
});

describe("Storage", () => {
  it("bucket-ul este privat și limitat la PDF/JPG/PNG", async () => {
    const [bucket] = await rows(
      "select public, file_size_limit::int as limit, allowed_mime_types from storage.buckets where id = 'documents'",
    );
    expect(bucket).toEqual({
      public: false,
      limit: 10485760,
      allowed_mime_types: ["application/pdf", "image/jpeg", "image/png"],
    });
  });

  it("fiecare utilizator scrie și citește doar în dosarul propriu", async () => {
    await asUser(ALICE, async () => {
      await db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${ALICE}/rca.pdf`]);
      await expect(
        db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${BOB}/rca.pdf`]),
      ).rejects.toThrow(/row-level security/);
    });
    await asUser(BOB, async () => {
      expect(await rows("select name from storage.objects")).toEqual([]);
    });
    await asUser(ALICE, async () => {
      expect(await rows("select name from storage.objects")).toEqual([{ name: `${ALICE}/rca.pdf` }]);
    });
  });
});
