import { z } from 'zod';
import { LIMITE, MOTIVE_CASARE, type EvenimentPOS, type RaspunsSync } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';
import { magistrala, type Notificare } from '../magistrala';
import { utilizatorPermisTabletei } from './acces';
import { catalogTableta } from './catalog';
import { deschideTura, inchideTura, plataMarunta } from './ture';
import { anuleazaComanda, inregistreazaComanda, type ContextPOS } from './vanzari';

const id = z.string().uuid();
const bani = z.number().finite().min(0).max(LIMITE.bani);
// Fără NUL: PostgreSQL îl refuză atât în text, cât și în jsonb.
const text = (max: number) => z.string().max(max).regex(/^[^\u0000]*$/, 'caractere invalide');

const linie = z.object({
  produs_id: z.number().int().positive(),
  cantitate: z.number().int().positive().max(LIMITE.cantitate_linie),
  pret_unitar: bani,
  modificatori: z.array(z.object({ id: z.number().int().positive(), pret: bani })).max(20),
});

const baza = { id, la: z.string().datetime({ offset: true }) };

const schemaEveniment = z.discriminatedUnion('tip', [
  z.object({
    ...baza,
    tip: z.literal('comanda'),
    date: z.object({
      comanda_id: id,
      tura_id: id,
      utilizator_id: z.number().int().positive(),
      nr: z.number().int().nonnegative(),
      metoda: z.enum(['numerar', 'card', 'casare']),
      motiv_casare: z.enum(MOTIVE_CASARE).nullish(),
      nota: text(LIMITE.text).nullish(),
      linii: z.array(linie).min(1).max(200),
      total: bani,
      primit: bani.nullish(),
      card_autorizare: text(100).nullish(),
      card_rrn: text(100).nullish(),
      card_operation_id: text(100).nullish(),
    }),
  }),
  z.object({
    ...baza,
    tip: z.literal('comanda_anulata'),
    date: z.object({
      comanda_id: id,
      tura_id: id,
      utilizator_id: z.number().int().positive(),
      motiv: text(LIMITE.text).min(1),
      restituie_stoc: z.boolean(),
    }),
  }),
  z.object({
    ...baza,
    tip: z.literal('tura_deschisa'),
    date: z.object({ tura_id: id, utilizator_id: z.number().int().positive(), fond_initial: bani }),
  }),
  z.object({
    ...baza,
    tip: z.literal('tura_inchisa'),
    date: z.object({
      tura_id: id,
      utilizator_id: z.number().int().positive(),
      doze: z.number().finite().min(0).max(LIMITE.doze),
      numerar: bani,
      card: bani,
      anulari: z.number().int().min(0).max(LIMITE.bucati),
      casari: z.number().int().min(0).max(LIMITE.bucati),
      observatii: text(LIMITE.observatii).nullish(),
    }),
  }),
  z.object({
    ...baza,
    tip: z.literal('plata_marunta'),
    date: z.object({
      tura_id: id,
      utilizator_id: z.number().int().positive(),
      suma: bani,
      descriere: text(LIMITE.text).min(1),
    }),
  }),
]);

/** Cât poate fi ceasul tabletei înaintea serverului (ms). */
export const DECALAJ_VIITOR = 10 * 60_000;
/** Cu cât poate fi un eveniment mai vechi decât cel de dinaintea lui, de pe aceeași tabletă, fără semnalare (ms). */
export const DECALAJ_INAPOI = 5 * 60_000;
/** Payload-ul unui eveniment cu format invalid se păstrează doar până la această mărime (octeți). */
export const LIMITA_PAYLOAD_EROARE = 64 * 1024;

/**
 * Ceasul tabletei: un moment din viitor sau dinaintea asocierii tabletei (ceas resetat după o descărcare
 * completă a bateriei, oră pusă de mână) ar muta vânzări și corecții de casă în ture și perioade străine.
 * Evenimentul e respins în propria tranzacție, deci ajunge la „Erori sincronizare” și coada merge mai
 * departe; adminul îl poate reaplica după ce verifică ora (reaplicarea nu mai trece prin aceste limite).
 * Un ceas dat înapoi față de evenimentul anterior al tabletei nu se respinge, se semnalează.
 * Întoarce dacă ora evenimentului e suspectă.
 */
