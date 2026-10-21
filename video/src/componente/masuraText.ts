import { STIL } from "../tema";

/**
 * Măsurarea textului fără DOM, comună tuturor scenelor.
 *
 * `measureText()` din @remotion/layout-utils citește DOM-ul și memorează
 * rezultatul; la primul cadru fonturile locale încă se pot încărca, iar
 * lățimile greșite ar rămâne în cache. Folosim avansul real al glifelor, în
 * miimi de em, extras o singură dată cu fontTools din fișierele woff2 din
 * public/fonturi: Unbounded 800 (sigur și pentru 700), Playfair Display 600
 * (stilul „clasic”, cu cifrele `lnum`), Inter 500 și 600.
 * Rezultatul e determinist și identic la fiecare randare.
 *
 * Dacă se schimbă fonturile sau greutățile din tema.ts, tabelele de mai jos se
 * regenerează (fontTools: `TTFont(woff2).getBestCmap()` + `hmtx`, cu instanțierea
 * axei `wght`), pentru aceleași caractere din `CARACTERE`.
 *
 * Spațiul dintre cuvinte e cel din TextAnimat: `columnGap` de 0,28 em, care nu
 * ocupă loc la capăt de rând.
 */

const CARACTERE =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ăâîșțĂÂÎȘȚşţŞŢ„”“’‘–—·…«»²³°€éèöüäÉ×";

const tabel = (latimi: string) => {
  const t = new Map<string, number>();
  const v = latimi.split(",").map(Number);
  Array.from(CARACTERE).forEach((ch, i) => t.set(ch, v[i] / 1000));
  return t;
};

const UNBOUNDED_800 = tabel(
  "242,338,534,867,827,1321,961,291,410,410,542,620,316,377,314,472,935,536,850,850,880,817,867,769,905,867,339,340,620,620,620,722,1056,977,895,942,936,803,781,970,947,362,815,882,772,1255,983,970,825,971,863,857,829,884,951,1375,896,940,819,451,472,451,620,482,393,839,824,774,842,742,606,825,793,334,334,763,334,1226,805,801,824,824,569,767,619,792,788,1154,743,797,708,493,322,493,620,839,839,334,767,619,977,977,362,857,829,767,619,857,829,598,595,591,310,306,665,1216,320,902,769,769,545,591,487,878,742,742,801,792,839,803,620",
);

const PLAYFAIR_600 = tabel(
  "239,280,346,626,557,733,877,202,310,310,484,578,268,487,264,370,637,379,525,551,547,521,591,495,580,591,282,293,604,639,604,491,882,655,655,700,758,625,585,724,786,364,352,695,603,909,716,775,622,775,677,569,652,686,655,947,672,612,599,314,370,314,531,591,291,511,578,493,592,505,345,545,602,308,287,574,303,899,608,559,593,578,459,457,352,597,501,781,530,514,474,324,243,324,662,511,511,308,457,352,655,655,364,569,652,457,352,569,652,462,444,449,250,255,592,884,274,825,547,546,346,328,319,621,505,505,559,597,511,625,499",
);

const INTER_500 = tabel(
  "267,304,494,639,646,993,653,313,369,369,521,667,303,462,303,370,646,415,616,627,656,603,630,571,629,630,303,315,667,667,667,527,982,709,657,733,722,603,589,748,745,272,575,688,565,913,756,767,642,769,648,646,653,740,709,1003,701,696,641,369,370,369,477,463,337,568,618,577,618,587,379,620,602,252,252,559,252,888,602,604,618,618,387,539,340,602,575,829,557,575,559,440,346,440,667,568,568,252,539,340,709,709,272,646,653,539,340,646,653,451,471,474,277,277,500,1000,303,910,608,608,448,455,457,672,587,587,604,602,568,603,667",
);

