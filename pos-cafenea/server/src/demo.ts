// Date demonstrative: o rețea cu depozit central și două cafenele, rețetar complet
// și (opțional) câteva luni de istoric, ca rapoartele să aibă ce compara.

import { randomUUID } from 'node:crypto';
import { MOTIVE_CASARE, totalComanda, type LinieComanda, type MetodaPlata } from '@cafenea/shared';
import type { Db } from './db';
import * as acces from './servicii/acces';
import * as catalog from './servicii/catalog';
import { creeazaReceptie, creeazaTransfer } from './servicii/gestiune';
import { calculeazaScriptic, deschideTura, inchideTura } from './servicii/ture';
import { anuleazaComanda, inregistreazaComanda, type ContextPOS } from './servicii/vanzari';

export interface RezultatDemo {
  locatii: { depozit: number; centru: number; botanica: number };
  coduri_tablete: { centru: string; botanica: string };
  baristi: { nume: string; pin: string; locatie: string }[];
}

const ARTICOLE = [
  ['Cafea boabe', 'g', 'materie_prima', 2000, 0.42],
  ['Lapte 3,2%', 'ml', 'materie_prima', 5000, 0.022],
  ['Lapte de ovăz', 'ml', 'materie_prima', 2000, 0.045],
  ['Sirop vanilie', 'ml', 'materie_prima', 500, 0.15],
  ['Gheață', 'g', 'materie_prima', 0, 0.002],
  ['Ciocolată praf', 'g', 'materie_prima', 500, 0.12],
  ['Ceai (plic)', 'buc', 'materie_prima', 30, 1.5],
  ['Pahar 250 ml', 'buc', 'ambalaj', 200, 0.9],
  ['Pahar 350 ml', 'buc', 'ambalaj', 200, 1.1],
  ['Capac', 'buc', 'ambalaj', 300, 0.4],
  ['Pai', 'buc', 'ambalaj', 100, 0.2],
  ['Plic zahăr', 'buc', 'ambalaj', 300, 0.15],
  ['Croissant', 'buc', 'marfa', 10, 12],
  ['Apă plată 0,5 l', 'buc', 'marfa', 12, 6],
] as const;

type NumeArticol = (typeof ARTICOLE)[number][0];

interface ProdusDemo {
  id: number;
  nume: string;
  pret: number;
  sezon: string | null;
  pondere: number;
  mods: number[];
}

const CATEGORII = ['Cafea caldă', 'Cafea rece', 'Alte băuturi', 'Patiserie și gustări'] as const;

// [nume, categorie, preț, doze, rețetă, sezon] — sezon: 'vara' crește iulie–august, 'iarna' crește la frig.
const PRODUSE: [string, (typeof CATEGORII)[number], number, number, [NumeArticol, number][], 'vara' | 'iarna' | null, number][] = [
  ['Espresso', 'Cafea caldă', 25, 1, [['Cafea boabe', 9], ['Pahar 250 ml', 1], ['Plic zahăr', 1]], null, 6],
  ['Americano', 'Cafea caldă', 30, 2, [['Cafea boabe', 18], ['Pahar 350 ml', 1], ['Capac', 1], ['Plic zahăr', 1]], null, 8],
  ['Cappuccino', 'Cafea caldă', 35, 2, [['Cafea boabe', 18], ['Lapte 3,2%', 150], ['Pahar 250 ml', 1], ['Capac', 1], ['Plic zahăr', 1]], 'iarna', 12],
  ['Latte', 'Cafea caldă', 40, 2, [['Cafea boabe', 18], ['Lapte 3,2%', 250], ['Pahar 350 ml', 1], ['Capac', 1], ['Plic zahăr', 1]], 'iarna', 10],
  ['Flat White', 'Cafea caldă', 40, 2, [['Cafea boabe', 18], ['Lapte 3,2%', 120], ['Pahar 250 ml', 1], ['Capac', 1], ['Plic zahăr', 1]], null, 5],
  ['Iced Coffee', 'Cafea rece', 45, 2, [['Cafea boabe', 18], ['Lapte 3,2%', 150], ['Gheață', 150], ['Pahar 350 ml', 1], ['Capac', 1], ['Pai', 1]], 'vara', 8],
  ['Iced Latte', 'Cafea rece', 48, 2, [['Cafea boabe', 18], ['Lapte 3,2%', 200], ['Gheață', 120], ['Pahar 350 ml', 1], ['Capac', 1], ['Pai', 1]], 'vara', 6],
  ['Ciocolată caldă', 'Alte băuturi', 38, 0, [['Ciocolată praf', 30], ['Lapte 3,2%', 200], ['Pahar 250 ml', 1], ['Capac', 1]], 'iarna', 3],
  ['Ceai', 'Alte băuturi', 22, 0, [['Ceai (plic)', 1], ['Pahar 350 ml', 1], ['Capac', 1], ['Plic zahăr', 1]], 'iarna', 4],
  ['Croissant', 'Patiserie și gustări', 28, 0, [['Croissant', 1]], null, 5],
  ['Apă plată', 'Patiserie și gustări', 15, 0, [['Apă plată 0,5 l', 1]], 'vara', 3],
];