async function verificaOra(db: Db, ctx: ContextPOS, ev: EvenimentPOS): Promise<boolean> {
  const la = Date.parse(ev.la);
  if (la > Date.now() + DECALAJ_VIITOR) {
    throw new EroareUtilizator('Ceasul tabletei este înaintea serverului; verificați „Data și ora automate”');
  }
  if (!ctx.dispozitiv_id) return false;
  const d = (
    await db.query<{ creat_la: string | Date; ultimul_la: string | Date | null }>(
      'SELECT creat_la, ultimul_la FROM dispozitive WHERE id = $1 FOR UPDATE',
      [ctx.dispozitiv_id],
    )
  )[0];
  if (!d) return false;
  if (la < new Date(d.creat_la).getTime() - 86_400_000) {
    throw new EroareUtilizator('Ora tabletei pare greșită: operațiunea e datată înaintea asocierii tabletei');
  }
  let suspecta = d.ultimul_la != null && la < new Date(d.ultimul_la).getTime() - DECALAJ_INAPOI;
  if (ev.tip === 'tura_deschisa' && !suspecta) {
    // O tură deschisă înaintea ultimei închideri de pe locație: ceasul a fost dat înapoi.
    const r = await db.query<{ ultima: string | Date | null }>('SELECT MAX(inchisa_la) AS ultima FROM ture WHERE locatie_id = $1', [ctx.locatie_id]);
    suspecta = r[0]?.ultima != null && la < new Date(r[0].ultima).getTime() - DECALAJ_INAPOI;
  }
  await db.query('UPDATE dispozitive SET ultimul_la = GREATEST(ultimul_la, $2::timestamptz) WHERE id = $1', [ctx.dispozitiv_id, ev.la]);
  return suspecta;
}

async function aplica(db: Db, ctx: ContextPOS, ev: EvenimentPOS): Promise<Notificare['tip'][]> {
  switch (ev.tip) {
    case 'comanda':
      await inregistreazaComanda(db, ctx, ev.la, ev.date);
      return ['comanda', 'stoc', 'bani'];
    case 'comanda_anulata':
      await anuleazaComanda(db, ctx, ev.la, ev.date);
      return ['comanda', 'stoc', 'bani'];
    case 'tura_deschisa':
      await deschideTura(db, ctx, ev.la, ev.date);
      return ['tura', 'bani'];
    case 'tura_inchisa':
      await inchideTura(db, ctx, ev.la, ev.date);
      return ['tura', 'bani'];
    case 'plata_marunta':
      await plataMarunta(db, ctx, ev.la, ev.date);
      return ['bani'];
  }
}


/**
 * Primește coada offline a unei tablete. Fiecare eveniment se aplică în propria tranzacție,
 * în ordinea în care a fost făcut. Un eveniment deja primit se confirmă fără a fi reaplicat;
 * unul care nu poate fi aplicat se păstrează pentru admin și se confirmă, ca tableta să nu
 * se blocheze și nimic să nu se piardă.
 */