const INTER_600 = tabel(
  "252,321,523,644,650,1004,663,326,373,373,540,673,319,465,319,379,660,423,623,636,666,612,640,576,640,640,319,329,673,673,673,543,999,728,659,737,722,605,588,749,746,277,580,703,565,922,759,769,645,773,652,650,660,736,728,1020,720,713,652,373,379,373,481,469,351,574,624,583,624,591,389,625,612,262,262,569,262,900,612,609,624,624,397,549,353,612,587,839,569,588,566,455,359,455,673,574,574,262,549,353,728,728,277,650,660,549,353,650,660,480,501,507,294,294,500,1000,319,956,634,634,454,463,458,679,591,591,609,612,574,605,673",
);

export type FontMasura = "titlu" | "text" | "textSemibold";

const TABELE: Record<FontMasura, { t: Map<string, number>; implicit: number }> = {
  titlu: STIL === "clasic" ? { t: PLAYFAIR_600, implicit: 0.65 } : { t: UNBOUNDED_800, implicit: 0.9 },
  text: { t: INTER_500, implicit: 0.65 },
  textSemibold: { t: INTER_600, implicit: 0.68 },
};

/**
 * Avansul cifrelor tabulare din Unbounded (`tnum`), identic pentru 0–9.
 * Playfair nu are `tnum`: luăm cea mai lată cifră `lnum` (0), ca măsura să nu fie depășită.
 */
export const CIFRA_TABULARA_EM = STIL === "clasic" ? 0.637 : 0.78;

/** Spațiul dintre cuvinte din TextAnimat, în em. */
export const SPATIU_CUVINTE = 0.28;

// Marjă pentru kerning, rotunjiri și glife lipsă din tabel.
const SIGURANTA = 1.04;

const latimeCaracter = (t: Map<string, number>, ch: string, implicit: number) =>
  t.get(ch) ?? t.get(ch.normalize("NFD")[0]) ?? implicit;

/** Lățimea unui șir în em (cu spațierea literelor, în em, după fiecare caracter). */
export const latimeEm = (
  text: string,
  font: FontMasura,
  { spatiere = 0, cifreTabulare = false }: { spatiere?: number; cifreTabulare?: boolean } = {},
) => {
  const { t, implicit } = TABELE[font];
  let s = 0;
  for (const ch of Array.from(text)) {
    const w = cifreTabulare && ch >= "0" && ch <= "9" ? CIFRA_TABULARA_EM : latimeCaracter(t, ch, implicit);
    s += w + spatiere;
  }
  return s * SIGURANTA;
};

const cuvinteDin = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * Câte rânduri ocupă un text pus cu TextAnimat într-o lățime dată (px), cu
 * încadrare lacomă, ca în browser. Întoarce și cel mai lat cuvânt și cel mai lat rând.
 */
export const randuriText = ({
  text,
  font,
  marime,
  latime,
  spatiere = 0,
  spatiuCuvinte = SPATIU_CUVINTE,
}: {
  text: string;
  font: FontMasura;
  marime: number;
  latime: number;
  spatiere?: number;
  spatiuCuvinte?: number;
}) => {
  const cuvinte = cuvinteDin(text).map((c) => latimeEm(c, font, { spatiere }) * marime);
  const spatiu = spatiuCuvinte * marime;
  let randuri = cuvinte.length ? 1 : 0;
  let curent = -1; // -1 = rând gol
  let celMaiLatRand = 0;
  for (const w of cuvinte) {
    if (curent < 0) {
      curent = w;
    } else if (curent + spatiu + w > latime) {
      celMaiLatRand = Math.max(celMaiLatRand, curent);
      randuri++;
      curent = w;
    } else {
      curent += spatiu + w;
    }
  }
  celMaiLatRand = Math.max(celMaiLatRand, curent, 0);
  return { randuri, celMaiLung: cuvinte.length ? Math.max(...cuvinte) : 0, celMaiLatRand };
};

