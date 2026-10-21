import { loadFont } from "@remotion/fonts";
import { createContext, useContext } from "react";
import { Easing, getInputProps, staticFile, useVideoConfig } from "remotion";

/**
 * Stilul tipografic, ales din `stil` al proiectului (`--props`): „modern” =
 * titluri în Unbounded, „clasic” = titluri serif în Playfair Display (pentru
 * proiecte de patrimoniu, carte, istorie). Se citește o dată, la încărcare,
 * fiindcă fontul și tabelele de măsurare din masuraText.ts depind de el.
 */
export type Stil = "modern" | "clasic";
export const STIL: Stil = (getInputProps() as { stil?: string }).stil === "clasic" ? "clasic" : "modern";

// Fonturile sunt locale (public/fonturi), cu subsetul latin-ext pentru ă, ș, ț.
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

const incarca = (family: string, fisier: string) =>
  Promise.all([
    loadFont({
      family,
      url: staticFile(`fonturi/${fisier}-latin-wght-normal.woff2`),
      weight: "100 900",
      unicodeRange: LATIN,
    }),
    loadFont({
      family,
      url: staticFile(`fonturi/${fisier}-latin-ext-wght-normal.woff2`),
      weight: "100 900",
      unicodeRange: LATIN_EXT,
    }),
  ]);

if (STIL === "clasic") {
  incarca("Playfair Display", "playfair-display");
} else {
  incarca("Unbounded", "unbounded");
}
incarca("Inter", "inter");

export const FONT_TITLU =
  STIL === "clasic" ? "'Playfair Display', Georgia, serif" : "Unbounded, Inter, sans-serif";
export const FONT_TEXT = "Inter, sans-serif";

/**
 * Grosimea titlurilor: Unbounded e gândit gros (700–800); serif-ul clasic arată
 * elegant la 600, iar la 800 devine apăsat. Tabelele din masuraText.ts sunt
 * măsurate exact pentru aceste grosimi.
 */
export const greutateTitlu = (modern: 700 | 800) => (STIL === "clasic" ? 600 : modern);

/** Cifre aliniate pe aceeași linie: Playfair are implicit cifre „vechi”, de înălțimi diferite. */
export const CIFRE_TITLU = "lining-nums tabular-nums";

// Paleta implicită; proiectul o poate suprascrie prin `culori`.
export const CULORI_IMPLICITE = {
  fundal: "#0B0F14",
  suprafata: "#141A22",
  text: "#F5F7FA",
  textSecundar: "#A9B4C2",
  principala: "#2F7CF6",
  accent: "#FFC23D",
};

// `lumina` (opțional): culoarea celei de-a doua lumini din fundal; implicit, un turcoaz rece derivat din `principala`.
export type Culori = typeof CULORI_IMPLICITE & { lumina?: string };

export const CuloriContext = createContext<Culori>(CULORI_IMPLICITE);
export const useCulori = () => useContext(CuloriContext);

/** Calea unui fișier: URL-urile http(s) rămân așa, restul sunt căi în public/. */
export const sursa = (cale: string) => (/^https?:\/\//i.test(cale) ? cale : staticFile(cale));

/**
 * Înălțimea rândului pentru titlurile în Unbounded. Virgula de sub ș/ț coboară
 * 0,33 em sub linia de bază, iar accentul lui Î/Ă/Â urcă la 0,98 em: la 1,05 ele
 * se ating între rânduri („DÍN”, „grădinițéi”). 1,2 lasă aer între virgulă și
 * rândul următor; titlurile scrise numai cu majuscule primesc puțin mai mult.
 */
export const inaltimeRandTitlu = (text: string) =>
  /\p{Lu}/u.test(text) && text === text.toLocaleUpperCase("ro-RO") ? 1.25 : 1.2;

/** O culoare a temei la o anumită opacitate (0–100), indiferent de formatul în care e scrisă. */
export const transparenta = (culoare: string, procent: number) =>
  `color-mix(in srgb, ${culoare} ${procent}%, transparent)`;

// Curbe de mișcare comune, ca toate scenele să „respire” la fel.
export const EASE_IESIRE = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_INTRARE_IESIRE = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * Dimensiuni relative la format. `u` = 1px pe un cadru lat de 1920 (orizontal)
 * sau de 1080 (vertical), ca textul să aibă aceeași greutate vizuală în ambele.
 *
 * `margineSus` / `margineJos`: zona sigură pentru textul important. În 9:16,
 * Reels/TikTok/Shorts își desenează sus antetul, iar jos legenda, numele contului
 * și butoanele, deci acolo marginile sunt mult mai mari decât `margineY`.
 * `margineDreaptaVerticala`: în 9:16, coloana de butoane din dreapta acoperă
 * ultimii ~120 px din jumătatea de jos; acolo nu punem numere sau titluri late.
 */
export const useFormat = () => {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const u = vertical ? width / 1080 : width / 1920;
  const margineY = (vertical ? 140 : 100) * u;
  return {
    vertical,
    u,
    latime: width,
    inaltime: height,
    margineX: (vertical ? 80 : 140) * u,
    margineY,
    margineSus: vertical ? 210 * u : margineY,
    margineJos: vertical ? 320 * u : margineY,
    margineDreaptaVerticala: 120 * u,
  };
};
