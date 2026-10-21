import type { Culori } from "../tema";

// `imagine` = cale în public/ (de ex. "media/foto1.jpg"). `durata` în secunde.

export type ScenaIntro = {
  tip: "intro";
  titlu: string;
  subtitlu?: string;
  eticheta?: string; // rând mic deasupra titlului, de ex. „Primăria comunei ...”
  imagine?: string;
  durata?: number;
};

export type ScenaFoto = {
  tip: "foto";
  imagine: string;
  titlu?: string;
  text?: string;
  durata?: number;
};

export type ScenaInainteDupa = {
  tip: "inainte-dupa";
  inainte: string;
  dupa: string;
  titlu?: string;
  etichetaInainte?: string; // implicit „Înainte”; de ex. „2023”
  etichetaDupa?: string; // implicit „După”; de ex. „2026”
  durata?: number;
};

export type Cifra = {
  valoare: number;
  prefix?: string;
  sufix?: string; // de ex. " m²", " km", " lei"
  eticheta: string;
};

export type ScenaCifre = {
  tip: "cifre";
  titlu?: string;
  cifre: Cifra[]; // 1–4
  durata?: number;
};

export type Etapa = {
  data?: string; // de ex. „Martie 2025”
  text: string;
};

export type ScenaEtape = {
  tip: "etape";
  titlu?: string;
  etape: Etapa[]; // 2–5
  durata?: number;
};

export type ScenaFinal = {
  tip: "final";
  titlu: string;
  text?: string;
  logouri?: string[];
  contact?: string;
  durata?: number;
};

export type Scena =
  | ScenaIntro
  | ScenaFoto
  | ScenaInainteDupa
  | ScenaCifre
  | ScenaEtape
  | ScenaFinal;

export type Proiect = {
  culori?: Partial<Culori>;
  muzica?: string; // cale în public/ sau URL http(s), opțional
  scene: Scena[];
  /** Completat automat (calculateMetadata): lungimea pistei muzicale, în secunde. */
  durataMuzica?: number | null;
};

export const DURATA_IMPLICITA: Record<Scena["tip"], number> = {
  intro: 5,
  foto: 4.5,
  "inainte-dupa": 6,
  cifre: 5.5,
  etape: 7,
  final: 5,
};

/**
 * Durata minimă a fiecărei scene, în secunde: cât îi trebuie ca să-și termine
 * intrarea și să-și arate starea finală (cifrele exacte, „după” descoperită complet,
 * ultima etapă) înainte de tranziția de ieșire. O durată mai mică din date e ridicată
 * la acest minim; etapele cer mai mult cu cât sunt mai multe.
 */
export const durataMinima = (s: Scena): number => {
  switch (s.tip) {
    case "intro":
      return 2.5;
    case "foto":
      return 2;
    case "inainte-dupa":
      return 3.5;
    case "cifre":
      return 3;
    case "etape":
      return 2 + 0.4 * Math.min(5, Math.max(2, s.etape?.length ?? 2));
    case "final":
      return 3;
  }
};

/** Durata scenei în film: cea din date (dacă e un număr valid), dar cel puțin minimul. */
export const durataScena = (s: Scena) => {
  const dorita = typeof s.durata === "number" && Number.isFinite(s.durata) ? s.durata : DURATA_IMPLICITA[s.tip];
  return Math.max(durataMinima(s), dorita);
};

/**
 * Timpul (secunde de la începutul scenei) până la care starea finală trebuie să fie
 * completă: tranziția de ieșire durează cel mult 0,8 s, plus 0,3 s de menținere
 * curată. Scenele își comprimă calendarul ca să încapă înainte de acest moment.
 */
export const sfarsitUtil = (secundeScena: number) => Math.max(0.5 * secundeScena, secundeScena - 1.1);
