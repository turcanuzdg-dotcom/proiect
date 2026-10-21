export { formatLei, formatCantitate } from '@cafenea/shared';

const fData = new Intl.DateTimeFormat('ro-MD', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fDataOra = new Intl.DateTimeFormat('ro-MD', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fOra = new Intl.DateTimeFormat('ro-MD', { hour: '2-digit', minute: '2-digit' });
const fNr = new Intl.NumberFormat('ro-MD', { maximumFractionDigits: 2 });

export const formatData = (d: string | Date | null | undefined) => (d ? fData.format(new Date(d)) : '—');
export const formatDataOra = (d: string | Date | null | undefined) => (d ? fDataOra.format(new Date(d)) : '—');
export const formatOra = (d: string | Date | null | undefined) => (d ? fOra.format(new Date(d)) : '—');
export const formatNumar = (n: number | null | undefined) => (n == null ? '—' : fNr.format(n));

/** Ziua de lucru a cafenelelor e cea din Chișinău, oriunde s-ar afla calculatorul adminului. */
export const FUS_ORAR = 'Europe/Chisinau';
const fZiFus = new Intl.DateTimeFormat('sv-SE', { timeZone: FUS_ORAR, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Data YYYY-MM-DD în fusul cafenelei (pentru <input type="date"> și filtrele rapoartelor). */
export function ziLocala(d = new Date()): string {
  return fZiFus.format(d);
}

/** Decalajul (ms) al fusului cafenelei față de UTC la momentul dat. */
function decalajFus(t: number): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: FUS_ORAR, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t));
  const v = (tip: string) => Number(p.find((x) => x.type === tip)!.value);
  return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second')) - t;
}

/** Începutul zilei (00:00 la Chișinău) ca ISO, pentru filtrele trimise serverului. */
export function inceputZi(zi: string): string {
  const [a, l, z] = zi.split('-').map(Number);
  const presupus = Date.UTC(a, l - 1, z);
  // Decalajul se citește la momentul estimat; a doua trecere prinde ziua schimbării orei.
  let t = presupus - decalajFus(presupus);
  t = presupus - decalajFus(t);
  return new Date(t).toISOString();
}

export function adaugaZile(zi: string, n: number): string {
  const [a, l, z] = zi.split('-').map(Number);
  return new Date(Date.UTC(a, l - 1, z + n, 12)).toISOString().slice(0, 10);
}
