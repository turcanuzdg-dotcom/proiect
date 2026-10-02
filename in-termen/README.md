# În Termen

> Fotografiază sau încarcă un act. Aplicația îți spune ce expiră și când trebuie să acționezi.

Asistent administrativ personal, privat, în limba română: păstrează documentele (acte personale, mașină, asigurări,
garanții, facturi, sănătate, familie), calculează statusul fiecărui termen și creează remindere înainte de expirare.

Aplicația **nu verifică statutul oficial** al documentelor și nu face afirmații juridice, financiare sau medicale;
afișează doar termenele introduse de utilizator („Verifică termenul”).

## Cuprins

1. [Tehnologii](#tehnologii)
2. [Arhitectură](#arhitectură)
3. [Cerințe](#cerințe)
4. [Configurarea Supabase](#configurarea-supabase)
5. [Variabile de mediu](#variabile-de-mediu)
6. [Migrări](#migrări)
7. [Bucket-ul de Storage](#bucket-ul-de-storage)
8. [Dezvoltare locală](#dezvoltare-locală)
9. [Teste](#teste)
10. [Date demonstrative](#date-demonstrative)
11. [Producție](#producție)
12. [OCR](#ocr)
13. [E-mail și cron](#e-mail-și-cron)
14. [Ce este implementat și ce este intenționat schițat](#ce-este-implementat-și-ce-este-intenționat-schițat)

## Tehnologii

Next.js 16 (App Router, Turbopack, `proxy.ts`) · React 19 · TypeScript strict · Tailwind CSS 4 · componente în stil
shadcn/ui peste Radix · Lucide · Supabase (Auth, Postgres, Storage) · Zod 4 · React Hook Form · date-fns 4 +
`@date-fns/tz` · Sonner · Vitest + PGlite.

Recharts nu a fost folosit: modulul „Situația ta” este o bară de distribuție simplă, accesibilă, fără bibliotecă.

## Arhitectură

```
app/
  page.tsx                    pagina de prezentare
  (auth)/                     login, signup, forgot-password, reset-password
  auth/callback/route.ts      linkurile din e-mailurile Supabase (PKCE și token_hash)
  onboarding/                 3 pași după înregistrare
  (app)/                      zona protejată (layout cu bara laterală / navigarea de jos)
    dashboard/  documents/  documents/new/  documents/[id]/  documents/[id]/edit/
    reminders/  family/  settings/
  api/export/                 export JSON/CSV
  api/ocr/                    OCR (beta, cu acord explicit)
  api/cron/reminders/         job zilnic (amânări, e-mailuri)
components/                   ui/ (primitive), layout/, dashboard/, documents/, reminders/, family/, settings/, auth/
lib/
  actions/                    Server Actions (validare Zod pe server, mesaje în română)
  data/                       interogări pentru Server Components
  reminders/schedule.ts       generarea, gruparea și amânarea reminderelor
  utils/                      date, status, fișiere, sume, CSV
  validations/                scheme Zod comune client/server
  supabase/                   clienți browser / server / admin + reîmprospătarea sesiunii
  ocr/  email/  rate-limit.ts  demo.ts
proxy.ts                      protejează rutele și reîmprospătează sesiunea
supabase/migrations/          schema, RLS, Storage, funcții RPC
tests/                        teste unitare + testele SQL (PGlite)
```

Principii:

- **Toate citirile și scrierile trec prin RLS.** Serverul folosește sesiunea utilizatorului (cheia „anon” + cookie);
  cheia service-role este folosită doar de jobul de cron, numai pe server.
- **Scrierile compuse sunt tranzacționale.** `save_document`, `renew_document`, `seed_demo_data` și `delete_my_data`
  sunt funcții Postgres (security invoker, deci tot sub RLS): documentul, preferințele, reminderele, reînnoirea și
  jurnalul se scriu împreună sau deloc.
- **Logica de termene este în TypeScript, testată.** Statusul, zilele rămase și reminderele se calculează în
  `lib/`, în fusul orar al utilizatorului (implicit `Europe/Chisinau`), apoi se trimit ca JSON funcțiilor SQL.
- **Fișierele nu trec prin server.** Serverul validează tipul și dimensiunea, emite un URL semnat de încărcare în
  dosarul `<user_id>/`, iar browserul încarcă direct în Storage (cu progres). Afișarea folosește URL-uri semnate de
  5 minute, generate pe server.

Reguli de status: `expired` (înainte de astăzi), `urgent` (astăzi – 7 zile), `upcoming` (8–30 de zile), `safe` (peste
30), `no_expiry` (fără dată). Remindere: praguri 45/30/14/7/1 zile la 09:00 ora locală; pragurile trecute nu se
programează retroactiv, iar în locul lor se adaugă un singur reminder „de recuperare” astăzi.

## Cerințe

- Node.js 20.9+ (testat cu Node 22) și npm
- Un proiect Supabase (cloud) **sau** Docker pentru Supabase local (`npx supabase start`)

## Configurarea Supabase

### Varianta A — proiect Supabase cloud

1. Creează un proiect pe [supabase.com](https://supabase.com).
2. **Project Settings → API**: copiază `Project URL`, cheia `anon` (publică) și cheia `service_role` (secretă).
3. **Authentication → URL Configuration**:
   - _Site URL_: adresa aplicației (de ex. `http://localhost:3000` local, `https://in-termen.md` în producție);
   - _Redirect URLs_: adaugă `http://localhost:3000/auth/callback` și `https://<domeniul-tău>/auth/callback`.
4. **Authentication → Providers → Email**: lasă activ „Confirm email” (recomandat). Parola minimă: 8 caractere.
5. Aplică migrările (vezi [Migrări](#migrări)). Ele creează și bucket-ul privat `documents`.
6. (Opțional) **Authentication → Email Templates**: traduce șabloanele în română. Linkurile implicite
   (`{{ .ConfirmationURL }}`) funcționează cu `/auth/callback`.

### Varianta B — Supabase local (Docker)

```bash
npm install
npx supabase start          # pornește Postgres, Auth, REST, Storage și aplică migrările
npx supabase status         # afișează API URL, anon key, service_role key
```

`supabase/config.toml` este pregătit pentru `http://localhost:3000` (callback inclus, parolă minimă 8, confirmarea
e-mailului dezactivată local). E-mailurile de test apar în Mailpit: `http://127.0.0.1:54324`.

## Variabile de mediu

Copiază `.env.example` în `.env.local`:

| Variabilă                               | Unde            | Obligatorie | Rol                                       |
| --------------------------------------- | --------------- | ----------- | ----------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`              | client + server | da          | URL-ul proiectului Supabase               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`         | client + server | da          | cheia publică; accesul e limitat de RLS   |
| `NEXT_PUBLIC_SITE_URL`                  | client + server | da          | adresa aplicației (linkuri din e-mailuri) |
| `NEXT_PUBLIC_MAX_UPLOAD_MB`             | client + server | nu (10)     | limita unui fișier; ≤ limita bucket-ului  |
| `SUPABASE_SERVICE_ROLE_KEY`             | doar server     | pentru cron | ocolește RLS; nu o expune niciodată       |
| `CRON_SECRET`                           | doar server     | pentru cron | protejează `/api/cron/reminders`          |
| `RESEND_API_KEY`, `EMAIL_FROM`          | doar server     | nu          | activează reminderele prin e-mail         |
| `OCR_PROVIDER`, `GOOGLE_VISION_API_KEY` | doar server     | nu          | activează OCR real (`google_vision`)      |

Variabilele fără prefixul `NEXT_PUBLIC_` sunt citite doar în `lib/server-config.ts` (marcat `server-only`).

## Migrări

| Fișier                         | Conținut                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `20261002000001_schema.sql`    | tabele, constrângeri (categorie, status, canal, monedă, căi de fișier), indecși, trigger pentru profil |
| `20261002000002_rls.sql`       | RLS pe toate tabelele; acces doar la `user_id = auth.uid()`, legături verificate                       |
| `20261002000003_storage.sql`   | bucket privat `documents` (10 MB, PDF/JPG/PNG) + politici pe dosarul utilizatorului                    |
| `20261002000004_functions.sql` | `save_document`, `renew_document`, `seed_demo_data`, `remove_demo_data`, `delete_my_data`              |

Aplicare:

```bash
# Cloud
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push

# Local
npx supabase db reset       # recreează baza și aplică toate migrările
```

Fără CLI: rulează fișierele, în ordine, în **SQL Editor**.

Tipurile TypeScript sunt în `types/database.ts`, în formatul generat de Supabase. După o migrare nouă, compară cu
`npx supabase gen types typescript --local` și actualizează fișierul (parametrii RPC care acceptă `null` sunt marcați
explicit).

## Bucket-ul de Storage

Migrarea `20261002000003_storage.sql` creează automat bucket-ul. Dacă îl creezi manual:

- nume `documents`, **Public: dezactivat**;
- limită 10 MB; tipuri permise `application/pdf`, `image/jpeg`, `image/png`;
- politicile din migrare (SELECT/INSERT/UPDATE/DELETE pentru `authenticated`, doar dacă primul segment al căii este
  `auth.uid()`).

Fișierele se salvează la `<user_id>/<uuid>-<nume-curățat>.<ext>`. Baza de date verifică și ea că `file_path` începe
cu `user_id`.

## Dezvoltare locală

```bash
cd in-termen
npm install
cp .env.example .env.local      # completează valorile
npx supabase start              # sau folosește un proiect cloud
npm run dev                     # http://localhost:3000
```

Alte comenzi:

```bash
npm run typecheck   # next typegen + tsc
npm run lint        # ESLint
npm test            # Vitest (unitare + SQL)
npm run build       # build de producție
```

## Teste

- `tests/dates.test.ts`, `status.test.ts`, `reminders.test.ts`, `files.test.ts` — utilitarele de date (fus orar,
  ora de vară/iarnă, ani bisecți, acordul „zile / de zile”), statusuri și praguri, generarea și gruparea reminderelor,
  validarea fișierelor, sume, CSV, extragerea datelor din text.
- `tests/db.test.ts` — aplică migrările pe PostgreSQL în memorie (PGlite) cu stub-uri pentru `auth`/`storage`
  (`tests/fixtures/supabase-stubs.sql`) și verifică: crearea profilului, tranzacțiile `save_document` (inclusiv
  anularea la eroare), izolarea RLS între doi utilizatori, reînnoirea, datele demonstrative, `delete_my_data` și
  politicile Storage.

## Date demonstrative

Toate sunt **fictive** și marcate `is_demo = true`:

- **Din aplicație:** panoul gol → „Vezi cum funcționează cu date demonstrative”, ultimul pas din onboarding sau
  Setări → „Adaugă date demonstrative”. Ștergerea: bannerul de pe panou sau Setări.
- **Din SQL (dezvoltare):** `supabase/seed/demo_data.sql` pentru un utilizator existent:
  `psql "$DATABASE_URL" -v email="'tu@exemplu.md'" -f supabase/seed/demo_data.sql`

Conținut: RCA automobil (12 zile), Pașaport (95 de zile, asociat cu „Ana Popescu”, Copil), Revizie tehnică automobil
(6 zile), Garanție frigider (240 de zile), Abonament internet (fără termen, sumă recurentă), Carte de identitate (480 de
zile), Verificare anuală detector fum (expirat de 5 zile).

## Producție

- **Vercel** (recomandat): importă directorul `in-termen`, setează variabilele de mediu, inclusiv `CRON_SECRET`.
  `vercel.json` programează `/api/cron/reminders` zilnic la 05:00 UTC (08:00 la Chișinău vara); Vercel trimite
  automat `Authorization: Bearer $CRON_SECRET`.
- Setează `NEXT_PUBLIC_SITE_URL` și adaugă `https://<domeniu>/auth/callback` în Redirect URLs.
- Activează confirmarea e-mailului și un SMTP propriu în Supabase (cel implicit are limite mici).
- **Limitarea de rată** (`lib/rate-limit.ts`) ține contoarele în memoria procesului: pe mai multe instanțe înlocuiește-o
  cu un depozit comun (de ex. Upstash Redis), păstrând semnătura. Supabase Auth are și limitele lui.
- Fișierele încărcate dar nesalvate (formular abandonat) pot rămâne în Storage; aplicația le șterge când utilizatorul
  le înlocuiește sau renunță la reînnoire. Pentru restul, un job periodic poate șterge obiectele din `documents` care nu
  apar în `documents.file_path` sau `renewals.previous_file_path` și sunt mai vechi de 24 de ore.
- Antetele de securitate (CSP etc.) se pot adăuga în `next.config.ts`; aplicația nu folosește scripturi externe.

## OCR

„Extrage date din document (beta)” este **transparent**:

- **fără furnizor configurat** (implicit), butonul arată o simulare construită din datele introduse de utilizator,
  etichetată „Funcție demonstrativă — verifică manual datele extrase.”, iar fișierul nu este trimis nicăieri;
- **cu furnizor** (`OCR_PROVIDER=google_vision` + `GOOGLE_VISION_API_KEY`), utilizatorul vede o notă de
  confidențialitate și trebuie să bifeze acordul; abia apoi `POST /api/ocr` descarcă fișierul propriu din Storage și îl
  trimite furnizorului. Data sugerată (`lib/ocr/extract-dates.ts`) trebuie confirmată manual.

Pentru alt furnizor (AWS Textract, Azure, Tesseract pe server), adaugă o implementare `OcrProvider` în
`lib/ocr/index.ts`.

## E-mail și cron

- Reminderele **în aplicație** nu au nevoie de job: se creează la salvarea documentului și apar în clopoțel când le vine
  momentul (cu numărul celor necitite).
- **E-mailul este opțional și dezactivat implicit.** Fără `RESEND_API_KEY` + `EMAIL_FROM`, interfața afișează
  „Notificările prin e-mail nu sunt configurate încă.”, iar comutatorul este blocat.
- Cu e-mail configurat și activat de utilizator, reminderele noi primesc canalul `email`; `GET /api/cron/reminders`
  (cu `Authorization: Bearer $CRON_SECRET`) reactivează amânările expirate și trimite e-mailurile scadente, marcând
  `emailed_at`. Pentru alt furnizor, înlocuiește `sendEmail` din `lib/email/index.ts`.

Test local:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

## Ce este implementat și ce este intenționat schițat

**Complet:** autentificare (cont nou, login, logout, parolă uitată/resetare, rute protejate, meniu de profil),
onboarding, dashboard, documente (căutare, filtre, sortare, grilă/listă, detalii, editare, ștergere cu confirmare),
formularul în 5 pași cu încărcare privată și progres, reînnoire cu istoric și fișier nou, remindere (grupare, finalizare,
amânare 1/3/7 zile sau dată aleasă, remindere manuale, clopoțel cu necitite), familie, setări (profil, preferințe,
notificări, ștergerea tuturor datelor, export JSON/CSV, date demo), RLS și politici Storage, teste.

**Intenționat schițat:** OCR real (interfață + Google Vision, neactivat implicit), trimiterea e-mailurilor (Resend,
neactivată implicit), limitarea de rată în memorie, invitații și acces partajat pentru familie (în afara MVP), alte
limbi decât româna, curățarea automată a fișierelor orfane.
