import {
  adunaConsum,
  consumLinie,
  costConsum,
  rotunjeste,
  totalComanda,
  totalLinie,
  type DateAnulare,
  type DateComanda,
  type DefinitieModificator,
} from '@cafenea/shared';
import { insereaza, type Db } from '../db';
import { EroareUtilizator } from '../erori';
import { incarcaDefinitii } from './catalog';
import { costuriMedii, inregistreazaMiscari } from './stoc';
import { actualizeazaTuraInchisa, asiguraTura, blocheazaCasa, corecteazaNumarariUlterioare, momentContabil, type ContextPOS } from './ture';

export { asiguraTura, type ContextPOS } from './ture';

/** O vânzare sau o casare: salvează comanda, scade ingredientele din rețetar, înregistrează banii. */
export async function inregistreazaComanda(db: Db, ctx: ContextPOS, la: string, d: DateComanda): Promise<void> {
  if (d.linii.length === 0) throw new EroareUtilizator('Comanda nu are produse');
  if (d.metoda === 'casare' && !d.motiv_casare) throw new EroareUtilizator('Casarea are nevoie de un motiv');

  const casare = d.metoda === 'casare';
  // Tableta calculează totalul cu aceeași funcție (totalComanda), din aceleași linii: o diferență
  // înseamnă date alterate, nu o vânzare reală. Evenimentul ajunge la „Erori sincronizare”.
  const asteptat = totalComanda(d.linii);
  if (!casare && Math.abs(rotunjeste(d.total) - asteptat) > 0.005) {
    throw new EroareUtilizator(`Totalul comenzii (${rotunjeste(d.total)}) nu corespunde liniilor (${asteptat})`);
  }

  const exista = await db.query('SELECT 1 FROM comenzi WHERE id = $1', [d.comanda_id]);
  if (exista.length) return;

  // Vânzarea schimbă cifrele turei (numerar, card, doze): o numărare în curs pe locație se termină întâi.
  await blocheazaCasa(db, ctx.locatie_id);
  await asiguraTura(db, ctx, d.tura_id, la, d.utilizator_id);

  const produseIds = [...new Set(d.linii.map((l) => l.produs_id))];
  const modIds = [...new Set(d.linii.flatMap((l) => l.modificatori.map((m) => m.id)))];
  const { produse, modificatori, permise } = await incarcaDefinitii(db, produseIds, modIds);
  const costuri = await costuriMedii(db);

  const consumTotal = new Map<number, number>();
  let doze = 0;
  // Prețul trimis diferă de catalogul de acum: legitim offline după o schimbare de preț, deci se
  // acceptă, dar comanda se marchează pentru admin.
  let pretAbatere = false;
  const randuriLinii: unknown[][] = [];
  for (const l of d.linii) {
    const p = produse.get(l.produs_id);
    if (!p) throw new EroareUtilizator(`Produsul ${l.produs_id} nu există în rețetar`);
    // Tableta alege modificatorii ca mulțime, doar dintre cei ai produsului; altfel consumul s-ar
    // putea umfla (de ex. același sirop de 20 de ori pe o linie) ca să acopere o lipsă la inventar.
    if (new Set(l.modificatori.map((m) => m.id)).size !== l.modificatori.length) {
      throw new EroareUtilizator(`Modificator repetat pe aceeași linie (${p.nume})`);
    }
    const mods: DefinitieModificator[] = [];
    for (const m of l.modificatori) {
      const def = modificatori.get(m.id);
      if (!def) throw new EroareUtilizator(`Modificatorul ${m.id} nu există`);
      if (!permise.has(`${l.produs_id}:${m.id}`)) throw new EroareUtilizator(`Modificatorul „${def.nume}” nu este permis pentru ${p.nume}`);
      if (rotunjeste(m.pret) !== rotunjeste(def.pret)) pretAbatere = true;
      mods.push(def);
    }
    if (rotunjeste(l.pret_unitar) !== rotunjeste(p.pret)) pretAbatere = true;
    const consum = consumLinie(p.reteta, mods, l.cantitate);
    adunaConsum(consumTotal, consum);
    doze += l.cantitate * (p.doze_cafea + mods.reduce((s, m) => s + m.doze_cafea, 0));
    randuriLinii.push([
      d.comanda_id,
      l.produs_id,
      l.cantitate,
      l.pret_unitar,
      JSON.stringify(l.modificatori.map((m) => ({ id: m.id, nume: modificatori.get(m.id)!.nume, pret: m.pret, pret_catalog: modificatori.get(m.id)!.pret }))),
      totalLinie(l),
      costConsum(consum, costuri),
      p.pret,
    ]);
  }

  const total = casare ? 0 : rotunjeste(d.total);
  const primit = d.metoda === 'numerar' && d.primit != null ? rotunjeste(d.primit) : null;

  await db.query(
    `INSERT INTO comenzi (id, locatie_id, tura_id, dispozitiv_id, utilizator_id, nr, creata_la, metoda,
                          motiv_casare, nota, total, primit, rest, card_autorizare, doze_cafea, card_rrn, card_operation_id, pret_abatere)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      d.comanda_id, ctx.locatie_id, d.tura_id, ctx.dispozitiv_id, d.utilizator_id, d.nr, la, d.metoda,
      casare ? d.motiv_casare : null, d.nota ?? null, total, primit,
      primit != null ? rotunjeste(primit - total) : null, d.card_autorizare ?? null, rotunjeste(doze),
      d.card_rrn ?? null, d.card_operation_id ?? null, pretAbatere,
    ],
  );
  await insereaza(db, 'comenzi_linii', ['comanda_id', 'produs_id', 'cantitate', 'pret_unitar', 'modificatori', 'total', 'cost', 'pret_catalog'], randuriLinii);

  await inregistreazaMiscari(
    db,
    [...consumTotal].map(([articol_id, cant]) => ({
      locatie_id: ctx.locatie_id,
      articol_id,
      cantitate: -cant,
      tip: casare ? 'casare' : 'vanzare',
      document_tip: 'comanda',
      document_id: d.comanda_id,
      cost_unitar: costuri.get(articol_id) ?? 0,
      creata_la: la,
    })),
  );

  if (!casare && total !== 0) {
    // Comanda păstrează ora reală a vânzării; banii intră cel mai devreme la deschiderea turei ei.
    const laContabil = await momentContabil(db, d.tura_id, la);
    await db.query(
      `INSERT INTO miscari_bani (locatie_id, cont, suma, tip, tura_id, document_tip, document_id, utilizator_id, creata_la)
       VALUES ($1, $2, $3, 'incasare', $4, 'comanda', $5, $6, $7)`,
      [ctx.locatie_id, d.metoda, total, d.tura_id, d.comanda_id, d.utilizator_id, laContabil],
    );
    if (d.metoda === 'numerar') await corecteazaNumarariUlterioare(db, ctx.locatie_id, laContabil, total, d.utilizator_id);
  }
  await actualizeazaTuraInchisa(db, d.tura_id);
}

/**
 * Anulare / retur. Banii se restituie din tura curentă. Ingredientele revin în stoc doar dacă
 * produsul nu a fost preparat; altfel rămân consumate și apar în raportul de pierderi.
 */
export async function anuleazaComanda(db: Db, ctx: ContextPOS, la: string, d: DateAnulare): Promise<void> {
  await blocheazaCasa(db, ctx.locatie_id);
  const c = (
    await db.query<{ locatie_id: number; metoda: string; total: number; stare: string; tura_id: string }>(
      'SELECT locatie_id, metoda, total, stare, tura_id FROM comenzi WHERE id = $1 FOR UPDATE',
      [d.comanda_id],
    )
  )[0];
  if (!c) throw new EroareUtilizator('Comanda de anulat nu există pe server');
  if (c.locatie_id !== ctx.locatie_id) throw new EroareUtilizator('Comanda aparține altei locații');
  if (c.stare === 'anulata') return;

  await asiguraTura(db, ctx, d.tura_id, la, d.utilizator_id);
  await db.query(
    `UPDATE comenzi SET stare = 'anulata', anulata_la = $2, anulare_tura_id = $3, motiv_anulare = $4, stoc_restituit = $5
      WHERE id = $1`,
    [d.comanda_id, la, d.tura_id, d.motiv, d.restituie_stoc],
  );

  if (c.metoda !== 'casare' && c.total !== 0) {
    const laContabil = await momentContabil(db, d.tura_id, la);
    await db.query(
      `INSERT INTO miscari_bani (locatie_id, cont, suma, tip, descriere, tura_id, document_tip, document_id, utilizator_id, creata_la)
       VALUES ($1, $2, $3, 'restituire', $4, $5, 'anulare', $6, $7, $8)`,
      [ctx.locatie_id, c.metoda, -c.total, d.motiv, d.tura_id, d.comanda_id, d.utilizator_id, laContabil],
    );
    if (c.metoda === 'numerar') await corecteazaNumarariUlterioare(db, ctx.locatie_id, laContabil, -c.total, d.utilizator_id);
  }

  if (d.restituie_stoc) {
    const miscari = await db.query<{ articol_id: number; cantitate: number; cost_unitar: number }>(
      `SELECT articol_id, cantitate, cost_unitar FROM miscari_stoc WHERE document_tip = 'comanda' AND document_id = $1`,
      [d.comanda_id],
    );
    await inregistreazaMiscari(
      db,
      miscari.map((m) => ({
        locatie_id: ctx.locatie_id,
        articol_id: m.articol_id,
        cantitate: -m.cantitate,
        tip: 'retur',
        document_tip: 'anulare',
        document_id: d.comanda_id,
        cost_unitar: m.cost_unitar,
        creata_la: la,
      })),
    );
  }
  await actualizeazaTuraInchisa(db, d.tura_id);
  if (c.tura_id !== d.tura_id) await actualizeazaTuraInchisa(db, c.tura_id);
}

export interface FiltruComenzi {
  locatie_id?: number;
  tura_id?: string;
  de?: string;
  pana?: string;
  metoda?: string;
  /** Doar comenzile cu prețuri diferite de catalogul de la sincronizare. */
  pret_abatere?: boolean;
  limita?: number;
}

export async function listaComenzi(db: Db, f: FiltruComenzi) {
  const cond: string[] = [];
  const p: unknown[] = [];
  const adauga = (sql: string, v: unknown) => {
    p.push(v);
    cond.push(sql.replace('?', `$${p.length}`));
  };
  if (f.locatie_id) adauga('c.locatie_id = ?', f.locatie_id);
  if (f.tura_id) adauga('c.tura_id = ?', f.tura_id);
  if (f.de) adauga('c.creata_la >= ?', f.de);
  if (f.pana) adauga('c.creata_la < ?', f.pana);
  if (f.metoda) adauga('c.metoda = ?', f.metoda);
  if (f.pret_abatere) cond.push('c.pret_abatere');
  p.push(Math.min(f.limita ?? 200, 1000));
  const comenzi = await db.query<any>(
    `SELECT c.*, u.nume AS barista, l.nume AS locatie
       FROM comenzi c
       LEFT JOIN utilizatori u ON u.id = c.utilizator_id
       JOIN locatii l ON l.id = c.locatie_id
      ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY c.creata_la DESC
      LIMIT $${p.length}`,
    p,
  );
  if (comenzi.length === 0) return [];
  const linii = await db.query<any>(
    `SELECT cl.*, pr.nume AS produs FROM comenzi_linii cl JOIN produse pr ON pr.id = cl.produs_id
      WHERE cl.comanda_id = ANY($1::uuid[]) ORDER BY cl.id`,
    [comenzi.map((c) => c.id)],
  );
  return comenzi.map((c) => ({ ...c, linii: linii.filter((l) => l.comanda_id === c.id) }));
}
