import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CatalogPOS, EvenimentPOS, MetodaPlata, MotivCasare } from '@cafenea/shared';

// Tot ce are nevoie tableta ca să lucreze o zi întreagă fără internet stă aici, în IndexedDB:
// configurația, catalogul, tura curentă, coada de evenimente nesincronizate și comenzile turei.

export interface ConfigTableta {
  token: string;
  dispozitiv: { id: number; nume: string; locatie_id: number };
}

export interface TuraLocala {
  id: string;
  deschisa_la: string;
  fond_initial: number;
  deschisa_de: number;
}

export interface BaristaActiv {
  id: number;
  nume: string;
}

export interface LinieComandaLocala {
  produs_id: number;
  nume: string;
  cantitate: number;
  pret_unitar: number;
  modificatori: { id: number; nume: string; pret: number }[];
  total: number;
}

export interface ComandaLocala {
  comanda_id: string;
  tura_id: string;
  nr: number;
  la: string;
  metoda: MetodaPlata;
  motiv_casare: MotivCasare | null;
  linii: LinieComandaLocala[];
  total: number;
  primit: number | null;
  rest: number | null;
  card_autorizare: string | null;
  card_rrn?: string | null;
  card_operation_id?: string | null;
  barista: BaristaActiv;
  stare: 'finalizata' | 'anulata';
  anulata_la?: string;
  motiv_anulare?: string;
  stoc_restituit?: boolean;
  /** Bonul fiscal a fost emis de tabletă (prin terminalul legat sau puntea locală). */
  bon_tiparit: boolean;
  /**
   * Terminal separat, fără legătură: bonul fiscal îl emite barista pe terminal, tableta doar amintește.
   * Comanda nu e „bon netipărit” și nu se retipărește din Istoric.
   */
  bon_pe_terminal?: boolean;
}

export interface ConfigEchipamente {
  /** manual = terminal separat, fără legătură cu tableta (suma se introduce de mână pe terminal). */
  tip: 'simulator' | 'punte' | 'server' | 'manual';
  url: string;
  /** Secretul afișat de punte la pornire. */
  secret?: string;
  simuleazaRefuz?: boolean;
}

interface Chei {
  config: ConfigTableta;
  catalog: CatalogPOS;
  tura: TuraLocala;
  barista: BaristaActiv;
  contor: number;
  echipamente: ConfigEchipamente;
  pin_blocare: StareBlocarePin;
}

/** Încercările greșite de PIN pe tabletă (vezi blocare.ts). */
export interface StareBlocarePin {
  /** PIN-uri greșite de la ultima blocare sau ultima intrare reușită. */
  esecuri: number;
  /** Câte blocări au fost la rând: fiecare durează dublu față de cea dinainte. */
  blocari: number;
  /** Până când (ms) nu se mai primesc PIN-uri. */
  blocat_pana: number;
}

/** Un eveniment confirmat de server, păstrat pentru retrimitere (jurnalul ultimelor 7 zile). */
export interface EvenimentTrimis {
  /** Numărul lui din coadă: păstrează ordinea în care a fost făcut. */
  secv: number;
  confirmat_la: number;
  ev: EvenimentPOS;
}

interface Schema extends DBSchema {
  kv: { key: string; value: unknown };
  coada: { key: number; value: { secv?: number; ev: EvenimentPOS } };
  comenzi: { key: string; value: ComandaLocala; indexes: { tura: string } };
  trimise: { key: number; value: EvenimentTrimis; indexes: { confirmat_la: number } };
}

/** Cât timp și câte evenimente confirmate păstrează jurnalul de retrimitere. */
export const JURNAL_ZILE = 7;
export const JURNAL_MAXIM = 20_000;

let promisiune: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  promisiune ??= openDB<Schema>('pos-cafenea', 2, {
    upgrade(d, versiuneVeche) {
      if (versiuneVeche < 1) {
        d.createObjectStore('kv');
        d.createObjectStore('coada', { keyPath: 'secv', autoIncrement: true });
        d.createObjectStore('comenzi', { keyPath: 'comanda_id' }).createIndex('tura', 'tura_id');
      }
      // Versiunea 2: jurnalul evenimentelor deja confirmate, pentru retrimitere după o restaurare a serverului.
      if (versiuneVeche < 2) d.createObjectStore('trimise', { keyPath: 'secv' }).createIndex('confirmat_la', 'confirmat_la');
    },
  });
  return promisiune;
}

export async function citeste<K extends keyof Chei>(cheie: K): Promise<Chei[K] | undefined> {
  return (await (await db()).get('kv', cheie)) as Chei[K] | undefined;
}

export async function scrie<K extends keyof Chei>(cheie: K, valoare: Chei[K]): Promise<void> {
  await (await db()).put('kv', valoare, cheie);
}

export async function sterge(cheie: keyof Chei): Promise<void> {
  await (await db()).delete('kv', cheie);
}

/** Numărul de bon următor al tabletei (crește și offline). */
export async function urmatorulNumar(): Promise<number> {
  const d = await db();
  const tx = d.transaction('kv', 'readwrite');
  const nr = (((await tx.store.get('contor')) as number | undefined) ?? 0) + 1;
  await tx.store.put(nr, 'contor');
  await tx.done;
  return nr;
}