export async function proceseazaSync(db: Db, ctx: ContextPOS, evenimente: unknown[]): Promise<RaspunsSync> {
  const acceptate: string[] = [];
  const cu_eroare: RaspunsSync['cu_eroare'] = [];
  const notificari = new Set<Notificare['tip']>();

  for (const brut of evenimente) {
    const evId = typeof (brut as any)?.id === 'string' ? (brut as any).id : null;
    const valid = schemaEveniment.safeParse(brut);
    if (!valid.success) {
      const eroare = `Format invalid: ${valid.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
      if (evId && id.safeParse(evId).success) {
        await salveazaEroare(db, ctx, evId, (brut as any)?.tip ?? 'necunoscut', null, eroare, brut);
        cu_eroare.push({ id: evId, eroare });
        notificari.add('sync_eroare');
      }
      continue;
    }
    const ev = valid.data as EvenimentPOS;
    const deja = await db.query('SELECT stare FROM evenimente_sync WHERE id = $1', [ev.id]);
    if (deja.length) {
      acceptate.push(ev.id);
      continue;
    }
    try {
      const tipuri = await db.tx(async (t) => {
        // În tranzacția evenimentului: o oră respinsă trece prin eroarePermanenta, nu blochează lotul.
        const oraSuspecta = await verificaOra(t, ctx, ev);
        await utilizatorPermisTabletei(t, ev.date.utilizator_id, ctx.locatie_id, ev.la);
        const rez = await aplica(t, ctx, ev);
        await t.query(
          `INSERT INTO evenimente_sync (id, dispozitiv_id, locatie_id, tip, la, stare, payload, ora_suspecta)
           VALUES ($1, $2, $3, $4, $5, 'aplicat', $6, $7)`,
          [ev.id, ctx.dispozitiv_id, ctx.locatie_id, ev.tip, ev.la, JSON.stringify(ev), oraSuspecta],
        );
        return rez;
      });
      tipuri.forEach((x) => notificari.add(x));
      acceptate.push(ev.id);
    } catch (e) {
      // Aceeași coadă trimisă de două ori în paralel: cealaltă cerere a aplicat-o deja.
      if ((await db.query('SELECT 1 FROM evenimente_sync WHERE id = $1', [ev.id])).length) {
        acceptate.push(ev.id);
        continue;
      }
      if (!eroarePermanenta(e)) throw e;
      const mesaj = (e as Error).message;
      await salveazaEroare(db, ctx, ev.id, ev.tip, ev.la, mesaj, ev, true);
      cu_eroare.push({ id: ev.id, eroare: mesaj });
      notificari.add('sync_eroare');
    }
  }

  // Semnul de viață al tabletei: o scriere pe minut ajunge (panoul alertează după o oră fără sincronizare).
  if (ctx.dispozitiv_id) {
    await db.query(
      `UPDATE dispozitive SET ultima_sincronizare = now()
        WHERE id = $1 AND (ultima_sincronizare IS NULL OR ultima_sincronizare < now() - interval '1 minute')`,
      [ctx.dispozitiv_id],
    );
  }
  for (const tip of notificari) magistrala.trimite({ tip, locatie_id: ctx.locatie_id });
  const catalog = await catalogTableta(db, ctx.locatie_id, ctx.dispozitiv_id);
  return { acceptate, cu_eroare, catalog_versiune: catalog.versiune, ora_server: new Date().toISOString() };
}

/**
 * Date greșite (clasele SQLSTATE 22 și 23) nu se repară la o nouă încercare: evenimentul
 * se pune deoparte. Orice altă eroare (baza căzută) face tableta să reîncerce mai târziu.
 */
function eroarePermanenta(e: unknown): boolean {
  if (e instanceof EroareUtilizator) return true;
  const cod = (e as { code?: unknown })?.code;
  return typeof cod === 'string' && /^2[23]/.test(cod);
}

/**
 * Evenimentul respins se păstrează orice ar conține: altfel ar bloca pentru totdeauna coada tabletei.
 * Un eveniment cu format valid se păstrează întreg (schema îi limitează mărimea, iar reaplicarea are
 * nevoie de el). Unul cu format invalid nu se poate reaplica: peste LIMITA_PAYLOAD_EROARE rămâne doar
 * o fișă {id, tip, trunchiat, octeti}, ca o tabletă stricată sau un token furat să nu umple discul.
 */
async function salveazaEroare(db: Db, ctx: ContextPOS, evId: string, tip: string, la: string | null, eroare: string, payload: unknown, formatValid = false) {
  const curat = (s: string) => s.replace(/\u0000/g, '');
  const insereaza = (p: string, e: string) =>
    db.query(
      `INSERT INTO evenimente_sync (id, dispozitiv_id, locatie_id, tip, la, stare, eroare, payload)
       VALUES ($1, $2, $3, $4, $5, 'eroare', $6, $7) ON CONFLICT (id) DO NOTHING`,
      [evId, ctx.dispozitiv_id, ctx.locatie_id, curat(String(tip)).slice(0, 50), la, curat(e), p],
    );
  let continut = JSON.stringify(payload).replace(/\\u0000/g, '');
  const octeti = new TextEncoder().encode(continut).length;
  if (!formatValid && octeti > LIMITA_PAYLOAD_EROARE) continut = JSON.stringify({ id: evId, tip: curat(String(tip)).slice(0, 50), trunchiat: true, octeti });
  try {
    await insereaza(continut, eroare);
  } catch (e) {
    await insereaza(JSON.stringify({ id: evId, tip, nesalvabil: true }), `${eroare} (conținutul nu a putut fi păstrat: ${(e as Error).message})`);
  }
}

const COLOANE_EROARE = `e.id, e.dispozitiv_id, e.locatie_id, e.tip, e.la, e.primit_la, e.stare, e.eroare,
       (e.payload->>'trunchiat') IS NOT DISTINCT FROM 'true' AS trunchiat, d.nume AS dispozitiv, l.nume AS locatie`;

/**
 * Lista erorilor, fără conținutul evenimentelor (îl dă detaliuEroareSync), în ordinea în care au fost
 * făcute pe tabletă: „Reaplică” de sus în jos reface ordinea reală (deschiderea turei înaintea vânzărilor
 * și a închiderii), deci o diferență de casă nu se numără de două ori.
 */
export function listaEroriSync(db: Db) {
  return db.query(
    `SELECT ${COLOANE_EROARE} FROM evenimente_sync e
       LEFT JOIN dispozitive d ON d.id = e.dispozitiv_id LEFT JOIN locatii l ON l.id = e.locatie_id
      WHERE e.stare = 'eroare' ORDER BY e.la ASC NULLS LAST, e.primit_la ASC LIMIT 200`,
  );
}

export async function detaliuEroareSync(db: Db, evId: string) {
  const r = await db.query(
    `SELECT ${COLOANE_EROARE}, e.payload FROM evenimente_sync e
       LEFT JOIN dispozitive d ON d.id = e.dispozitiv_id LEFT JOIN locatii l ON l.id = e.locatie_id
      WHERE e.id = $1`,
    [evId],
  );
  if (!r[0]) throw new EroareNegasit('Evenimentul');
  return r[0];
}

/**
 * După ce adminul a corectat cauza (de ex. a refăcut un produs șters), reaplică evenimentul.
 * Decizia e a adminului: limitele de oră ale tabletei (verificaOra) nu se mai aplică.
 */
export async function reaplicaEveniment(db: Db, evId: string) {
  const e = (await db.query<any>(`SELECT * FROM evenimente_sync WHERE id = $1 AND stare = 'eroare'`, [evId]))[0];
  if (!e) throw new EroareNegasit('Evenimentul cu eroare');
  const valid = schemaEveniment.safeParse(e.payload);
  if (!valid.success) throw new EroareUtilizator('Evenimentul are un format invalid și nu poate fi reaplicat; marcați-l rezolvat');
  const ev = valid.data as EvenimentPOS;
  const ctx: ContextPOS = { locatie_id: e.locatie_id, dispozitiv_id: e.dispozitiv_id };
  try {
    await db.tx(async (t) => {
      // Două apăsări pe „Reaplică” în același timp: a doua așteaptă și găsește evenimentul aplicat.
      const stare = (await t.query<{ stare: string }>('SELECT stare FROM evenimente_sync WHERE id = $1 FOR UPDATE', [evId]))[0];
      if (stare?.stare !== 'eroare') throw new EroareUtilizator('Evenimentul a fost deja aplicat sau rezolvat');
      await utilizatorPermisTabletei(t, ev.date.utilizator_id, ctx.locatie_id, ev.la);
      await aplica(t, ctx, ev);
      await t.query(`UPDATE evenimente_sync SET stare = 'aplicat', eroare = NULL WHERE id = $1`, [evId]);
    });
  } catch (err) {
    if (eroarePermanenta(err)) {
      await db.query('UPDATE evenimente_sync SET eroare = $2 WHERE id = $1', [evId, (err as Error).message]);
      if (!(err instanceof EroareUtilizator)) throw new EroareUtilizator(`Evenimentul tot nu poate fi aplicat: ${(err as Error).message}`);
    }
    throw err;
  }
  for (const tip of ['comanda', 'stoc', 'bani', 'tura'] as const) magistrala.trimite({ tip, locatie_id: ctx.locatie_id });
}

export async function marcheazaRezolvat(db: Db, evId: string) {
  const r = await db.query(`UPDATE evenimente_sync SET stare = 'rezolvat' WHERE id = $1 AND stare = 'eroare' RETURNING id`, [evId]);
  if (!r.length) throw new EroareNegasit('Evenimentul cu eroare');
}
