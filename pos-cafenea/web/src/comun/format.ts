export { formatLei, formatCantitate } from '@cafenea/shared';

const fData = new Intl.DateTimeFormat('ro-MD', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fDataOra = new Intl.DateTimeFormat('ro-MD', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fOra = new Intl.DateTimeFormat('ro-MD', { hour: '2-digit', minute: '2-digit' });
const fNr = new Intl.NumberFormat('ro-MD', { maximumFractionDigits: 2 });

export const formatData = (d: string | Date | null | undefined) => (d ? fData.format(new Date(d)) : '—');
export const formatDataOra = (d: string | Date | null | undefined) => (d ? fDataOra.format(new Date(d)) : '—');
export const formatOra = (d: string | Date | null | undefined) => (d ? fOra.format(new Date(d)) : '—');
export const formatNumar = (n: number | null | undefined) => (n == null ? '—' : fNr.format(n));

/** Data locală YYYY-MM-DD (pentru <input type="date"> și filtrele rapoartelor). */
export function ziLocala(d = new Date()): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return z.toISOString().slice(0, 10);
}

/** Începutul zilei locale ca ISO, pentru filtrele trimise serverului. */
export function inceputZi(zi: string): string {
  return new Date(`${zi}T00:00:00`).toISOString();
}

export function adaugaZile(zi: string, n: number): string {
  const d = new Date(`${zi}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ziLocala(d);
}
