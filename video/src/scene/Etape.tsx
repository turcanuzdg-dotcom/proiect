import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { latimeEm, potrivesteTitlu, randuriText } from "../componente/masuraText";
import { Fundal } from "../componente/Fundal";
import { TextAnimat } from "../componente/TextAnimat";
import type { ScenaEtape } from "../date/tipuri";
import { EASE_IESIRE, EASE_INTRARE_IESIRE, FONT_TEXT, FONT_TITLU, transparenta, useCulori, useFormat } from "../tema";

const INALTIME_RAND_TEXT = 1.3;
const INALTIME_RAND_DATA = 1.25;
const SPATIERE_DATA = 0.12; // em, majuscule

/**
 * Etapele proiectului: o linie care se desenează pas cu pas; când ajunge la o
 * etapă, nodul ei apare, apoi data (accent, majuscule) și textul. Etapele deja
 * parcurse se estompează puțin cât timp apar celelalte, apoi toate revin la
 * lumină plină și rămân pe ecran.
 * 16:9: cronologie orizontală, cu numărul etapei mare deasupra liniei;
 * 9:16: cronologie verticală, fiecare etapă pe un panou de sticlă.
 */
export const Etape: React.FC<{ scena: ScenaEtape }> = ({ scena }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const c = useCulori();
  const f = useFormat();
  const { u, vertical } = f;

  const durata = durationInFrames / fps;
  const k = Math.min(1, Math.max(0.55, durata / 7));
  const progres = (de: number, la: number, easing = EASE_IESIRE) =>
    interpolate(frame, [de * fps, Math.max(de * fps + 1, la * fps)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing,
    });
  const deriva = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const etape = scena.etape.slice(0, 5);
  const n = etape.length;
  const textTitlu = scena.titlu?.trim() || null;
  const dateText = etape.map(
    (e) => e.data?.trim().toLocaleUpperCase("ro-RO") ?? "",
  );
  const auDate = dateText.some(Boolean);

  // ——— Dimensiuni ———
  const latimeContinut = f.latime - 2 * f.margineX;
  const inaltimeContinut = f.inaltime - 2 * f.margineY;

  const titlu = textTitlu
    ? potrivesteTitlu({
        text: textTitlu,
        latime: latimeContinut,
        maxim: (vertical ? 92 : 96) * u,
        minim: (vertical ? 72 : 76) * u,
        minimExtrem: (vertical ? 60 : 54) * u,
        maxRanduri: vertical ? 3 : 2,
      })
    : null;
  const inaltimeTitlu = titlu ? titlu.randuri * titlu.marime * 1.05 : 0;
  const spatiuTitlu = titlu ? (vertical ? 96 : 104) * u : 0;
  const inaltimeDisponibila = inaltimeContinut - inaltimeTitlu - spatiuTitlu;

  const marimeNod = (vertical ? 36 : 34) * u;
  const razaNod = marimeNod / 2;
  const grosimeLinie = Math.max(1, 3 * u);
  const spatiuColoane = (n >= 5 ? 44 : n === 4 ? 56 : 80) * u;
  const latimeColoana = vertical
    ? 0
    : (latimeContinut - spatiuColoane * (n - 1)) / Math.max(1, n);
  // 16:9: numărul mare al etapei, deasupra liniei
  const marimeNumar = vertical ? 0 : Math.min(150 * u, latimeColoana * 0.42);
  const spatiuSubNumar = 22 * u;
  const spatiuSubLinie = 40 * u;
  // 9:16: panourile de sticlă din dreapta liniei
  const indentPanou = marimeNod + 36 * u;
  const paddingPanou = (n >= 5 ? 28 : n === 4 ? 36 : 42) * u;
  const latimeText = vertical
    ? latimeContinut - indentPanou - 2 * paddingPanou
    : latimeColoana - 8 * u;
  const spatiuData = (vertical ? 12 : 16) * u;

  // Data: pe un singur rând, cât încape (majuscule, Inter 600).
  const latimeDataEm = Math.max(
    0,
    ...dateText.map((d) =>
      latimeEm(d, "textSemibold", { spatiere: SPATIERE_DATA }),
    ),
  );
  const marimeData = Math.max(
    20 * u,
    Math.min(
      (vertical ? 32 : 30) * u,
      latimeDataEm > 0 ? latimeText / latimeDataEm : Infinity,
    ),
  );
  const inaltimeRandData = marimeData * INALTIME_RAND_DATA;

  // Textul: cel mai mare corp la care încape fiecare cuvânt și tot blocul.
  const masoaraText = (marime: number) =>
    etape.map((e) =>
      randuriText({ text: e.text, font: "text", marime, latime: latimeText }),
    );
  const inaltimeEtapa = (marime: number, randuri: number, i: number) => {
    const text = randuri * marime * INALTIME_RAND_TEXT;
    if (vertical)
      return (
        2 * paddingPanou +
        (dateText[i] ? inaltimeRandData + spatiuData : 0) +
        text
      );
    return (auDate ? inaltimeRandData + spatiuData : 0) + text;
  };
  const spatiuMinimVertical = (n >= 5 ? 20 : 28) * u;
  const incapeText = (marime: number) => {
    const m = masoaraText(marime);
    if (m.some((r) => r.celMaiLung > latimeText)) return false;
    if (vertical) {
      const total =
        m.reduce((s, r, i) => s + inaltimeEtapa(marime, r.randuri, i), 0) +
        spatiuMinimVertical * (n - 1);
      return total <= inaltimeDisponibila;
    }
    const celMaiInalt = Math.max(
      0,
      ...m.map((r, i) => inaltimeEtapa(marime, r.randuri, i)),
    );
    return (
      marimeNumar * 0.86 +
        spatiuSubNumar +
        marimeNod +
        spatiuSubLinie +
        celMaiInalt <=
      inaltimeDisponibila
    );
  };
  // corpul de pornire, după numărul de etape (1–5)
  const corpText = vertical ? [54, 54, 50, 48, 44] : [52, 52, 48, 44, 40];
  let marimeText = corpText[Math.min(4, Math.max(0, n - 1))] * u;
  while (!incapeText(marimeText) && marimeText > 30 * u) marimeText -= 1 * u;
  const masuri = masoaraText(marimeText);

  // Vertical: panourile stau aproape unele de altele; ce rămâne se împarte sus și jos.
  const inaltimi = masuri.map((r, i) =>
    inaltimeEtapa(marimeText, r.randuri, i),
  );
  const spatiuEtape = vertical
    ? Math.min(
        [150, 150, 110, 72, 60][Math.min(4, Math.max(0, n - 1))] * u,
        Math.max(
          spatiuMinimVertical,
          (inaltimeDisponibila - inaltimi.reduce((s, h) => s + h, 0)) /
            Math.max(1, n - 1),
        ),
      )
    : 0;
  // Vertical: nodul e centrat pe primul rând din panou (data sau, dacă lipsește, textul).
  const centruNod = (i: number) =>
    paddingPanou +
    (dateText[i] ? inaltimeRandData : marimeText * INALTIME_RAND_TEXT) / 2;

  // ——— Calendarul (secunde) ———
  const startPrimul = (textTitlu ? 0.7 : 0.35) * k;
  const sfarsitDezvaluire = 0.65 * durata;
  const ultimul = sfarsitDezvaluire - 1.0 * Math.max(k, 0.7);
  const pas =
    n > 1
      ? Math.min(1.8, Math.max(0.28, (ultimul - startPrimul) / (n - 1)))
      : 0;
  const tEtapa = (i: number) => startPrimul + i * pas;
  const tFinal = tEtapa(n - 1);
  // după ultima etapă, toate revin la lumină plină
  const revenire = progres(tFinal + 0.6, tFinal + 1.3, EASE_INTRARE_IESIRE);
  const traseu = progres(0.05, 0.9 * Math.max(k, 0.7));
  const nrCuvinteTitlu = textTitlu ? textTitlu.split(/\s+/).length : 0;
  const pasTitlu =
    nrCuvinteTitlu > 1 ? Math.min(0.07, 0.5 / (nrCuvinteTitlu - 1)) : 0;
  // o sclipire care parcurge o dată linia desenată, în timpul menținerii
  const tSclipire = tFinal + 1.2;
  const estompare = (i: number) =>
    i < n - 1
      ? progres(tEtapa(i + 1), tEtapa(i + 1) + 0.45) * (1 - revenire)
      : 0;

  /** Segmentul de linie de la etapa i la următoarea (sau „coada” de după ultima). */
  const segment = (i: number, style: CSSProperties) => {
    const ultim = i === n - 1;
    const p = ultim
      ? progres(tEtapa(i) + 0.1, tEtapa(i) + 1.0, EASE_IESIRE)
      : progres(tEtapa(i) + 0.08, tEtapa(i + 1), EASE_INTRARE_IESIRE);
    const directie = vertical ? "180deg" : "90deg";
    const sclipire = progres(
      tSclipire + i * 0.32,
      tSclipire + i * 0.32 + 0.55,
      EASE_INTRARE_IESIRE,
    );
    return (
      <div style={{ position: "absolute", ...style }}>
        {/* traseul estompat, vizibil de la început */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: ultim
              ? `linear-gradient(${directie}, ${transparenta(c.text, 16)} 0%, ${transparenta(c.text, 0)} 100%)`
              : transparenta(c.text, 16),
            opacity: traseu,
          }}
        />
        {/* linia desenată */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: ultim
              ? `linear-gradient(${directie}, ${transparenta(c.text, 75)} 0%, ${transparenta(c.text, 0)} 100%)`
              : transparenta(c.text, 75),
            transformOrigin: vertical ? "center top" : "left center",
            scale: vertical ? `1 ${p}` : `${p} 1`,
          }}
        />
        {/* capul liniei: un punct cald care o „trage” după el */}
        {p > 0 && p < 1 ? (
          <div
            style={{
              position: "absolute",
              width: 30 * u,
              height: 30 * u,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${c.accent} 0%, ${transparenta(c.accent, 35)} 30%, ${transparenta(c.accent, 0)} 70%)`,
              ...(vertical
                ? { left: "50%", top: `${p * 100}%`, translate: "-50% -50%" }
                : { top: "50%", left: `${p * 100}%`, translate: "-50% -50%" }),
              opacity: ultim ? 1 - p : 1,
            }}
          />
        ) : null}
        {!ultim && sclipire > 0 && sclipire < 1 ? (
          <div
            style={{
              position: "absolute",
              ...(vertical
                ? {
                    left: 0,
                    right: 0,
                    height: "35%",
                    top: `${-35 + 135 * sclipire}%`,
                  }
                : {
                    top: 0,
                    bottom: 0,
                    width: "35%",
                    left: `${-35 + 135 * sclipire}%`,
                  }),
              background: `linear-gradient(${directie}, transparent, ${transparenta(c.accent, 85)}, transparent)`,
            }}
          />
        ) : null}
      </div>
    );
  };

  const nod = (i: number, style: CSSProperties) => {
    const t = tEtapa(i);
    const aparitie = spring({
      frame: Math.max(0, frame - t * fps),
      fps,
      config: { damping: 15, stiffness: 180, mass: 0.6 },
    });
    const vizibil = frame >= t * fps;
    const unda = progres(t, t + 1.0, EASE_IESIRE);
    // ultimul nod „respiră” lent cât timp cadrul e menținut
    const respiratie =
      i === n - 1
        ? revenire *
          (0.5 -
            0.5 * Math.cos(((frame / fps - tFinal - 1.3) * 2 * Math.PI) / 2.6))
        : 0;
    return (
      <div
        style={{
          position: "absolute",
          width: marimeNod,
          height: marimeNod,
          ...style,
        }}
      >
        {/* reperul estompat, înainte să ajungă linia */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 9 * u,
            height: 9 * u,
            translate: "-50% -50%",
            borderRadius: "50%",
            backgroundColor: transparenta(c.text, 35),
            opacity: traseu * (vizibil ? 0 : 1),
          }}
        />
        {vizibil ? (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: `${Math.max(1, 1.5 * u)}px solid ${c.accent}`,
                scale: 1 + 1.8 * unda,
                opacity: (1 - unda) * 0.7,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: -14 * u,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${transparenta(c.accent, 40)} 0%, ${transparenta(c.accent, 0)} 68%)`,
                opacity: aparitie * (0.45 + 0.55 * respiratie),
                scale: 0.9 + 0.3 * respiratie,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                backgroundColor: c.fundal,
                border: `${Math.max(1, 2.5 * u)}px solid ${c.text}`,
                boxSizing: "border-box",
                scale: aparitie,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: marimeNod * 0.34,
                  height: marimeNod * 0.34,
                  borderRadius: "50%",
                  backgroundColor: c.accent,
                }}
              />
            </div>
          </>
        ) : null}
      </div>
    );
  };

  /** Numărul etapei în Unbounded, umplut cu un gradient care se stinge în jos. */
  const numar = (i: number, marime: number, opacitate: number) => (
    <span
      style={{
        display: "inline-block",
        fontFamily: FONT_TITLU,
        fontWeight: 800,
        fontSize: marime,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
        backgroundImage: `linear-gradient(180deg, ${transparenta(c.text, opacitate)} 0%, ${transparenta(c.text, opacitate * 0.15)} 100%)`,
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
      }}
    >
      {String(i + 1).padStart(2, "0")}
    </span>
  );

  const continut = (i: number) => {
    const t = tEtapa(i);
    const data = dateText[i];
    const intrareData = progres(t + 0.05, t + 0.75);
    const cuvinte = etape[i].text.split(/\s+/).filter(Boolean).length;
    return (
      <>
        {data || (auDate && !vertical) ? (
          <div
            style={{
              overflow: "hidden",
              height: inaltimeRandData,
              marginBottom: spatiuData,
            }}
          >
            <div
              style={{
                fontFamily: FONT_TEXT,
                fontWeight: 600,
                fontSize: marimeData,
                lineHeight: INALTIME_RAND_DATA,
                letterSpacing: `${SPATIERE_DATA}em`,
                whiteSpace: "nowrap",
                color: c.accent,
                translate: `0 ${(1 - intrareData) * 100}%`,
                opacity: intrareData,
              }}
            >
              {data}
            </div>
          </div>
        ) : null}
        <TextAnimat
          text={etape[i].text}
          start={t + 0.14}
          pas={cuvinte > 1 ? Math.min(0.04, 0.4 / (cuvinte - 1)) : 0}
          durata={0.8 * Math.max(k, 0.75)}
          style={{
            fontFamily: FONT_TEXT,
            fontWeight: 500,
            fontSize: marimeText,
            lineHeight: INALTIME_RAND_TEXT,
            color: c.text,
            maxWidth: latimeText,
          }}
        />
      </>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: c.fundal, overflow: "hidden" }}>
      <Fundal />

      <AbsoluteFill
        style={{
          padding: `${f.margineY}px ${f.margineX}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            width: latimeContinut,
            translate: vertical
              ? `0 ${-12 * u * deriva}px`
              : `${-10 * u * deriva}px 0`,
          }}
        >
          {titlu && textTitlu ? (
            <TextAnimat
              text={textTitlu}
              // titlul pornește la mijlocul tranziției de intrare, ca în celelalte scene
              start={0.3 * k}
              pas={pasTitlu * k}
              durata={0.9 * Math.max(k, 0.7)}
              style={{
                fontFamily: FONT_TITLU,
                fontWeight: 800,
                fontSize: titlu.marime,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: c.text,
                maxWidth: latimeContinut,
                marginBottom: spatiuTitlu,
              }}
            />
          ) : null}

          {vertical ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: latimeContinut,
              }}
            >
              {etape.map((_, i) => {
                const ultim = i === n - 1;
                const y = centruNod(i);
                const lungime = ultim
                  ? 130 * u
                  : `calc(100% + ${spatiuEtape + centruNod(i + 1) - y}px)`;
                const t = tEtapa(i);
                const intrarePanou = progres(t, t + 0.7);
                return (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      paddingLeft: indentPanou,
                      marginBottom: ultim ? 0 : spatiuEtape,
                    }}
                  >
                    {segment(i, {
                      left: razaNod - grosimeLinie / 2,
                      top: y,
                      width: grosimeLinie,
                      height: lungime,
                    })}
                    {nod(i, { left: 0, top: y - razaNod })}
                    <div
                      style={{
                        position: "relative",
                        overflow: "hidden",
                        padding: paddingPanou,
                        borderRadius: 28 * u,
                        backgroundColor: "rgba(255,255,255,0.065)",
                        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.12), 0 ${18 * u}px ${48 * u}px rgba(0,0,0,0.25)`,
                        backdropFilter: `blur(${18 * u}px)`,
                        opacity: intrarePanou * (1 - 0.45 * estompare(i)),
                        translate: `${-28 * u * (1 - intrarePanou)}px 0`,
                      }}
                    >
                      {/* numărul etapei, mare și discret, în colțul panoului */}
                      <div
                        style={{
                          position: "absolute",
                          right: paddingPanou * 0.7,
                          top: paddingPanou * 0.35,
                          translate: `0 ${(1 - intrarePanou) * 30}%`,
                        }}
                      >
                        {numar(i, (n >= 5 ? 76 : 96) * u, 13)}
                      </div>
                      <div style={{ position: "relative" }}>{continut(i)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${n}, ${latimeColoana}px)`,
                columnGap: spatiuColoane,
                width: latimeContinut,
              }}
            >
              {etape.map((_, i) => {
                const ultim = i === n - 1;
                const t = tEtapa(i);
                const intrareNumar = progres(t - 0.1, t + 0.8);
                // de la centrul nodului la centrul următorului; ultima „coadă” iese ușor în margine
                const lungime = ultim
                  ? latimeColoana - razaNod + f.margineX * 0.7
                  : latimeColoana + spatiuColoane;
                return (
                  <div key={i} style={{ position: "relative" }}>
                    <div
                      style={{
                        height: marimeNumar * 0.86,
                        marginBottom: spatiuSubNumar,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "flex-end",
                      }}
                    >
                      <div
                        style={{
                          lineHeight: 0,
                          translate: `0 ${(1 - intrareNumar) * 100}%`,
                          opacity: 1 - 0.45 * estompare(i),
                        }}
                      >
                        {numar(i, marimeNumar, 30)}
                      </div>
                    </div>
                    <div
                      style={{
                        position: "relative",
                        height: marimeNod,
                        marginBottom: spatiuSubLinie,
                      }}
                    >
                      {segment(i, {
                        left: razaNod,
                        top: razaNod - grosimeLinie / 2,
                        width: lungime,
                        height: grosimeLinie,
                      })}
                      {nod(i, { left: 0, top: 0 })}
                    </div>
                    <div style={{ opacity: 1 - 0.45 * estompare(i) }}>
                      {continut(i)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AbsoluteFill>

    </AbsoluteFill>
  );
};
