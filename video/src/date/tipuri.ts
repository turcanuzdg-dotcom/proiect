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
  muzica?: string; // cale în public/, opțional
  scene: Scena[];
};

export const DURATA_IMPLICITA: Record<Scena["tip"], number> = {
  intro: 5,
  foto: 4.5,
  "inainte-dupa": 6,
  cifre: 5.5,
  etape: 7,
  final: 5,
};

export const durataScena = (s: Scena) => s.durata ?? DURATA_IMPLICITA[s.tip];