/**
 * Cel mai mare corp (px) la care titlul încape în `latime` pe cel mult
 * `maxRanduri` rânduri, fără ca vreun cuvânt să depășească lățimea.
 * Dacă un rând în minus costă puțin (corpul scade cel mult până la `prag`), îl preferă:
 * „Parcul central, / renovat” arată mai bine decât trei rânduri.
 * Dacă nu încape nici la `minim`:
 * - `preferaRanduri`: întâi mai multe rânduri (până la +2) la `minim`, apoi un corp
 *   mai mic, spre `minimExtrem` (titlurile principale rămân mari);
 * - altfel: întâi un corp mai mic pe același număr de rânduri, apoi rânduri în plus
 *   (titlurile secundare rămân compacte, ca restul scenei să aibă loc).
 */
export const potrivesteTitlu = ({
  text,
  latime,
  maxim,
  minim,
  minimExtrem,
  maxRanduri,
  preferaRanduri = false,
  prag = 0.9,
  font = "titlu",
  spatiere = -0.02,
}: {
  text: string;
  latime: number;
  maxim: number;
  minim: number;
  minimExtrem: number;
  maxRanduri: number;
  preferaRanduri?: boolean;
  prag?: number;
  font?: FontMasura;
  spatiere?: number;
}): { marime: number; randuri: number } => {
  const masoara = (m: number) => randuriText({ text, font, marime: m, latime, spatiere });
  const incearca = (de: number, panaLa: number, permise: number) => {
    for (let m = Math.floor(de); m >= Math.ceil(panaLa); m -= 1) {
      const r = masoara(m);
      if (r.celMaiLung <= latime && r.randuri <= permise) return { marime: m, randuri: r.randuri };
    }
    return null;
  };
  if (cuvinteDin(text).length === 0) return { marime: Math.floor(maxim), randuri: 1 };

  const cel = incearca(maxim, minim, maxRanduri);
  if (cel) {
    for (let r = 1; r < cel.randuri; r++) {
      const mai = incearca(maxim, minim, r);
      if (mai && mai.marime >= cel.marime * prag) return mai;
    }
    return cel;
  }
  if (preferaRanduri) {
    const rezerva = incearca(minim, minim, maxRanduri + 2) ?? incearca(minim, minimExtrem, maxRanduri + 2);
    if (rezerva) return rezerva;
  } else {
    for (let extra = 0; extra <= 2; extra++) {
      const rezerva = incearca(minim, minimExtrem, maxRanduri + extra);
      if (rezerva) return rezerva;
    }
  }
  // un singur cuvânt uriaș: îl micșorăm cât să încapă pe lățime
  const r = masoara(minimExtrem);
  const m = Math.max(1, Math.floor(Math.min(minimExtrem, (minimExtrem * latime) / Math.max(1, r.celMaiLung))));
  return { marime: m, randuri: masoara(m).randuri };
};

/** Cel mai mare corp (între `minim` și `maxim`) la care textul încape pe un rând. */
export const potrivesteRand = ({
  text,
  font,
  latime,
  maxim,
  minim,
  spatiere = 0,
}: {
  text: string;
  font: FontMasura;
  latime: number;
  maxim: number;
  minim: number;
  spatiere?: number;
}) => {
  const em = latimeEm(text, font, { spatiere });
  return Math.max(minim, Math.min(maxim, latime / Math.max(0.001, em)));
};

/** Încape textul pe un rând de `latime` px? */
export const incapePeRand = (text: string, font: FontMasura, marime: number, spatiere: number, latime: number) =>
  latimeEm(text, font, { spatiere }) * marime <= latime;

/**
 * Împarte textul în exact `linii` rânduri cât mai egale (minimizează rândul cel
 * mai lat), ca un titlu să nu rămână cu un cuvânt singur pe ultimul rând.
 */
