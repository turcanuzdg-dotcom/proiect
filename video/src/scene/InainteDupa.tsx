import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ImagineMiscare } from "../componente/ImagineMiscare";
import { latimeEchilibrata, latimeEm, potrivesteTitlu } from "../componente/masuraText";
import { TextAnimat } from "../componente/TextAnimat";
import { sfarsitUtil, type ScenaInainteDupa } from "../date/tipuri";
import { EASE_IESIRE, FONT_TEXT, FONT_TITLU, inaltimeRandTitlu, transparenta, useCulori, useFormat } from "../tema";

/*
 * Scena „înainte / după”.
 *
 * Pornim pe fotografia „înainte”. O linie verticală cu un mâner rotund intră din
 * dreapta și descoperă fotografia „după” (clip-path), se oprește la ~35%, mai
 * alunecă puțin, apoi trece până la capăt și ieșim pe „după”, care rămâne pe ecran.
 * Ambele fotografii au exact aceeași mișcare de cameră, deci rămân suprapuse.
 * Etichetele „ÎNAINTE” (stânga) și „DUPĂ” (dreapta) aparțin fiecare fotografiei
 * lor: linia le taie și le descoperă. Ambele fotografii primesc același tratament
 * de culoare: comparația trebuie să fie cinstită.
 */

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Prima trecere vine din afara cadrului: pornire moale, oprire lungă. */
const EASE_PRIMA_TRECERE = Easing.bezier(0.33, 0, 0.12, 1);
/** A doua trecere: accelerează și iese din cadru încă în mișcare. */
const EASE_A_DOUA_TRECERE = Easing.bezier(0.6, 0, 0.3, 1);

/** Momentele scenei, în secunde, pentru o scenă de `T` secunde. */
const calendar = (T: number) => {
  // ritmul mișcării: 1 la durata implicită (6 s), comprimat la scenele scurte
  const k0 = Math.min(1.3, Math.max(0.5, (T - 0.6) / 5.4));
  const intrare0 = Math.min(1.0, 0.17 * T); // linia începe să intre
  const oprire0 = intrare0 + 1.0 * k0; // ajunge la ~35%
  // la scenele lungi, timpul în plus merge mai ales în momentul comparației
  const reluare0 = oprire0 + 0.65 * k0 + Math.max(0, T - 6) * 0.12; // pornește din nou
  const final0 = reluare0 + 1.25 * k0; // „după” e descoperită complet
  // „după” trebuie descoperită complet înainte de tranziția de ieșire: dacă scena e
  // prea scurtă pentru ritmul de bază, tot calendarul se comprimă proporțional
  const scara = Math.min(1, sfarsitUtil(T) / final0);
  const k = k0 * scara;
  // textele: puțin mai repede la scenele scurte, niciodată mai lent decât la 6 s
  const kText = Math.min(1, Math.max(0.6, T / 6));
  return {
    k,
    kText,
    intrare: intrare0 * scara,
    oprire: oprire0 * scara,
    reluare: reluare0 * scara,
    final: final0 * scara,
  };
};

/** Mărimea comună a etichetelor: amândouă încap pe lățimea zonei sigure. */
export type StilEticheta = { marime: number; spatiere: number; latimeMax: number; doiRanduri: boolean };

/* ------------------------------------------------------------------ */
/* Eticheta „ÎNAINTE” / „DUPĂ”                                          */
/* ------------------------------------------------------------------ */

