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
  barista: BaristaActiv;
  stare: 'finalizata' | 'anulata';
  anulata_la?: string;
  motiv_anulare?: string;
  stoc_restituit?: boolean;
  bon_tiparit: boolean;
}

export interface ConfigEchipamente {
  tip: 'simulator' | 'punte';
  url: string;
  simuleazaRefuz?: boolean;
}

interface Chei {
  config: ConfigTableta;
  catalog: CatalogPOS;
  tura: TuraLocala;
  barista: BaristaActiv;
  contor: number;
  echipamente: ConfigEchipamente;
}

interface Schema extends DBSchema {
  kv: { key: string; value: unknown };
  coada: { key: number; value: { secv?: number; ev: EvenimentPOS } };
  comenzi: { key: string; value: ComandaLocala; indexes: { tura: string } };
}

let promisiune: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  promisiune ??= openDB<Schema>('pos-cafenea', 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      d.createObjectStore('coada', { keyPath: 'secv', autoIncrement: true });
      d.createObjectStore('comenzi', { keyPath: 'comanda_id' }).createIndex('tura', 'tura_id');
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

export async function scoateDinCoada(secvente: number[]): Promise<void> {
  if (!secvente.length) return;
  const d = await db();
  const tx = d.transaction('coada', 'readwrite');
  await Promise.all(secvente.map((s) => tx.store.delete(s)));
  await tx.done;
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
