import { rotunjeste } from '@cafenea/shared';
import { insereaza, type Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';
import { inchisPana, sqlSold, STOC } from './solduri';
import { blocheazaStoc, inregistreazaMiscari } from './stoc';

// ---- Recepții (facturi de achiziție, de regulă în Depozitul Central) ----

export interface DateReceptie {
  locatie_id: number;
  furnizor: string;
  nr_factura: string;
  data: string;
  linii: { articol_id: number; cantitate: number; cost_unitar: number }[];
  /** Cheia de idempotență generată de formular la deschidere (vezi migrația 007). */
  cheie?: string | null;
}

export async function creeazaReceptie(db: Db, d: DateReceptie, utilizatorId: number | null, la?: string) {
  if (d.linii.length === 0) throw new EroareUtilizator('Factura nu are linii');
  if (new Set(d.linii.map((l) => l.articol_id)).size !== d.linii.length) {
    throw new EroareUtilizator('Un articol apare de două ori pe factură; comasați liniile');
  }
  return db.tx(async (t) => {
    // Cheia stocului înaintea rândurilor din articole: o finalizare de inventariere (care ține cheia
    // exclusiv și scrie mișcări cu cheie străină spre articole) nu se poate bloca circular cu recepția.
    await blocheazaStoc(t, [d.locatie_id]);
    const total = rotunjeste(d.linii.reduce((s, l) => s + l.cantitate * l.cost_unitar, 0));
    // Cu aceeași cheie (salvare repetată după un răspuns pierdut) se întoarce recepția existentă:
    // stocul și costul mediu au fost deja actualizate de prima salvare. O salvare simultană cu aceeași
    // cheie așteaptă aici confirmarea primeia (indexul unic), apoi o găsește.
    const r = await t.query<{ id: number; creata_la: string }>(
      `INSERT INTO receptii (locatie_id, furnizor, nr_factura, data, total, creata_de, creata_la, cheie)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8)
       ON CONFLICT (cheie) DO NOTHING RETURNING id, creata_la`,
      [d.locatie_id, d.furnizor, d.nr_factura, d.data, total, utilizatorId, la ?? null, d.cheie ?? null],
    );
    if (!r[0]) {
      const existenta = (await t.query<{ id: number; total: number }>('SELECT id, total FROM receptii WHERE cheie = $1', [d.cheie]))[0];
      return { id: existenta.id, total: existenta.total, repetata: true };
    }
    const id = r[0].id;
    await insereaza(t, 'receptii_linii', ['receptie_id', 'articol_id', 'cantitate', 'cost_unitar'], d.linii.map((l) => [id, l.articol_id, l.cantitate, l.cost_unitar]));

    // Cost mediu ponderat pe toată rețeaua: stocul existent la costul vechi + intrarea la costul facturii.
    // Articolele se blochează toate de la început, în ordinea id-ului (două recepții simultane nu intră
    // în impas), cu FOR NO KEY UPDATE: serializează recepțiile pe același articol, dar nu intră în
    // conflict cu verificarea cheii străine din vânzări (FOR KEY SHARE). Cu FOR UPDATE, luat rând cu
    // rând, o recepție bloca sincronizarea tuturor tabletelor și putea intra în impas cu o vânzare
    // care atingea aceleași articole în altă ordine.
    const ids = d.linii.map((l) => l.articol_id);
    const articole = new Map(
      (await t.query<{ id: number; cost_mediu: number }>('SELECT id, cost_mediu FROM articole WHERE id = ANY($1::int[]) ORDER BY id FOR NO KEY UPDATE', [ids])).map((a) => [a.id, a]),
    );
    // Stocul din toată rețeaua, pentru toate liniile într-o singură interogare (sold închis + coadă).
    const stocuri = new Map(
      (
        await t.query<{ articol_id: number; s: number }>(
          `SELECT articol_id, SUM(sold)::numeric AS s FROM ${sqlSold(STOC, { n: '$2::bigint', dupa: '= ANY($1::int[])' })} x GROUP BY articol_id`,
          [ids, await inchisPana(t, STOC)],
        )
      ).map((x) => [x.articol_id, x.s]),
    );
    for (const l of d.linii) {
      const a = articole.get(l.articol_id);
      if (!a) throw new EroareNegasit(`Articolul ${l.articol_id}`);
      const stoc = Math.max(0, stocuri.get(l.articol_id) ?? 0);
      const nou = (stoc * a.cost_mediu + l.cantitate * l.cost_unitar) / (stoc + l.cantitate);
      await t.query('UPDATE articole SET cost_mediu = $2 WHERE id = $1', [l.articol_id, rotunjeste(nou, 6)]);
    }
    await inregistreazaMiscari(
      t,
      d.linii.map((l) => ({
        locatie_id: d.locatie_id,
        articol_id: l.articol_id,
        cantitate: l.cantitate,
        tip: 'receptie',
        document_tip: 'receptie',
        document_id: id,
        cost_unitar: l.cost_unitar,
        creata_la: r[0].creata_la,
      })),
    );
    return { id, total, repetata: false };
  });
}

export async function listaReceptii(db: Db, locatieId?: number) {
  return db.query(
    `SELECT r.*, l.nume AS locatie, u.nume AS creata_de_nume,
            (SELECT COUNT(*) FROM receptii_linii rl WHERE rl.receptie_id = r.id) AS nr_linii
       FROM receptii r JOIN locatii l ON l.id = r.locatie_id LEFT JOIN utilizatori u ON u.id = r.creata_de
      WHERE ($1::int IS NULL OR r.locatie_id = $1)
      ORDER BY r.data DESC, r.id DESC LIMIT 300`,
    [locatieId ?? null],
  );
}

export async function detaliuReceptie(db: Db, id: number) {
  const r = (await db.query('SELECT r.*, l.nume AS locatie FROM receptii r JOIN locatii l ON l.id = r.locatie_id WHERE r.id = $1', [id]))[0];
  if (!r) throw new EroareNegasit('Recepția');
  const linii = await db.query(
    `SELECT rl.*, a.nume, a.um FROM receptii_linii rl JOIN articole a ON a.id = rl.articol_id WHERE rl.receptie_id = $1 ORDER BY a.nume`,
    [id],
  );
  return { ...r, linii };
}

// ---- Transferuri interne ----

export interface DateTransfer {
  din_locatie_id: number;
  in_locatie_id: number;
  observatii?: string | null;
  linii: { articol_id: number; cantitate: number }[];
  /** Cheia de idempotență generată de formular la deschidere (vezi migrația 007). */
  cheie?: string | null;
}

/** Ieșire din gestiunea sursă și intrare în destinație, în aceeași tranzacție. */
export async function creeazaTransfer(db: Db, d: DateTransfer, utilizatorId: number | null, la?: string) {
  if (d.din_locatie_id === d.in_locatie_id) throw new EroareUtilizator('Sursa și destinația trebuie să fie diferite');
  if (d.linii.length === 0) throw new EroareUtilizator('Transferul nu are linii');
  if (new Set(d.linii.map((l) => l.articol_id)).size !== d.linii.length) throw new EroareUtilizator('Un articol apare de două ori');
  return db.tx(async (t) => {
    const loc = await t.query('SELECT id FROM locatii WHERE id = ANY($1::int[])', [[d.din_locatie_id, d.in_locatie_id]]);
    if (loc.length !== 2) throw new EroareNegasit('Locația');
    const ids = d.linii.map((l) => l.articol_id);
    const info = await t.query<{ id: number; nume: string; cost_mediu: number; stoc: number }>(
      `SELECT a.id, a.nume, a.cost_mediu,
              COALESCE(s.sold, 0)::numeric AS stoc
         FROM articole a
         LEFT JOIN ${sqlSold(STOC, { n: '$3::bigint', locatie: '$2::int', dupa: '= ANY($1::int[])' })} s ON s.articol_id = a.id
        WHERE a.id = ANY($1::int[])`,
      [ids, d.din_locatie_id, await inchisPana(t, STOC)],
    );
    const harta = new Map(info.map((a) => [a.id, a]));
    const avertismente: string[] = [];
    for (const l of d.linii) {
      const a = harta.get(l.articol_id);
      if (!a) throw new EroareNegasit(`Articolul ${l.articol_id}`);
      if (a.stoc < l.cantitate) avertismente.push(`${a.nume}: în sursă sunt doar ${a.stoc}, se transferă ${l.cantitate}`);
    }
    // Aceeași cheie: transferul există deja (salvare repetată), nu se mai mută nimic.
    const r = await t.query<{ id: number; creat_la: string }>(
      `INSERT INTO transferuri (din_locatie_id, in_locatie_id, observatii, creat_de, creat_la, cheie)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6)
       ON CONFLICT (cheie) DO NOTHING RETURNING id, creat_la`,
      [d.din_locatie_id, d.in_locatie_id, d.observatii ?? null, utilizatorId, la ?? null, d.cheie ?? null],
    );
    if (!r[0]) {
      const existent = (await t.query<{ id: number }>('SELECT id FROM transferuri WHERE cheie = $1', [d.cheie]))[0];
      return { id: existent.id, avertismente: [] as string[], repetat: true };
    }
    const id = r[0].id;
    await insereaza(t, 'transferuri_linii', ['transfer_id', 'articol_id', 'cantitate'], d.linii.map((l) => [id, l.articol_id, l.cantitate]));
    await inregistreazaMiscari(
      t,
      d.linii.flatMap((l) => {
        const cost = harta.get(l.articol_id)!.cost_mediu;
        const baza = { articol_id: l.articol_id, document_tip: 'transfer', document_id: id, cost_unitar: cost, creata_la: r[0].creat_la };
        return [
          { ...baza, locatie_id: d.din_locatie_id, cantitate: -l.cantitate, tip: 'transfer_iesire' as const },
          { ...baza, locatie_id: d.in_locatie_id, cantitate: l.cantitate, tip: 'transfer_intrare' as const },
        ];
      }),
    );
    return { id, avertismente, repetat: false };
  });
}

export async function listaTransferuri(db: Db, locatieId?: number) {
  const transferuri = await db.query<any>(
    `SELECT t.*, ld.nume AS din_locatie, li.nume AS in_locatie, u.nume AS creat_de_nume
       FROM transferuri t
       JOIN locatii ld ON ld.id = t.din_locatie_id JOIN locatii li ON li.id = t.in_locatie_id
       LEFT JOIN utilizatori u ON u.id = t.creat_de
      WHERE ($1::int IS NULL OR t.din_locatie_id = $1 OR t.in_locatie_id = $1)
      ORDER BY t.creat_la DESC LIMIT 300`,
    [locatieId ?? null],
  );
  if (!transferuri.length) return [];
  const linii = await db.query<any>(
    `SELECT tl.*, a.nume, a.um FROM transferuri_linii tl JOIN articole a ON a.id = tl.articol_id
      WHERE tl.transfer_id = ANY($1::int[]) ORDER BY a.nume`,
    [transferuri.map((t) => t.id)],
  );
  return transferuri.map((t) => ({ ...t, linii: linii.filter((l) => l.transfer_id === t.id) }));
}
