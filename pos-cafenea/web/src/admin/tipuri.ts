// Formele răspunsurilor API folosite de panou (vezi server/src/servicii).

export interface Locatie {
  id: number;
  nume: string;
  tip: 'depozit' | 'punct';
  activ: boolean;
}

export interface Articol {
  id: number;
  nume: string;
  um: 'g' | 'ml' | 'buc';
  tip: 'materie_prima' | 'ambalaj' | 'marfa';
  cost_mediu: number;
  prag_minim: number;
  activ: boolean;
}

export interface Categorie {
  id: number;
  nume: string;
  ordine: number;
}

export interface Produs {
  id: number;
  nume: string;
  categorie_id: number | null;
  pret: number;
  doze_cafea: number;
  ordine: number;
  activ: boolean;
  cota_tva: string | null;
  reteta: { articol_id: number; cantitate: number }[];
  modificatori: number[];
  cost_reteta: number;
}

export interface Modificator {
  id: number;
  nume: string;
  pret: number;
  doze_cafea: number;
  inlocuieste_articol_id: number | null;
  inlocuitor_articol_id: number | null;
  adauga: { articol_id: number; cantitate: number }[];
  activ: boolean;
}

export const ETICHETE_TIP_ARTICOL: Record<Articol['tip'], string> = {
  materie_prima: 'Materie primă',
  ambalaj: 'Ambalaj',
  marfa: 'Marfă',
};

export const ETICHETE_MISCARE_STOC: Record<string, string> = {
  receptie: 'Recepție',
  vanzare: 'Vânzare',
  casare: 'Casare',
  retur: 'Retur (anulare)',
  transfer_iesire: 'Transfer ieșire',
  transfer_intrare: 'Transfer intrare',
  inventar: 'Inventariere',
};

export const ETICHETE_METODA: Record<string, string> = {
  numerar: 'Numerar',
  card: 'Card',
  casare: 'Casare',
};
