import { z } from 'zod';
import { MOTIVE_CASARE, type EvenimentPOS, type RaspunsSync } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';
import { magistrala, type Notificare } from '../magistrala';
import { catalogPOS } from './catalog';
import { deschideTura, inchideTura, plataMarunta } from './ture';
import { anuleazaComanda, inregistreazaComanda, type ContextPOS } from './vanzari';

const id = z.string().uuid();
const bani = z.number().finite().min(0).max(1_000_000);

const linie = z.object({
  produs_id: z.number().int().positive(),
  cantitate: z.number().int().positive().max(1000),
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
      nota: z.string().max(500).nullish(),
      linii: z.array(linie).min(1).max(200),
      total: bani,
      primit: bani.nullish(),
      card_autorizare: z.string().max(100).nullish(),
    }),
  }),
  z.object({
    ...baza,
    tip: z.literal('comanda_anulata'),
    date: z.object({
      comanda_id: id,
      tura_id: id,
      utilizator_id: z.number().int().positive(),
      motiv: z.string().min(1).max(500),
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
      doze: z.number().finite().min(0).max(100_000),
      numerar: bani,
      card: bani,
      anulari: z.number().int().min(0).max(10_000),
      casari: z.number().int().min(0).max(10_000),
      observatii: z.string().max(2000).nullish(),
    }),
  }),
  z.object({
    ...baza,
    tip: z.literal('plata_marunta'),
    date: z.object({
      tura_id: id,
      utilizator_id: z.number().int().positive(),
      suma: bani,
      descriere: z.string().min(1).max(500),
    }),
  }),
]);

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

async function utilizatorValid(db: Db, utilizatorId: number) {
  const r = await db.query('SELECT 1 FROM utilizatori WHERE id = $1', [utilizatorId]);
  if (!r.length) throw new EroareUtilizator(`Utilizatorul ${utilizatorId} nu există`);
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
        await utilizatorValid(t, ev.date.utilizator_id);
        const rez = await aplica(t, ctx, ev);
        await t.query(
          `INSERT INTO evenimente_sync (id, dispozitiv_id, locatie_id, tip, la, stare, payload) VALUES ($1, $2, $3, $4, $5, 'aplicat', $6)`,
          [ev.id, ctx.dispozitiv_id, ctx.locatie_id, ev.tip, ev.la, JSON.stringify(ev)],
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
      await salveazaEroare(db, ctx, ev.id, ev.tip, ev.la, mesaj, ev);
      cu_eroare.push({ id: ev.id, eroare: mesaj });
      notificari.add('sync_eroare');
    }
  }

  if (ctx.dispozitiv_id) await db.query('UPDATE dispozitive SET ultima_sincronizare = now() WHERE id = $1', [ctx.dispozitiv_id]);
  for (const tip of notificari) magistrala.trimite({ tip, locatie_id: ctx.locatie_id });
  const catalog = await catalogPOS(db, ctx.locatie_id);
  return { acceptate, cu_eroare, catalog_versiune: catalog.versiune };
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

async function salveazaEroare(db: Db, ctx: ContextPOS, evId: string, tip: string, la: string | null, eroare: string, payload: unknown) {
  await db.query(
    `INSERT INTO evenimente_sync (id, dispozitiv_id, locatie_id, tip, la, stare, eroare, payload)
     VALUES ($1, $2, $3, $4, $5, 'eroare', $6, $7) ON CONFLICT (id) DO NOTHING`,
    [evId, ctx.dispozitiv_id, ctx.locatie_id, String(tip).slice(0, 50), la, eroare, JSON.stringify(payload)],
  );
}

export function listaEroriSync(db: Db) {
  return db.query(
    `SELECT e.*, d.nume AS dispozitiv, l.nume AS locatie FROM evenimente_sync e
       LEFT JOIN dispozitive d ON d.id = e.dispozitiv_id LEFT JOIN locatii l ON l.id = e.locatie_id
      WHERE e.stare = 'eroare' ORDER BY e.primit_la DESC LIMIT 200`,
  );
}

/** După ce adminul a corectat cauza (de ex. a refăcut un produs șters), reaplică evenimentul. */
export async function reaplicaEveniment(db: Db, evId: string) {
  const e = (await db.query<any>(`SELECT * FROM evenimente_sync WHERE id = $1 AND stare = 'eroare'`, [evId]))[0];
  if (!e) throw new EroareNegasit('Evenimentul cu eroare');
  const valid = schemaEveniment.safeParse(e.payload);
  if (!valid.success) throw new EroareUtilizator('Evenimentul are un format invalid și nu poate fi reaplicat; marcați-l rezolvat');
  const ev = valid.data as EvenimentPOS;
  const ctx: ContextPOS = { locatie_id: e.locatie_id, dispozitiv_id: e.dispozitiv_id };
  try {
    await db.tx(async (t) => {
      await utilizatorValid(t, ev.date.utilizator_id);
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