/** Generator pseudo-aleator determinist, ca demo-ul să arate la fel la fiecare rulare. */
function aleator(samanta: number) {
  let s = samanta >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ora locală din Chișinău (UTC+3 vara, UTC+2 iarna) → ISO. */
function oraLocala(zi: Date, ora: number, minut: number): string {
  const luna = zi.getUTCMonth();
  const offset = luna >= 3 && luna <= 9 ? 3 : 2;
  return new Date(Date.UTC(zi.getUTCFullYear(), zi.getUTCMonth(), zi.getUTCDate(), ora - offset, minut)).toISOString();
}

export async function populeazaDemo(db: Db, opt: { zileIstoric?: number; azi?: Date } = {}): Promise<RezultatDemo> {
  const zile = opt.zileIstoric ?? 0;
  const azi = opt.azi ?? new Date();
  const rnd = aleator(2026);

  const depozit = (await acces.salveazaLocatie(db, { nume: 'Depozit Central', tip: 'depozit' })).id as number;
  const centru = (await acces.salveazaLocatie(db, { nume: 'Cafenea Centru', tip: 'punct' })).id as number;
  const botanica = (await acces.salveazaLocatie(db, { nume: 'Cafenea Botanica', tip: 'punct' })).id as number;

  const art = new Map<NumeArticol, number>();
  for (const [nume, um, tip, prag] of ARTICOLE) art.set(nume, (await catalog.salveazaArticol(db, { nume, um, tip, prag_minim: prag })).id);

  const cat = new Map<string, number>();
  for (const [i, nume] of CATEGORII.entries()) cat.set(nume, (await catalog.salveazaCategorie(db, { nume, ordine: i })).id);

  const mod = {
    ovaz: (await catalog.salveazaModificator(db, { nume: 'Lapte de ovăz', pret: 10, inlocuieste_articol_id: art.get('Lapte 3,2%'), inlocuitor_articol_id: art.get('Lapte de ovăz'), adauga: [] })).id!,
    shot: (await catalog.salveazaModificator(db, { nume: 'Extra shot', pret: 10, doze_cafea: 1, adauga: [{ articol_id: art.get('Cafea boabe')!, cantitate: 9 }] })).id!,
    vanilie: (await catalog.salveazaModificator(db, { nume: 'Sirop vanilie', pret: 8, adauga: [{ articol_id: art.get('Sirop vanilie')!, cantitate: 20 }] })).id!,
    farazahar: (await catalog.salveazaModificator(db, { nume: 'Fără zahăr', pret: 0, adauga: [{ articol_id: art.get('Plic zahăr')!, cantitate: -1 }] })).id!,
  };

  const preturiMod = new Map([[mod.ovaz, 10], [mod.shot, 10], [mod.vanilie, 8], [mod.farazahar, 0]]);
  const produse: ProdusDemo[] = [];
  for (const [i, [nume, categorie, pret, doze, reteta, sezon, pondere]] of PRODUSE.entries()) {
    const areLapte = reteta.some(([a]) => a === 'Lapte 3,2%');
    const eCafea = reteta.some(([a]) => a === 'Cafea boabe');
    const areZahar = reteta.some(([a]) => a === 'Plic zahăr');
    const mods = [
      ...(areLapte ? [mod.ovaz] : []),
      ...(eCafea ? [mod.shot, mod.vanilie] : []),
      ...(areZahar ? [mod.farazahar] : []),
    ];
    const { id } = await catalog.salveazaProdus(db, {
      nume, categorie_id: cat.get(categorie)!, pret, doze_cafea: doze, ordine: i,
      reteta: reteta.map(([a, c]) => ({ articol_id: art.get(a)!, cantitate: c })),
      modificatori: mods,
    });
    produse.push({ id: id!, nume, pret, sezon, pondere, mods });
  }

  const baristi = [
    { nume: 'Ana Rusu', pin: '1111', locatie: centru },
    { nume: 'Ion Ceban', pin: '2222', locatie: botanica },
    { nume: 'Maria Popa', pin: '3333', locatie: null },
  ];
  const idBaristi: number[] = [];
  for (const b of baristi) idBaristi.push((await acces.salveazaUtilizator(db, { nume: b.nume, rol: 'barista', pin: b.pin, locatie_id: b.locatie })).id);

  const tabCentru = await acces.creeazaDispozitiv(db, 'Tabletă Centru', centru);
  const tabBotanica = await acces.creeazaDispozitiv(db, 'Tabletă Botanica', botanica);

  // Costurile de achiziție (lei / unitate de măsură).
  const cost = new Map<number, number>(ARTICOLE.map(([nume, , , , c]) => [art.get(nume)!, c]));
  // Necesarul aproximativ pe o săptămână pentru o cafenea.
  const saptamanal = new Map<NumeArticol, number>([
    ['Cafea boabe', 9000], ['Lapte 3,2%', 50000], ['Lapte de ovăz', 4000], ['Sirop vanilie', 1200], ['Gheață', 15000],
    ['Ciocolată praf', 1500], ['Ceai (plic)', 50], ['Pahar 250 ml', 300], ['Pahar 350 ml', 400], ['Capac', 650],
    ['Pai', 150], ['Plic zahăr', 600], ['Croissant', 70], ['Apă plată 0,5 l', 50],
  ]);

  // Aprovizionare săptămânală „până la normă”: fiecare cafenea primește cât a consumat
  // săptămâna trecută plus o rezervă, iar depozitul cumpără cât a dat.
  async function aprovizioneaza(la: string, nr: number) {
    const necesar = new Map<number, Map<number, number>>();
    for (const loc of [centru, botanica]) {
      const factor = loc === centru ? 1.25 : 1;
      const consum = new Map(
        (
          await db.query<{ articol_id: number; c: number }>(
            `SELECT articol_id, -SUM(cantitate)::numeric AS c FROM miscari_stoc
              WHERE locatie_id = $1 AND tip IN ('vanzare', 'casare', 'retur') AND creata_la > $2::timestamptz - interval '7 days' AND creata_la <= $2
              GROUP BY 1`,
            [loc, la],
          )
        ).map((x) => [x.articol_id, x.c]),
      );
      const stoc = new Map(
        (
          await db.query<{ articol_id: number; s: number }>(
            'SELECT articol_id, SUM(cantitate)::numeric AS s FROM miscari_stoc WHERE locatie_id = $1 AND creata_la <= $2 GROUP BY 1',
            [loc, la],
          )
        ).map((x) => [x.articol_id, x.s]),
      );
      const linii = new Map<number, number>();
      for (const [a, q] of saptamanal) {
        const id = art.get(a)!;
        const norma = Math.max(q * factor, (consum.get(id) ?? 0) * 1.6);
        const lipsa = Math.ceil(norma - (stoc.get(id) ?? 0));
        if (lipsa > 0) linii.set(id, lipsa);
      }
      necesar.set(loc, linii);
    }
    const total = new Map<number, number>();
    for (const linii of necesar.values()) for (const [id, q] of linii) total.set(id, (total.get(id) ?? 0) + q);
    await creeazaReceptie(
      db,
      {
        locatie_id: depozit, furnizor: 'Furnizor Demo SRL', nr_factura: `FD-${nr}`, data: la.slice(0, 10),
        linii: [...total].map(([id, q]) => ({ articol_id: id, cantitate: Math.ceil(q * 1.15), cost_unitar: cost.get(id)! * (0.95 + rnd() * 0.1) })),
      },
      null,
      la,
    );
    for (const [loc, linii] of necesar) {
      if (linii.size) await creeazaTransfer(db, { din_locatie_id: depozit, in_locatie_id: loc, linii: [...linii].map(([articol_id, cantitate]) => ({ articol_id, cantitate })) }, null, la);
    }
  }

  const start = new Date(Date.UTC(azi.getUTCFullYear(), azi.getUTCMonth(), azi.getUTCDate() - zile));
  await aprovizioneaza(oraLocala(start, 7, 0), 1);

  if (zile > 0) {
    for (let z = 0; z < zile; z++) {
      const zi = new Date(start.getTime() + z * 86_400_000);
      if (z > 0 && z % 7 === 0) await aprovizioneaza(oraLocala(zi, 7, 0), z / 7 + 1);
      for (const [loc, baza, barista, tableta] of [
        [centru, 34, idBaristi[0], tabCentru.id],
        [botanica, 24, idBaristi[1], tabBotanica.id],
      ] as const) {
        await ziDeLucru(db, { locatie_id: loc, dispozitiv_id: tableta }, zi, baza, z % 6 === 5 ? idBaristi[2] : barista, produse, preturiMod, rnd);
      }
    }
  }

  return {
    locatii: { depozit, centru, botanica },
    coduri_tablete: { centru: tabCentru.cod_asociere, botanica: tabBotanica.cod_asociere },
    baristi: baristi.map((b) => ({ nume: b.nume, pin: b.pin, locatie: b.locatie === centru ? 'Cafenea Centru' : b.locatie === botanica ? 'Cafenea Botanica' : 'toate' })),
  };
}

async function ziDeLucru(
  db: Db,
  ctx: ContextPOS,
  zi: Date,
  baza: number,
  barista: number,
  produse: ProdusDemo[],
  preturiMod: Map<number, number>,
  rnd: () => number,
) {
  const luna = zi.getUTCMonth();
  const vara = luna >= 5 && luna <= 7 ? 1 : luna === 8 ? 0.6 : luna === 4 ? 0.4 : 0;
  const weekend = [0, 6].includes(zi.getUTCDay()) ? 1.2 : 1;
  const ponderi = produse.map((p) => p.pondere * (p.sezon === 'vara' ? 0.25 + 2.5 * vara : p.sezon === 'iarna' ? 1.6 - 0.8 * vara : 1));
  const sumaPonderi = ponderi.reduce((s, x) => s + x, 0);
  const alege = () => {
    let r = rnd() * sumaPonderi;
    for (let i = 0; i < produse.length; i++) if ((r -= ponderi[i]) <= 0) return produse[i];
    return produse[produse.length - 1];
  };

  const turaId = randomUUID();
  await deschideTura(db, ctx, oraLocala(zi, 7, 30), { tura_id: turaId, utilizator_id: barista, fond_initial: 500 });
  const nrComenzi = Math.round(baza * weekend * (0.85 + rnd() * 0.3));
  const comenzi: { id: string; la: string }[] = [];
  for (let i = 0; i < nrComenzi; i++) {
    const minut = 8 * 60 + Math.floor(((i + rnd()) / nrComenzi) * 12 * 60);
    const la = oraLocala(zi, Math.floor(minut / 60), minut % 60);
    const linii: LinieComanda[] = [];
    const nrLinii = rnd() < 0.75 ? 1 : 2;
    for (let j = 0; j < nrLinii; j++) {
      const p = alege();
      const mods = p.mods.filter(() => rnd() < 0.12).map((id) => ({ id, pret: preturiMod.get(id)! }));
      linii.push({ produs_id: p.id, cantitate: rnd() < 0.85 ? 1 : 2, pret_unitar: p.pret, modificatori: mods });
    }
    const x = rnd();
    const metoda: MetodaPlata = x < 0.025 ? 'casare' : x < 0.45 ? 'numerar' : 'card';
    const total = totalComanda(linii);
    const id = randomUUID();
    await inregistreazaComanda(db, ctx, la, {
      comanda_id: id, tura_id: turaId, utilizator_id: barista, nr: i + 1, metoda, linii, total,
      motiv_casare: metoda === 'casare' ? MOTIVE_CASARE[Math.floor(rnd() * 4)] : null,
      primit: metoda === 'numerar' ? Math.ceil(total / 50) * 50 : null,
      card_autorizare: metoda === 'card' ? String(100000 + Math.floor(rnd() * 900000)) : null,
    });
    if (metoda !== 'casare') comenzi.push({ id, la });
  }
  if (comenzi.length && rnd() < 0.3) {
    const c = comenzi[Math.floor(rnd() * comenzi.length)];
    await anuleazaComanda(db, ctx, new Date(new Date(c.la).getTime() + 120_000).toISOString(), {
      comanda_id: c.id, tura_id: turaId, utilizator_id: barista, motiv: 'Clientul s-a răzgândit', restituie_stoc: rnd() < 0.5,
    });
  }

  // La închidere barista declară aproape exact ce trebuia; din când în când apare o lipsă.
  const inchidere = oraLocala(zi, 20, 30);
  const s = await calculeazaScriptic(db, turaId, ctx.locatie_id, inchidere);
  const lipsa = rnd() < 0.12 ? -Math.round(10 + rnd() * 60) : 0;
  const dozeInPlus = rnd() < 0.1 ? Math.round(2 + rnd() * 4) : 0;
  await inchideTura(db, ctx, inchidere, {
    tura_id: turaId, utilizator_id: barista, doze: s.scriptic_doze + dozeInPlus, numerar: s.scriptic_numerar + lipsa,
    card: s.scriptic_card, anulari: s.scriptic_anulari, casari: s.scriptic_casari,
  });
  // Seara, adminul ridică numerarul și lasă 500 lei fond pentru dimineață.
  const sold = s.scriptic_numerar + lipsa;
  if (sold > 500) {
    await db.query(
      `INSERT INTO miscari_bani (locatie_id, cont, suma, tip, descriere, creata_la) VALUES ($1, 'numerar', $2, 'depunere', 'Depunere la bancă', $3)`,
      [ctx.locatie_id, -(sold - 500), oraLocala(zi, 20, 45)],
    );
  }
  // Tura e verificată de admin dacă a trecut mai mult de o săptămână.
  if (Date.now() - zi.getTime() > 7 * 86_400_000) {
    await db.query(`UPDATE ture SET verificata_la = $2, nota_verificare = 'Verificat' WHERE id = $1 AND are_discrepante`, [turaId, oraLocala(zi, 21, 0)]);
  }
}
