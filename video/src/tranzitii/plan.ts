import { durataScena, type Proiect, type Scena } from "../date/tipuri";

/**
 * Planul tranzițiilor: ce tranziție vine la fiecare tăietură și cât durează.
 * Alegerea e deterministă (după tipurile scenelor și poziția lor), deci aceeași
 * listă de scene dă mereu același film. Modul nu importă React: îl folosesc și
 * Prezentare (TransitionSeries), și calculul duratei compoziției, ca lungimea
 * filmului să fie mereu exact cea randată.
 *
 * - `estompare`: dizolvare prin întuneric, cu o ușoară apropiere și estompare optică.
 * - `cortina`: ștergere direcțională cu o muchie fină în culoarea de accent.
 * - `glisare`: scena nouă alunecă peste cea veche, care se retrage mai lent (paralaxă).
 * - `lumina`: dizolvare printr-o lumină caldă de film (light leak), cel mult de două ori.
 */
export type TipTranzitie = "estompare" | "cortina" | "glisare" | "lumina";

/** Durata fiecărei tranziții, în secunde. */
export const DURATA_TRANZITIE: Record<TipTranzitie, number> = {
  estompare: 0.6,
  cortina: 0.7,
  glisare: 0.7,
  lumina: 0.8,
};

export type Tranzitie = {
  tip: TipTranzitie;
  /** 1 = spre dreapta/în sus pe ecran (de la stânga sau de jos), -1 = invers. */
  sens: 1 | -1;
  durataCadre: number;
};

/** Scenele care umplu cadrul cu o fotografie. */
const areFotografie = (s: Scena) =>
  s.tip === "foto" || s.tip === "inainte-dupa" || (s.tip === "intro" && Boolean(s.imagine));

/**
 * Tipul de bază al tranziției dintre scena `i - 1` și scena `i`.
 * 1. Spre „înainte/după”: estompare (scena are deja propria linie care șterge cadrul).
 * 2. După intro (prima tăietură): lumina caldă.
 * 3. Spre scena finală: estompare, calmă.
 * 4. Fotografie → fotografie: cortina; grafică → fotografie: cortina;
 *    fotografie → grafică: glisare; grafică → grafică: estompare.
 */
const tipDeBaza = (anterioara: Scena, urmatoarea: Scena, i: number): TipTranzitie => {
  if (urmatoarea.tip === "inainte-dupa") return "estompare";
  if (i === 1 && anterioara.tip === "intro") return "lumina";
  if (urmatoarea.tip === "final") return "estompare";
  if (areFotografie(urmatoarea)) return "cortina";
  return areFotografie(anterioara) ? "glisare" : "estompare";
};

// Aceeași tranziție nu vine de două ori la rând: cortina ↔ glisare, iar o a doua
// estompare devine lumină (cel mult două lumini într-un film, ca să rămână un accent).
const MAX_LUMINI = 2;
const alternativa = (tip: TipTranzitie, lumini: number): TipTranzitie => {
  if (tip === "cortina") return "glisare";
  if (tip === "glisare") return "cortina";
  if (tip === "estompare" && lumini < MAX_LUMINI) return "lumina";
  return "estompare";
};

/** Cadrele unei scene în film. */
export const cadreScena = (s: Scena, fps: number) => Math.max(1, Math.round(durataScena(s) * fps));

/**
 * Tranzițiile dintre scene (n - 1 pentru n scene). O tranziție nu poate fi mai
 * lungă decât scenele dintre care trece (regula TransitionSeries).
 */
export const planTranzitii = (scene: Scena[], fps: number): Tranzitie[] => {
  const rezultat: Tranzitie[] = [];
  let precedenta: TipTranzitie | null = null;
  let sensCortina: 1 | -1 = -1;
  let lumini = 0;
  for (let i = 1; i < scene.length; i++) {
    const baza = tipDeBaza(scene[i - 1], scene[i], i);
    const tip: TipTranzitie = baza === precedenta ? alternativa(baza, lumini) : baza;
    if (tip === "lumina") lumini++;
    // cortinele alternează sensul, ca două ștergeri să nu vină din aceeași parte
    if (tip === "cortina") sensCortina = sensCortina === 1 ? -1 : 1;
    const dorita = Math.round(DURATA_TRANZITIE[tip] * fps);
    const durataCadre = Math.max(1, Math.min(dorita, cadreScena(scene[i - 1], fps), cadreScena(scene[i], fps)));
    rezultat.push({ tip, sens: tip === "cortina" ? sensCortina : 1, durataCadre });
    precedenta = tip;
  }
  return rezultat;
};

/**
 * Cronologia filmului, în cadre: începutul fiecărei scene, fereastra fiecărei
 * tranziții și durata totală (= exact cea a TransitionSeries).
 */
export const cronologie = (p: Proiect, fps: number) => {
  const tranzitii = planTranzitii(p.scene, fps);
  const scene: { start: number; durata: number }[] = [];
  let t = 0;
  p.scene.forEach((s, i) => {
    if (i > 0) t -= tranzitii[i - 1].durataCadre;
    const durata = cadreScena(s, fps);
    scene.push({ start: t, durata });
    t += durata;
  });
  const ferestre = tranzitii.map((tr, i) => ({ ...tr, start: scene[i + 1].start }));
  return { scene, tranzitii: ferestre, total: Math.max(1, t) };
};

export const durataTotala = (p: Proiect, fps: number) => cronologie(p, fps).total;
