// Tipurile comune pentru server, POS și panoul de administrare.

/** Limitele acceptate de server; tableta le verifică înainte de a salva, ca nimic să nu fie respins ulterior. */
export const LIMITE = { bani: 1_000_000, doze: 100_000, cantitate_linie: 1000, bucati: 10_000, text: 500, observatii: 2000 } as const;

export type UM = 'g' | 'ml' | 'buc';
export type TipArticol = 'materie_prima' | 'ambalaj' | 'marfa';
export type TipLocatie = 'depozit' | 'punct';
export type MetodaPlata = 'numerar' | 'card' | 'casare';
export type Cont = 'numerar' | 'card';

export const MOTIVE_CASARE = ['protocol', 'degustare', 'consum_personal', 'rebut', 'altele'] as const;
export type MotivCasare = (typeof MOTIVE_CASARE)[number];

export const ETICHETE_MOTIVE: Record<MotivCasare, string> = {
  protocol: 'Protocol',
  degustare: 'Degustare',
  consum_personal: 'Cafeaua personalului',
  rebut: 'Rebut / scurs',
  altele: 'Altele',
};

export const TIPURI_MISCARE_STOC = [
  'receptie',
  'vanzare',
  'casare',
  'retur',
  'transfer_iesire',
  'transfer_intrare',
  'inventar',
] as const;
export type TipMiscareStoc = (typeof TIPURI_MISCARE_STOC)[number];

export const TIPURI_MISCARE_BANI = [
  'incasare',
  'restituire',
  'plata_marunta',
  'depunere',
  'alimentare',
  'fond_initial',
  'diferenta_casa',
] as const;
export type TipMiscareBani = (typeof TIPURI_MISCARE_BANI)[number];

export const ETICHETE_MISCARE_BANI: Record<TipMiscareBani, string> = {
  incasare: 'Încasare',
  restituire: 'Restituire (anulare)',
  plata_marunta: 'Plată mărunță din casă',
  depunere: 'Depunere / ridicare numerar',
  alimentare: 'Alimentare casă',
  fond_initial: 'Fondul de pornire',
  diferenta_casa: 'Diferență la numărare',
};

export interface LinieReteta {
  articol_id: number;
  cantitate: number;
}

/** Un modificator poate înlocui un ingredient (lapte → lapte de ovăz) și/sau adăuga ingrediente. */
export interface DefinitieModificator {
  id: number;
  nume: string;
  pret: number;
  doze_cafea: number;
  inlocuieste_articol_id: number | null;
  inlocuitor_articol_id: number | null;
  adauga: LinieReteta[];
}

export interface CategorieCatalog {
  id: number;
  nume: string;
}

export interface ProdusCatalog {
  id: number;
  nume: string;
  categorie_id: number | null;
  pret: number;
  doze_cafea: number;
  modificatori: number[];
}

export interface ModificatorCatalog {
  id: number;
  nume: string;
  pret: number;
}

export interface BaristCatalog {
  id: number;
  nume: string;
  /** sha256(sare + PIN): PIN-ul doar atribuie vânzările; tableta e autentificată prin tokenul ei. */
  pin_hash: string;
  sare: string;
}

export interface CatalogPOS {
  versiune: string;
  locatie: { id: number; nume: string };
  categorii: CategorieCatalog[];
  produse: ProdusCatalog[];
  modificatori: ModificatorCatalog[];
  baristi: BaristCatalog[];
  generat_la: string;
}

// ---- Evenimentele trimise de POS (coada offline) ----

export interface LinieComanda {
  produs_id: number;
  cantitate: number;
  pret_unitar: number;
  modificatori: { id: number; pret: number }[];
}

export interface DateComanda {
  comanda_id: string;
  tura_id: string;
  utilizator_id: number;
  nr: number;
  metoda: MetodaPlata;
  motiv_casare?: MotivCasare | null;
  nota?: string | null;
  linii: LinieComanda[];
  total: number;
  primit?: number | null;
  card_autorizare?: string | null;
}

export interface DateAnulare {
  comanda_id: string;
  tura_id: string;
  utilizator_id: number;
  motiv: string;
  restituie_stoc: boolean;
}

export interface DateTuraDeschisa {
  tura_id: string;
  utilizator_id: number;
  fond_initial: number;
}

export interface DateTuraInchisa {
  tura_id: string;
  utilizator_id: number;
  doze: number;
  numerar: number;
  card: number;
  anulari: number;
  casari: number;
  observatii?: string | null;
}

export interface DatePlataMarunta {
  tura_id: string;
  utilizator_id: number;
  suma: number;
  descriere: string;
}

interface EvBaza<T extends string, D> {
  id: string;
  tip: T;
  /** Momentul real al operației pe tabletă (ISO). */
  la: string;
  date: D;
}

export type EvenimentPOS =
  | EvBaza<'comanda', DateComanda>
  | EvBaza<'comanda_anulata', DateAnulare>
  | EvBaza<'tura_deschisa', DateTuraDeschisa>
  | EvBaza<'tura_inchisa', DateTuraInchisa>
  | EvBaza<'plata_marunta', DatePlataMarunta>;

export type TipEveniment = EvenimentPOS['tip'];

export interface CerereSync {
  evenimente: EvenimentPOS[];
}

export interface RaspunsSync {
  /** Evenimente salvate definitiv (inclusiv cele primite de două ori). */
  acceptate: string[];
  /** Evenimente salvate pentru revizuire de admin; tableta le scoate din coadă oricum. */
  cu_eroare: { id: string; eroare: string }[];
  catalog_versiune: string;
}

// ---- Rapoarte ----

export interface RandVanzari {
  cheie: string;
  nume: string;
  cantitate: number;
  incasari: number;
  cost: number;
  marja: number;
  marja_procent: number | null;
}

export interface RandComparatie {
  cheie: string;
  nume: string;
  a_cantitate: number;
  a_incasari: number;
  b_cantitate: number;
  b_incasari: number;
  dif_cantitate: number;
  dif_incasari: number;
  dif_procent: number | null;
}