const Eticheta: React.FC<{
  text: string;
  latura: "stanga" | "dreapta";
  /** poziția liniei, în px de la stânga cadrului */
  x: number;
  punct: string;
  plin?: boolean;
  opacitate: number;
  ridicare: number;
  stilText: StilEticheta;
}> = ({ text, latura, x, punct, plin = false, opacitate, ridicare, stilText }) => {
  const c = useCulori();
  const f = useFormat();
  const u = f.u;
  const { marime, spatiere } = stilText;
  const stanga = latura === "stanga";

  // Eticheta e tăiată de linie în coordonatele ei: știm doar marginea fixă
  // (stânga pentru „ÎNAINTE”, dreapta pentru „DUPĂ”), iar lățimea o dă `100%`.
  const margineFixa = stanga ? f.margineX : f.latime - f.margineX;
  const vizibil = stanga ? x - margineFixa : margineFixa - x;
  const taiere = `max(0px, calc(100% - ${Math.max(0, vizibil)}px))`;

  const stil: CSSProperties = {
    position: "absolute",
    // în 9:16 deasupra zonei acoperite de legenda și butoanele aplicațiilor
    bottom: f.margineJos,
    [stanga ? "left" : "right"]: f.margineX,
    maxWidth: stilText.latimeMax,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    gap: 18 * u,
    padding: `${(f.vertical ? 24 : 22) * u}px ${(f.vertical ? 38 : 34) * u}px ${(f.vertical ? 24 : 22) * u}px ${(f.vertical ? 32 : 28) * u}px`,
    borderRadius: stilText.doiRanduri ? 36 * u : 999,
    background: `linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)), linear-gradient(${transparenta(c.fundal, 42)}, ${transparenta(c.fundal, 42)})`,
    backdropFilter: `blur(${24 * u}px) saturate(140%)`,
    WebkitBackdropFilter: `blur(${24 * u}px) saturate(140%)`,
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
    clipPath: stanga ? `inset(0 ${taiere} 0 0)` : `inset(0 0 0 ${taiere})`,
    opacity: opacitate,
    translate: `0 ${ridicare}px`,
  };

  return (
    <div style={stil}>
      {/* „înainte” = cerc gol, „după” = cerc plin, în culoarea de accent */}
      <div
        style={{
          width: 14 * u,
          height: 14 * u,
          borderRadius: 999,
          boxSizing: "border-box",
          backgroundColor: plin ? punct : "transparent",
          border: plin ? undefined : `${Math.max(1, 2.5 * u)}px solid ${punct}`,
          boxShadow: plin ? `0 0 ${14 * u}px ${transparenta(punct, 70)}` : undefined,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontFamily: FONT_TEXT,
          fontWeight: 600,
          fontSize: marime,
          lineHeight: stilText.doiRanduri ? 1.2 : 1,
          letterSpacing: `${spatiere}em`,
          // spațierea se adaugă și după ultima literă; o compensăm ca textul să stea centrat
          marginRight: `${-spatiere}em`,
          // loc pentru accentele de sus (Î, Ă)
          paddingTop: "0.08em",
          color: c.text,
          whiteSpace: stilText.doiRanduri ? "normal" : "nowrap",
          minWidth: 0,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Mânerul liniei                                                      */
/* ------------------------------------------------------------------ */

const Maner: React.FC<{ marime: number; puls: number }> = ({ marime, puls }) => {
  const c = useCulori();
  const f = useFormat();
  const u = f.u;
  return (
    <div style={{ position: "relative", width: marime, height: marime }}>
      {/* un singur inel care se stinge în timpul pauzei: „aici se trage” */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          border: `${Math.max(1, 2 * u)}px solid ${c.accent}`,
          scale: 1 + 0.9 * puls,
          opacity: puls > 0 && puls < 1 ? 0.55 * (1 - puls) : 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          backgroundColor: c.accent,
          boxShadow: `0 0 0 ${6 * u}px ${transparenta(c.accent, 22)}, 0 ${10 * u}px ${34 * u}px rgba(0,0,0,0.38)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={marime * 0.56} height={marime * 0.56} viewBox="0 0 24 24" fill="none">
          <path
            d="M9.5 6.5 4 12l5.5 5.5M14.5 6.5 20 12l-5.5 5.5"
            stroke={c.fundal}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Scena                                                               */
/* ------------------------------------------------------------------ */

export const InainteDupa: React.FC<{ scena: ScenaInainteDupa }> = ({ scena }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const c = useCulori();
  const f = useFormat();
  const { u, vertical, latime, inaltime } = f;

  const T = durationInFrames / fps;
  const timp = calendar(T);
  const s = (secunde: number) => secunde * fps;

  // ——— Linia: poziția în px de la stânga cadrului ———
  const marimeManer = (vertical ? 92 : 80) * u;
  const xStart = latime + marimeManer; // în afara cadrului, la dreapta
  const xOprire = latime * (vertical ? 0.6 : 0.65);
  const xAlunecare = xOprire - latime * 0.025;
  const xFinal = -marimeManer * 1.4; // iese complet din cadru, la stânga

  const pozitie = (fr: number) => {
    if (fr < s(timp.oprire)) {
      return interpolate(fr, [s(timp.intrare), s(timp.oprire)], [xStart, xOprire], {
        ...CLAMP,
        easing: EASE_PRIMA_TRECERE,
      });
    }
    if (fr < s(timp.reluare)) {
      // nu stă înghețată: alunecă încet, ca împinsă de o mână
      return interpolate(fr, [s(timp.oprire), s(timp.reluare)], [xOprire, xAlunecare], {
        ...CLAMP,
        easing: Easing.inOut(Easing.sin),
      });
    }
    return interpolate(fr, [s(timp.reluare), s(timp.final)], [xAlunecare, xFinal], {
      ...CLAMP,
      easing: EASE_A_DOUA_TRECERE,
    });
  };
  const x = pozitie(frame);
  const xTaiere = Math.min(latime, Math.max(0, x));
  const viteza = x - pozitie(frame - 1); // px pe cadru; negativ = spre stânga

  // ——— Camera: aceeași pentru ambele fotografii ———
  const directie = vertical ? "stanga" : "centru";
  const zoom: [number, number] = [1.04, 1.11];

  // ——— Titlul ———
  const titlu = scena.titlu?.trim() || null;
  const latimeTitlu = vertical ? latime - 2 * f.margineX : Math.min(1560 * u, latime - 2 * f.margineX);
  const asezare = titlu
    ? potrivesteTitlu({
        text: titlu,
        latime: latimeTitlu,
        maxim: (vertical ? 112 : 104) * u,
        minim: 84 * u,
        minimExtrem: 60 * u,
        maxRanduri: vertical ? 3 : 2,
        preferaRanduri: true,
        prag: 0.88,
      })
    : null;
  const latimeTitluEchilibrata =
    titlu && asezare
      ? latimeEchilibrata({ text: titlu, font: "titlu", marime: asezare.marime, latime: latimeTitlu, spatiere: -0.02 })
      : latimeTitlu;
  const nrCuvinte = titlu ? titlu.split(/\s+/).filter(Boolean).length : 0;
  const pasTitlu = (nrCuvinte > 1 ? Math.min(0.07, 0.5 / (nrCuvinte - 1)) : 0) * timp.kText;
  const startTitlu = 0.3 * timp.kText;
  const inaltimeRand = titlu ? inaltimeRandTitlu(titlu) : 1.2;
  const inaltimeTitlu = asezare ? asezare.randuri * asezare.marime * inaltimeRand : 0;
  // după intrare, titlul urcă foarte lent (paralaxă față de fotografie); pornește cu
  // 10u mai jos, ca la capăt să fie exact pe marginea sigură de sus
  const derivaTitlu = interpolate(
    frame,
    [Math.min(s(1.4 * timp.kText), durationInFrames - 1), durationInFrames],
    [10 * u, 0],
    CLAMP,
  );

  // ——— Etichetele ———
  const intrareInainte = interpolate(frame, [s(0.35 * timp.kText), s(1.15 * timp.kText)], [0, 1], {
    ...CLAMP,
    easing: EASE_IESIRE,
  });
  // etichetele pot fi înlocuite din date (de ex. „2023” / „2026”); lățimea capsulei, pentru stingere
  const textInainte = (scena.etichetaInainte?.trim() || "Înainte").toLocaleUpperCase("ro-RO");
  const textDupa = (scena.etichetaDupa?.trim() || "După").toLocaleUpperCase("ro-RO");
  // Mărimea etichetelor: 40u; dacă textul (de ex. „Înainte de începerea lucrărilor”) nu
  // încape în zona sigură, întâi se strânge spațierea, apoi scade corpul până la 28u,
  // iar la nevoie trece pe două rânduri. Ambele etichete primesc aceeași mărime.
  const latimeMaxCapsula = latime - 2 * f.margineX;
  const latimeCapsula = (text: string, marime = stilEticheta.marime, spatiere = stilEticheta.spatiere) =>
    (vertical ? 70 + 32 : 62 + 32) * u + (latimeEm(text, "textSemibold", { spatiere }) - spatiere) * marime;
  const stilEticheta: StilEticheta = (() => {
    const lat = (m: number, sp: number) =>
      Math.max(latimeCapsula(textInainte, m, sp), latimeCapsula(textDupa, m, sp));
    const m0 = 40 * u;
    for (let sp = 0.16; sp >= 0.06 - 1e-6; sp -= 0.02) {
      if (lat(m0, sp) <= latimeMaxCapsula) return { marime: m0, spatiere: sp, latimeMax: latimeMaxCapsula, doiRanduri: false };
    }
    for (let m = m0; m >= 28 * u; m -= u) {
      if (lat(m, 0.06) <= latimeMaxCapsula) return { marime: m, spatiere: 0.06, latimeMax: latimeMaxCapsula, doiRanduri: false };
    }
    return { marime: 32 * u, spatiere: 0.06, latimeMax: latimeMaxCapsula, doiRanduri: true };
  })();
  const latimeInainte = Math.min(latimeMaxCapsula, latimeCapsula(textInainte));
  const stingereInainte = interpolate(x, [f.margineX + 40 * u, f.margineX + latimeInainte + 180 * u], [0, 1], CLAMP);

  const margineDupa = latime - f.margineX;
  const latimeDupa = Math.min(latimeMaxCapsula, latimeCapsula(textDupa));
  // linia merge spre stânga: cu cât x e mai mic, cu atât eticheta e mai prezentă
  const intrareDupa = interpolate(x, [margineDupa - latimeDupa - 150 * u, margineDupa + 20 * u], [1, 0], {
    ...CLAMP,
    easing: EASE_IESIRE,
  });

  // ——— Mânerul ———
  const puls = interpolate(frame, [s(timp.oprire - 0.15 * timp.k), s(timp.oprire + 0.75 * timp.k)], [0, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.cubic),
  });
  const latimeLinie = Math.max(2, 4 * u);
  // dâră de lumină în urma liniei, proporțională cu viteza (un fel de motion blur)
  const vitezaRelativa = Math.min(1, Math.abs(viteza) / (32 * u));
  const latimeDara = Math.min(360 * u, Math.abs(viteza) * 7);
  const luminaDara = `color-mix(in srgb, ${c.accent} 30%, white)`;

  return (
    <AbsoluteFill style={{ backgroundColor: c.fundal, overflow: "hidden" }}>
      {/* Fotografiile */}
      <AbsoluteFill>
        <ImagineMiscare src={scena.inainte} directie={directie} zoom={zoom} />
      </AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${xTaiere}px)` }}>
        <ImagineMiscare src={scena.dupa} directie={directie} zoom={zoom} />
      </AbsoluteFill>

      {/* Dâra de lumină, pe partea „după” */}
      {latimeDara > 1 ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: viteza < 0 ? x : x - latimeDara,
            width: latimeDara,
            background: `linear-gradient(${viteza < 0 ? "to right" : "to left"}, ${transparenta(luminaDara, 16 * vitezaRelativa)}, ${transparenta(luminaDara, 0)})`,
            mixBlendMode: "screen",
          }}
        />
      ) : null}

      {/* Vignetă și umbre pentru lizibilitate (aceleași peste ambele fotografii) */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 85% 75% at 50% 48%, rgba(0,0,0,0) 55%, ${transparenta(c.fundal, 45)} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          top: "auto",
          height: (vertical ? 620 : 380) * u,
          background: `linear-gradient(to top, ${transparenta(c.fundal, 62)} 0%, ${transparenta(c.fundal, 30)} 45%, ${transparenta(c.fundal, 0)} 100%)`,
        }}
      />
      {titlu ? (
        <AbsoluteFill
          style={{
            bottom: "auto",
            height: f.margineSus + inaltimeTitlu + (vertical ? 340 : 260) * u,
            background: `linear-gradient(to bottom, ${transparenta(c.fundal, 76)} 0%, ${transparenta(c.fundal, 56)} 35%, ${transparenta(c.fundal, 24)} 70%, ${transparenta(c.fundal, 0)} 100%)`,
          }}
        />
      ) : (
        // fără titlu: doar o umbră discretă sus, ca baza cinematică să rămână aceeași
        <AbsoluteFill
          style={{
            bottom: "auto",
            height: (vertical ? 520 : 340) * u,
            background: `linear-gradient(to bottom, ${transparenta(c.fundal, 42)} 0%, ${transparenta(c.fundal, 16)} 50%, ${transparenta(c.fundal, 0)} 100%)`,
          }}
        />
      )}

      {/* Etichetele, tăiate de linie */}
      <Eticheta
        text={textInainte}
        latura="stanga"
        x={x}
        punct={c.textSecundar}
        opacitate={intrareInainte * stingereInainte}
        ridicare={(1 - intrareInainte) * 18 * u}
        stilText={stilEticheta}
      />
      <Eticheta
        text={textDupa}
        latura="dreapta"
        x={x}
        punct={c.accent}
        plin
        opacitate={intrareDupa}
        ridicare={(1 - intrareDupa) * 18 * u}
        stilText={stilEticheta}
      />

      {/* Linia și mânerul */}
      {x > -marimeManer && x < latime + marimeManer ? (
        <>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: x - latimeLinie / 2,
              width: latimeLinie,
              backgroundColor: c.text,
              boxShadow: `0 0 ${18 * u}px rgba(0,0,0,0.35), 0 0 ${3 * u}px rgba(0,0,0,0.25)`,
              // în dreptul titlului linia se retrage, ca să nu taie literele
              maskImage: titlu
                ? `linear-gradient(to bottom, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0.3) ${f.margineSus + inaltimeTitlu}px, black ${f.margineSus + inaltimeTitlu + 140 * u}px)`
                : undefined,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: x - marimeManer / 2,
              top: inaltime * 0.5 - marimeManer / 2,
            }}
          >
            <Maner marime={marimeManer} puls={puls} />
          </div>
        </>
      ) : null}

      {/* Titlul */}
      {titlu && asezare ? (
        <div
          style={{
            position: "absolute",
            left: f.margineX,
            // în 9:16 sub antetul aplicațiilor
            top: f.margineSus,
            translate: `0 ${derivaTitlu}px`,
            // umbra pe tot blocul (pe cuvinte ar fi tăiată de măștile din TextAnimat)
            filter: `drop-shadow(0 ${2 * u}px ${18 * u}px ${transparenta(c.fundal, 40)})`,
          }}
        >
          <TextAnimat
            text={titlu}
            start={startTitlu}
            pas={pasTitlu}
            durata={0.9 * timp.kText}
            style={{
              maxWidth: latimeTitluEchilibrata,
              fontFamily: FONT_TITLU,
              fontWeight: 800,
              fontSize: asezare.marime,
              lineHeight: inaltimeRand,
              letterSpacing: "-0.02em",
              color: c.text,
            }}
          />
        </div>
      ) : null}

    </AbsoluteFill>
  );
};
