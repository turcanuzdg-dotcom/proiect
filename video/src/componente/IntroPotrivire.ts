/**
 * Potrivirea textului din scena Intro fără măsurători în DOM.
 *
 * `measureText()` din @remotion/layout-utils citește DOM-ul și memorează
 * rezultatul; la primul cadru fonturile locale încă se încarcă, iar valorile
 * greșite ar rămâne în cache. De aceea folosim lățimile reale ale glifelor
 * (avansul, în miimi de em), extrase o singură dată din fișierele woff2 cu
 * fontTools: Unbounded la greutatea 800 și Inter 600 (majuscule). Rezultatul
 * e determinist și identic la fiecare randare.
 */

const tabel = (caractere: string, latimi: string) => {
  const t = new Map<string, number>();
  const v = latimi.split(",").map(Number);
  Array.from(caractere).forEach((ch, i) => t.set(ch, v[i] / 1000));
  return t;
};

// Unbounded, wght 800 (mai lat decât 700, deci sigur pentru ambele).
const UNBOUNDED = tabel(
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~âîĂÂÎ„”“’–—·…«»éèöüäÉ€ășțȘȚşţŞŢ",
  "242,338,534,867,827,1321,961,291,410,410,542,620,316,377,314,472,935,536,850,850,880,817,867,769,905,867,339,340,620,620,620,722,1056,977,895,942,936,803,781,970,947,362,815,882,772,1255,983,970,825,971,863,857,829,884,951,1375,896,940,819,451,472,451,620,482,393,839,824,774,842,742,606,825,793,334,334,763,334,1226,805,801,824,824,569,767,619,792,788,1154,743,797,708,493,322,493,620,839,334,977,977,362,598,595,591,310,665,1216,320,902,769,769,742,742,801,792,839,803,878,839,767,619,857,829,767,619,857,829",
);

// Inter, wght 600, doar ce apare într-o etichetă scrisă cu majuscule.
const INTER_MAJUSCULE = tabel(
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`{|}~ÂÎ„”“’–—·…«»ÉÖÜÄ€ĂȘȚŞŢ",
  "252,321,523,644,650,1004,663,326,373,373,540,673,319,465,319,379,660,423,623,636,666,612,640,576,640,640,319,329,673,673,673,543,999,728,659,737,722,605,588,749,746,277,580,703,565,922,759,769,645,773,652,650,660,736,728,1020,720,713,652,373,379,373,481,469,351,455,359,455,673,728,277,480,501,507,294,500,1000,319,956,634,634,605,769,736,728,679,728,650,660,650,660",
);

/** Lățimea unui șir în em, cu spațierea literelor (em) adăugată după fiecare caracter. */
const latimeEm = (text: string, t: Map<string, number>, implicit: number, spatiere: number) =>
  Array.from(text).reduce((s, ch) => s + (t.get(ch) ?? implicit) + spatiere, 0);

// Marjă pentru kerning, rotunjiri și glifele lipsă din tabel.
const SIGURANTA = 1.04;

/** Câte rânduri ocupă cuvintele într-un rând flex de lățime `latime` (totul în em). */
const numaraRanduri = (cuvinte: number[], spatiu: number, latime: number) => {
  let randuri = 1;
  let curent = 0;
  for (const w of cuvinte) {
    const necesar = curent === 0 ? w : curent + w;
    if (necesar > latime && curent > 0) {
      randuri++;
      curent = w + spatiu;
    } else {
      curent = necesar + spatiu;
    }
  }
  return randuri;
};

/**
 * Cel mai mare corp de literă (px) la care titlul încape în `latime` px
 * pe cel mult `maxRanduri` rânduri, fără ca vreun cuvânt să depășească lățimea.
 * Spațiul dintre cuvinte e cel din TextAnimat (0,28 em).
 */
export const potrivesteTitlu = ({
  text,
  latime,
  maxim,
  minim,
  minimExtrem,
  maxRanduri,
  spatiereLitere = -0.02,
  spatiuCuvinte = 0.28,
}: {
  text: string;
  latime: number;
  maxim: number;
  minim: number;
  /** Folosit doar dacă un cuvânt foarte lung nu încape nici la `minim`. */
  minimExtrem: number;
  maxRanduri: number;
  spatiereLitere?: number;
  spatiuCuvinte?: number;
}): { marime: number; randuri: number } => {
  const cuvinte = text
    .split(/\s+/)
    .filter(Boolean)
    .map((c) => latimeEm(c, UNBOUNDED, 0.85, spatiereLitere) * SIGURANTA);
  if (cuvinte.length === 0) return { marime: maxim, randuri: 1 };
  const celMaiLung = Math.max(...cuvinte);

  const incearca = (de: number, panaLa: number, randuriPermise: number) => {
    for (let m = de; m >= panaLa; m -= 1) {
      const lat = latime / m;
      if (celMaiLung > lat) continue;
      const r = numaraRanduri(cuvinte, spatiuCuvinte, lat);
      if (r <= randuriPermise) return { marime: m, randuri: r };
    }
    return null;
  };

  // Cel mai mare corp permis; apoi, dacă un rând în minus costă puțin (sub 12%),
  // preferăm mai puține rânduri: „Parcul central, / renovat” arată mai bine decât trei rânduri.
  const cel = incearca(Math.floor(maxim), Math.ceil(minim), maxRanduri);
  if (cel) {
    for (let r = 1; r < cel.randuri; r++) {
      const mai = incearca(Math.floor(maxim), Math.ceil(minim), r);
      if (mai && mai.marime >= cel.marime * 0.88) return mai;
    }
    return cel;
  }
  const rezultat =
    incearca(Math.floor(minim), Math.ceil(minim), maxRanduri + 2) ??
    incearca(Math.floor(minim), Math.ceil(minimExtrem), maxRanduri + 2);
  if (rezultat) return rezultat;
  const m = Math.min(minim, latime / celMaiLung);
  return { marime: Math.max(1, Math.floor(m)), randuri: numaraRanduri(cuvinte, spatiuCuvinte, latime / m) };
};

/** Încape textul (Inter 600, majuscule) pe un rând de `latime` px? */
export const incapeEticheta = (text: string, marime: number, spatiere: number, latime: number) =>
  latimeEm(text.toLocaleUpperCase("ro-RO"), INTER_MAJUSCULE, 0.72, spatiere) * SIGURANTA * marime <= latime;

/**
 * Eticheta (Inter 600, majuscule) pe un singur rând: întâi strânge spațierea
 * literelor, apoi micșorează corpul; dacă tot nu încape, o lasă să se rupă.
 */
export const potrivesteEticheta = ({
  text,
  latime,
  marime,
  marimeMinima,
  spatiere,
  spatiereMinima,
}: {
  text: string;
  latime: number;
  marime: number;
  marimeMinima: number;
  spatiere: number;
  spatiereMinima: number;
}): { marime: number; spatiere: number; incape: boolean } => {
  const incape = (m: number, sp: number) => incapeEticheta(text, m, sp, latime);
  for (let sp = spatiere; sp >= spatiereMinima - 1e-6; sp -= 0.02) {
    if (incape(marime, sp)) return { marime, spatiere: sp, incape: true };
  }
  for (let m = marime; m >= marimeMinima; m -= 1) {
    if (incape(m, spatiereMinima)) return { marime: m, spatiere: spatiereMinima, incape: true };
  }
  return { marime: marimeMinima, spatiere: spatiereMinima, incape: false };
};