export const imparteEchilibrat = ({
  text,
  font,
  marime,
  linii,
  spatiere = 0,
  spatiuCuvinte = SPATIU_CUVINTE,
}: {
  text: string;
  font: FontMasura;
  marime: number;
  linii: number;
  spatiere?: number;
  spatiuCuvinte?: number;
}): string[] => {
  const cuvinte = cuvinteDin(text);
  const n = cuvinte.length;
  if (n === 0) return [];
  const L = Math.max(1, Math.min(linii, n));
  const w = cuvinte.map((c) => latimeEm(c, font, { spatiere }) * marime);
  const sp = spatiuCuvinte * marime;
  const prefix = [0];
  for (const x of w) prefix.push(prefix[prefix.length - 1] + x);
  const lat = (i: number, j: number) => prefix[j] - prefix[i] + sp * (j - i - 1);

  // dp[k][j] = cel mai mic „rând maxim” pentru primele j cuvinte în k rânduri
  const dp: number[][] = Array.from({ length: L + 1 }, () => new Array(n + 1).fill(Infinity));
  const taie: number[][] = Array.from({ length: L + 1 }, () => new Array(n + 1).fill(0));
  dp[0][0] = 0;
  for (let k = 1; k <= L; k++) {
    for (let j = k; j <= n; j++) {
      for (let i = k - 1; i < j; i++) {
        // la egalitate preferăm rânduri de sus mai scurte
        const v = Math.max(dp[k - 1][i], lat(i, j));
        if (v < dp[k][j] - 1e-6) {
          dp[k][j] = v;
          taie[k][j] = i;
        }
      }
    }
  }
  const rezultat: string[] = [];
  let j = n;
  for (let k = L; k >= 1; k--) {
    const i = taie[k][j];
    rezultat.unshift(cuvinte.slice(i, j).join(" "));
    j = i;
  }
  return rezultat;
};

/**
 * Cea mai îngustă coloană (px) în care textul rămâne pe același număr de rânduri
 * ca în `latime`: rânduri echilibrate, fără un cuvânt singur pe ultimul rând, și
 * un panou care îmbracă textul fără gol în dreapta.
 */
export const latimeEchilibrata = ({
  text,
  font,
  marime,
  latime,
  spatiere = 0,
  spatiuCuvinte = SPATIU_CUVINTE,
}: {
  text: string;
  font: FontMasura;
  marime: number;
  latime: number;
  spatiere?: number;
  spatiuCuvinte?: number;
}) => {
  const { randuri } = randuriText({ text, font, marime, latime, spatiere, spatiuCuvinte });
  if (randuri <= 1) return latime;
  const linii = imparteEchilibrat({ text, font, marime, linii: randuri, spatiere, spatiuCuvinte });
  const celMaiLat = Math.max(
    ...linii.map((l) => randuriText({ text: l, font, marime, latime: Infinity, spatiere, spatiuCuvinte }).celMaiLatRand),
  );
  // o mică rezervă: browserul nu trebuie să mute un cuvânt pe un rând în plus
  return Math.min(latime, celMaiLat * 1.015 + 1);
};

/**
 * Evită un cuvânt scurt singur pe ultimul rând („Țânțăreni, / 2026”): dacă ultimul
 * rând are un singur cuvânt de cel mult `maxCaractere` și rândul de dinainte are mai
 * multe, coboară ultimul cuvânt al acestuia, cât timp noul rând încape în `latime`.
 */
export const evitaCuvantSingur = ({
  linii,
  font,
  marime,
  latime,
  spatiere = 0,
  spatiuCuvinte = SPATIU_CUVINTE,
  maxCaractere = 6,
}: {
  linii: string[];
  font: FontMasura;
  marime: number;
  latime: number;
  spatiere?: number;
  spatiuCuvinte?: number;
  maxCaractere?: number;
}): string[] => {
  if (linii.length < 2) return linii;
  const ultim = cuvinteDin(linii[linii.length - 1]);
  const penultim = cuvinteDin(linii[linii.length - 2]);
  if (ultim.length !== 1 || ultim[0].length > maxCaractere || penultim.length < 2) return linii;
  const nou = `${penultim[penultim.length - 1]} ${ultim[0]}`;
  const lat = randuriText({ text: nou, font, marime, latime: Infinity, spatiere, spatiuCuvinte }).celMaiLatRand;
  if (lat > latime) return linii;
  return [...linii.slice(0, -2), penultim.slice(0, -1).join(" "), nou];
};
