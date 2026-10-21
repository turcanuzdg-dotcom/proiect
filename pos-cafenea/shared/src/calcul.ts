import type { DefinitieModificator, LinieComanda, LinieReteta, UM } from './tipuri';

/** Rotunjire la bani (2 zecimale) fără erorile tipice de virgulă mobilă. */
export function rotunjeste(valoare: number, zecimale = 2): number {
  const f = 10 ** zecimale;
  return Math.round((valoare + Number.EPSILON) * f) / f;
}

export function totalLinie(linie: LinieComanda): number {
  const pretModificatori = linie.modificatori.reduce((s, m) => s + m.pret, 0);
  return rotunjeste(linie.cantitate * (linie.pret_unitar + pretModificatori));
}

export function totalComanda(linii: LinieComanda[]): number {
  return rotunjeste(linii.reduce((s, l) => s + totalLinie(l), 0));
}

export function calculeazaRest(total: number, primit: number): number {
  return rotunjeste(primit - total);
}

/**
 * Ingredientele consumate de UN produs, după aplicarea modificatorilor.
 * Înlocuirea mută cantitatea din rețetă pe alt articol (150 ml lapte → 150 ml lapte de ovăz),
 * adăugarea poate fi pozitivă (extra shot) sau negativă (fără zahăr); nimic nu coboară sub 0.
 */
export function expandeazaReteta(
  reteta: LinieReteta[],
  modificatori: DefinitieModificator[] = [],
): Map<number, number> {
  const consum = new Map<number, number>();
  for (const l of reteta) consum.set(l.articol_id, (consum.get(l.articol_id) ?? 0) + l.cantitate);

  for (const m of modificatori) {
    if (m.inlocuieste_articol_id != null && m.inlocuitor_articol_id != null) {
      const cant = consum.get(m.inlocuieste_articol_id);
      if (cant) {
        consum.delete(m.inlocuieste_articol_id);
        consum.set(m.inlocuitor_articol_id, (consum.get(m.inlocuitor_articol_id) ?? 0) + cant);
      }
    }
  }
  for (const m of modificatori) {
    for (const l of m.adauga) consum.set(l.articol_id, (consum.get(l.articol_id) ?? 0) + l.cantitate);
  }

  for (const [id, cant] of consum) {
    if (cant <= 0) consum.delete(id);
    else consum.set(id, rotunjeste(cant, 3));
  }
  return consum;
}

/** Consumul pentru o linie de comandă (rețeta × cantitate). */
export function consumLinie(
  reteta: LinieReteta[],
  modificatori: DefinitieModificator[],
  cantitate: number,
): Map<number, number> {
  const unitar = expandeazaReteta(reteta, modificatori);
  const total = new Map<number, number>();
  for (const [id, cant] of unitar) total.set(id, rotunjeste(cant * cantitate, 3));
  return total;
}

export function adunaConsum(tinta: Map<number, number>, sursa: Map<number, number>): void {
  for (const [id, cant] of sursa) tinta.set(id, rotunjeste((tinta.get(id) ?? 0) + cant, 3));
}

export function costConsum(consum: Map<number, number>, costuri: Map<number, number>): number {
  let s = 0;
  for (const [id, cant] of consum) s += cant * (costuri.get(id) ?? 0);
  return rotunjeste(s, 4);
}

/** Pentru rapoarte: g → kg, ml → l, bucățile rămân bucăți. */
export function inUnitateMare(cantitate: number, um: UM): { cantitate: number; um: string } {
  if (um === 'g') return { cantitate: rotunjeste(cantitate / 1000, 3), um: 'kg' };
  if (um === 'ml') return { cantitate: rotunjeste(cantitate / 1000, 3), um: 'l' };
  return { cantitate: rotunjeste(cantitate, 3), um: 'buc' };
}

const formatLeiIntl = new Intl.NumberFormat('ro-MD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatLei(valoare: number): string {
  return `${formatLeiIntl.format(valoare)} lei`;
}

export function formatCantitate(cantitate: number, um: string): string {
  const f = new Intl.NumberFormat('ro-MD', { maximumFractionDigits: 3 });
  return `${f.format(cantitate)} ${um}`;
}

export function procent(parte: number, intreg: number): number | null {
  if (!intreg) return null;
  return rotunjeste((parte / intreg) * 100, 1);
}