export interface OptiuniInregistrare {
  /** Închiderea turei: tura și barista dispar din memorie odată cu punerea evenimentului în coadă. */
  inchideTura?: boolean;
  /** Deschiderea turei: tura se salvează odată cu evenimentul. */
  deschideTura?: TuraLocala;
}

/**
 * Pune evenimentul în coadă și, dacă e cazul, salvează sau actualizează comanda locală,
 * în aceeași tranzacție: ori se salvează amândouă, ori niciuna. La închiderea turei, tot
 * aici se șterge tura locală, ca o repornire a tabletei să nu mai poată vinde pe tura închisă.
 */
export async function inregistreaza(ev: EvenimentPOS, comanda?: ComandaLocala, opt: OptiuniInregistrare = {}): Promise<void> {
  const d = await db();
  const tx = d.transaction(['coada', 'comenzi', 'kv'], 'readwrite');
  await tx.objectStore('coada').add({ ev });
  if (comanda) await tx.objectStore('comenzi').put(comanda);
  if (opt.inchideTura) {
    await tx.objectStore('kv').delete('tura');
    await tx.objectStore('kv').delete('barista');
  }
  if (opt.deschideTura) await tx.objectStore('kv').put(opt.deschideTura, 'tura');
  await tx.done;
}

export async function citesteComanda(id: string): Promise<ComandaLocala | undefined> {
  return (await db()).get('comenzi', id);
}

/** Doar bifa „bon tipărit”, pe înregistrarea curentă: nu suprascrie o anulare făcută între timp. */
export async function marcheazaBonTiparit(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction('comenzi', 'readwrite');
  const c = await tx.store.get(id);
  if (c) await tx.store.put({ ...c, bon_tiparit: true });
  await tx.done;
}

export async function primeleDinCoada(n: number) {
  const d = await db();
  const rez: { secv: number; ev: EvenimentPOS }[] = [];
  let cursor = await d.transaction('coada').store.openCursor();
  while (cursor && rez.length < n) {
    rez.push(cursor.value as { secv: number; ev: EvenimentPOS });
    cursor = await cursor.continue();
  }
  return rez;
}

/**
 * Scoate din coadă evenimentele confirmate de server și le mută, în aceeași tranzacție, în jurnalul de
 * retrimitere (ultimele JURNAL_ZILE zile, cel mult JURNAL_MAXIM evenimente). Dacă serverul e restaurat
 * dintr-o copie de siguranță mai veche, tableta poate trimite din nou ziua pierdută; serverul recunoaște
 * după UUID ce are deja, deci retrimiterea nu dublează nimic.
 */
export async function scoateDinCoada(secvente: number[], acum = Date.now()): Promise<void> {
  if (!secvente.length) return;
  const d = await db();
  const tx = d.transaction(['coada', 'trimise'], 'readwrite');
  const coada = tx.objectStore('coada');
  const trimise = tx.objectStore('trimise');
  for (const s of secvente) {
    const x = await coada.get(s);
    if (!x) continue;
    await trimise.put({ secv: s, confirmat_la: acum, ev: x.ev });
    await coada.delete(s);
  }
  // Jurnalul rămâne mărginit: pleacă întâi ce e mai vechi de JURNAL_ZILE, apoi cele mai vechi peste limită.
  let cursor = await trimise.index('confirmat_la').openCursor(IDBKeyRange.upperBound(acum - JURNAL_ZILE * 86_400_000, true));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  let peste = (await trimise.count()) - JURNAL_MAXIM;
  let vechi = peste > 0 ? await trimise.openCursor() : null;
  while (vechi && peste > 0) {
    await vechi.delete();
    peste -= 1;
    vechi = await vechi.continue();
  }
  await tx.done;
}

/** Evenimentele din jurnal, în ordinea în care au fost făcute, începând după secvența `dupa`. */
export async function evenimenteDinJurnal(n: number, dupa = 0): Promise<EvenimentTrimis[]> {
  const d = await db();
  const rez: EvenimentTrimis[] = [];
  let cursor = await d.transaction('trimise').store.openCursor(IDBKeyRange.lowerBound(dupa, true));
  while (cursor && rez.length < n) {
    rez.push(cursor.value);
    cursor = await cursor.continue();
  }
  return rez;
}

export async function numarInJurnal(): Promise<number> {
  return (await db()).count('trimise');
}

export async function numarInCoada(): Promise<number> {
  return (await db()).count('coada');
}

export async function comenziTura(turaId: string): Promise<ComandaLocala[]> {
  const r = await (await db()).getAllFromIndex('comenzi', 'tura', turaId);
  return r.sort((a, b) => b.la.localeCompare(a.la));
}

export async function salveazaComanda(c: ComandaLocala): Promise<void> {
  await (await db()).put('comenzi', c);
}

/** La deschiderea unei ture noi păstrăm doar comenzile din ultimele 3 zile. */
export async function curataComenziVechi(): Promise<void> {
  const limita = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const d = await db();
  const tx = d.transaction('comenzi', 'readwrite');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (cursor.value.la < limita) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** Dezasocierea tabletei șterge tot, mai puțin evenimentele încă nesincronizate. */
export async function stergeConfigurarea(): Promise<void> {
  const d = await db();
  await d.clear('kv');
  await d.clear('comenzi');
}

/** Cere browserului să nu șteargă datele când rămâne fără spațiu. */
export async function cerePersistenta(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
