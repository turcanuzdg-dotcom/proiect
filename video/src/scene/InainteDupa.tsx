import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Granulatie } from "../componente/Fundal";
import { ImagineMiscare } from "../componente/ImagineMiscare";
import { potrivesteTitlu } from "../componente/IntroPotrivire";
import { TextAnimat } from "../componente/TextAnimat";
import type { ScenaInainteDupa } from "../date/tipuri";
import { EASE_IESIRE, FONT_TEXT, FONT_TITLU, useCulori, useFormat } from "../tema";

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

const transparenta = (culoare: string, procent: number) =>
  `color-mix(in srgb, ${culoare} ${procent}%, transparent)`;

/** Momentele scenei, în secunde, pentru o scenă de `T` secunde. */
const calendar = (T: number) => {
  // ritmul mișcării: 1 la durata implicită (6 s), comprimat la scenele scurte
  const k = Math.min(1.5, Math.max(0.5, (T - 0.6) / 5.4));
  const intrare = Math.min(1.0, 0.17 * T); // linia începe să intre
  const oprire = intrare + 1.0 * k; // ajunge la ~35%
  const reluare = oprire + 0.65 * k; // pornește din nou
  const final = reluare + 1.25 * k; // „după” e descoperită complet
  // textele: puțin mai repede la scenele scurte, niciodată mai lent decât la 6 s
  const kText = Math.min(1, Math.max(0.6, T / 6));
  return { k, kText, intrare, oprire, reluare, final };
};

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
}> = ({ text, latura, x, punct, plin = false, opacitate, ridicare }) => {
  const c = useCulori();
  const f = useFormat();
  const u = f.u;
  const marime = (f.vertical ? 40 : 36) * u;
  const stanga = latura === "stanga";

  // Eticheta e tăiată de linie în coordonatele ei: știm doar marginea fixă
  // (stânga pentru „ÎNAINTE”, dreapta pentru „DUPĂ”), iar lățimea o dă `100%`.
  const margineFixa = stanga ? f.margineX : f.latime - f.margineX;
  const vizibil = stanga ? x - margineFixa : margineFixa - x;
  const taiere = `max(0px, calc(100% - ${Math.max(0, vizibil)}px))`;

  const stil: CSSProperties = {
    position: "absolute",
    bottom: f.vertical ? f.margineY + 90 * u : f.margineY,
    [stanga ? "left" : "right"]: f.margineX,
    display: "flex",
    alignItems: "center",
    gap: 18 * u,
    padding: `${(f.vertical ? 24 : 22) * u}px ${(f.vertical ? 38 : 34) * u}px ${(f.vertical ? 24 : 22) * u}px ${(f.vertical ? 32 : 28) * u}px`,
    borderRadius: 999,
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
          lineHeight: 1,
          letterSpacing: "0.16em",
          // spațierea se adaugă și după ultima literă; o compensăm ca textul să stea centrat
          marginRight: "-0.16em",
          // loc pentru accentele de sus (Î, Ă)
          paddingTop: "0.08em",
          color: c.text,
          whiteSpace: "nowrap",
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
      })
    : null;
  const nrCuvinte = titlu ? titlu.split(/\s+/).filter(Boolean).length : 0;
  const pasTitlu = (nrCuvinte > 1 ? Math.min(0.07, 0.5 / (nrCuvinte - 1)) : 0) * timp.kText;
  const startTitlu = 0.3 * timp.kText;
  const inaltimeTitlu = asezare ? asezare.randuri * asezare.marime * 1.05 : 0;
  // după intrare, titlul urcă foarte lent (paralaxă față de fotografie)
  const derivaTitlu = interpolate(frame, [s(1.4 * timp.kText), durationInFrames], [0, -10 * u], CLAMP);

  // ——— Etichetele ———
  const intrareInainte = interpolate(frame, [s(0.35 * timp.kText), s(1.15 * timp.kText)], [0, 1], {
    ...CLAMP,
    easing: EASE_IESIRE,
  });
  const latimeInainte = (vertical ? 290 : 270) * u; // estimare, doar pentru stingere
  const stingereInainte = interpolate(x, [f.margineX + 40 * u, f.margineX + latimeInainte + 180 * u], [0, 1], CLAMP);

  const margineDupa = latime - f.margineX;
  const latimeDupa = (vertical ? 210 : 200) * u;
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
            height: f.margineY + inaltimeTitlu + (vertical ? 340 : 260) * u,
            background: `linear-gradient(to bottom, ${transparenta(c.fundal, 76)} 0%, ${transparenta(c.fundal, 56)} 35%, ${transparenta(c.fundal, 24)} 70%, ${transparenta(c.fundal, 0)} 100%)`,
          }}
        />
      ) : null}

      {/* Etichetele, tăiate de linie */}
      <Eticheta
        text="ÎNAINTE"
        latura="stanga"
        x={x}
        punct={c.textSecundar}
        opacitate={intrareInainte * stingereInainte}
        ridicare={(1 - intrareInainte) * 18 * u}
      />
      <Eticheta
        text="DUPĂ"
        latura="dreapta"
        x={x}
        punct={c.accent}
        plin
        opacitate={intrareDupa}
        ridicare={(1 - intrareDupa) * 18 * u}
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
                ? `linear-gradient(to bottom, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0.3) ${f.margineY + inaltimeTitlu}px, black ${f.margineY + inaltimeTitlu + 140 * u}px)`
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
            top: f.margineY,
            translate: `0 ${derivaTitlu}px`,
          }}
        >
          <TextAnimat
            text={titlu}
            start={startTitlu}
            pas={pasTitlu}
            durata={0.9 * timp.kText}
            style={{
              maxWidth: latimeTitlu,
              fontFamily: FONT_TITLU,
              fontWeight: 800,
              fontSize: asezare.marime,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: c.text,
              textShadow: `0 ${2 * u}px ${28 * u}px ${transparenta(c.fundal, 35)}`,
            }}
          />
        </div>
      ) : null}

      <Granulatie opacitate={0.06} />
    </AbsoluteFill>
  );
};
