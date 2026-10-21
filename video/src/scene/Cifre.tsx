import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { latimeEm, potrivesteTitlu, randuriText } from "../componente/masuraText";
import { formateazaFinal, formateazaPartial } from "../componente/numere";
import { Fundal } from "../componente/Fundal";
import { TextAnimat } from "../componente/TextAnimat";
import type { Cifra, ScenaCifre } from "../date/tipuri";
import { EASE_IESIRE, EASE_INTRARE_IESIRE, FONT_TEXT, FONT_TITLU, transparenta, useCulori, useFormat } from "../tema";

// Prefixul și sufixul (de ex. „ m²”) stau pe aceeași linie de bază, mai mici.
const SCARA_UNITATE = 0.4;
const SPATIU_UNITATE = 0.1; // em din corpul cifrei
const INALTIME_RAND_CIFRA = 1.08;
const INALTIME_RAND_ETICHETA = 1.3;

/** Lățimea unei cifre complete (prefix + valoare finală + sufix) la corpul 1. */
const latimeCifraEm = (cifra: Cifra) => {
  const valoare = latimeEm(formateazaFinal(cifra.valoare), "titlu", {
    cifreTabulare: true,
    spatiere: -0.01,
  });
  const prefix = cifra.prefix?.trim();
  const sufix = cifra.sufix?.trim();
  const unitate = (t?: string) =>
    t ? latimeEm(t, "titlu") * SCARA_UNITATE + SPATIU_UNITATE : 0;
  return valoare + unitate(prefix) + unitate(sufix);
};

/**
 * Proiectul în cifre: numere mari care se numără crescător (pe șablonul valorii
 * finale, cu zerouri „fantomă”, ca lățimea să nu sară), fiecare cu un indice și
 * o linie de accent care se umple odată cu numărătoarea, și eticheta dedesubt.
 * 16:9: un rând (2×2 pentru patru cifre); 9:16: o coloană.
 */
export const Cifre: React.FC<{ scena: ScenaCifre }> = ({ scena }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const c = useCulori();
  const f = useFormat();
  const { u, vertical } = f;

  const durata = durationInFrames / fps;
  // Intrarea e gândită pentru 5,5 s; o scenă mai scurtă o comprimă.
  const k = Math.min(1, Math.max(0.55, durata / 5.5));
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

  const cifre = scena.cifre.slice(0, 4);
  const n = cifre.length;
  const textTitlu = scena.titlu?.trim() || null;

  // ——— Dimensiuni ———
  const latimeContinut = f.latime - 2 * f.margineX;
  const inaltimeContinut = f.inaltime - 2 * f.margineY;

  const titlu = textTitlu
    ? potrivesteTitlu({
        text: textTitlu,
        latime: latimeContinut,
        maxim: (vertical ? 92 : 96) * u,
        minim: (vertical ? 72 : 76) * u,
        // în 16:9 un titlu foarte lung coboară pe două rânduri mai mici, ca cifrele să rămână mari
        minimExtrem: (vertical ? 60 : 54) * u,
        maxRanduri: vertical ? 3 : 2,
      })
    : null;
  const inaltimeTitlu = titlu ? titlu.randuri * titlu.marime * 1.05 : 0;
  const spatiuTitlu = titlu && n > 0 ? (vertical ? 120 : 104) * u : 0;

  const coloane = vertical ? 1 : n === 4 ? 2 : Math.max(1, n);
  const randuri = Math.max(1, Math.ceil(n / coloane));
  const marimeEticheta =
    (vertical ? (n <= 2 ? 46 : 42) : n === 1 ? 48 : n === 2 ? 44 : 40) * u;
  const marimeIndice = (vertical ? 26 : 24) * u;
  const inaltimeAntet = marimeIndice * 1.2;
  const spatiuAntet = (vertical ? 30 : 34) * u;
  const spatiuEticheta = (vertical ? 18 : 22) * u;
  const spatiuColoane = (n === 4 ? 160 : n === 3 ? 76 : 120) * u;
  const spatiuRanduri = (vertical ? (n === 4 ? 64 : 84) : 92) * u;
  const latimeMinima =
    (n === 1 ? 760 : n === 2 ? 520 : n === 3 ? 330 : 600) * u;
  const maxim =
    (vertical ? [260, 220, 190, 176] : [300, 220, 190, 168])[
      Math.max(0, n - 1)
    ] * u;

  const latimiEm = cifre.map(latimeCifraEm);
  const latimeColoanaEm = Array.from({ length: coloane }, (_, j) =>
    Math.max(0, ...latimiEm.filter((_, i) => i % coloane === j)),
  );

  // Cel mai mare corp la care încap toate cifrele, pe lățime și pe înălțime.
  const aseaza = (marime: number) => {
    const latimi = vertical
      ? [latimeContinut]
      : latimeColoanaEm.map((w) => Math.max(w * marime, latimeMinima));
    const total =
      latimi.reduce((s, w) => s + w, 0) + spatiuColoane * (coloane - 1);
    // în 16:9 rândul se întinde pe toată lățimea, ca blocul să stea echilibrat
    const extra =
      !vertical && n > 1 ? Math.max(0, latimeContinut - total) / coloane : 0;
    const finale = latimi.map((w) => w + extra);
    const inaltimiRand = Array.from({ length: randuri }, (_, r) => {
      const linii = Math.max(
        1,
        ...cifre
          .map((cf, i) => ({ cf, i }))
          .filter(({ i }) => Math.floor(i / coloane) === r)
          .map(
            ({ cf, i }) =>
              randuriText({
                text: cf.eticheta,
                font: "text",
                marime: marimeEticheta,
                latime: finale[i % coloane],
              }).randuri,
          ),
      );
      return (
        inaltimeAntet +
        spatiuAntet +
        marime * INALTIME_RAND_CIFRA +
        spatiuEticheta +
        linii * marimeEticheta * INALTIME_RAND_ETICHETA
      );
    });
    const inaltime =
      inaltimeTitlu +
      spatiuTitlu +
      inaltimiRand.reduce((s, h) => s + h, 0) +
      spatiuRanduri * (randuri - 1);
    const incape =
      total <= latimeContinut + 0.5 &&
      inaltime <= inaltimeContinut &&
      (!vertical || Math.max(0, ...latimiEm) * marime <= latimeContinut);
    return { latimi: finale, incape };
  };
  let marimeCifra = maxim;
  let asezare = aseaza(marimeCifra);
  while (!asezare.incape && marimeCifra > 48 * u) {
    marimeCifra -= 2 * u;
    asezare = aseaza(marimeCifra);
  }

  // ——— Calendarul (secunde) ———
  const nrCuvinteTitlu = textTitlu ? textTitlu.split(/\s+/).length : 0;
  const pasTitlu =
    nrCuvinteTitlu > 1 ? Math.min(0.07, 0.5 / (nrCuvinteTitlu - 1)) : 0;
  // titlul pornește la mijlocul tranziției de intrare, ca în celelalte scene
  const startTitlu = 0.3 * k;
  const startCifre = (textTitlu ? 0.6 : 0.3) * k;
  const pasCifre = (n > 2 ? 0.16 : 0.22) * k;
  // numărătorile se termină în cascadă, ultima la ~60% din scenă
  const sfarsitNumarare = (i: number) =>
    Math.max(
      startCifre + i * pasCifre + 1.1,
      0.6 * durata - (n - 1 - i) * 0.12 * k,
    );

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
            translate: `0 ${-12 * u * deriva}px`,
          }}
        >
          {titlu && textTitlu ? (
            <TextAnimat
              text={textTitlu}
              start={startTitlu}
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: asezare.latimi
                .map((w) => `${w}px`)
                .join(" "),
              columnGap: spatiuColoane,
              rowGap: spatiuRanduri,
            }}
          >
            {cifre.map((cifra, i) => {
              const t0 = startCifre + i * pasCifre;
              const tFinal = sfarsitNumarare(i);
              const numarare = progres(t0 + 0.08, tFinal, EASE_IESIRE);
              const intrare = progres(t0, t0 + 0.9 * Math.max(k, 0.75));
              const antet = progres(t0 - 0.05, t0 + 0.75);
              const linie = progres(t0 + 0.05, t0 + 0.9, EASE_INTRARE_IESIRE);
              const sclipire = progres(
                tFinal - 0.1,
                tFinal + 0.9,
                EASE_INTRARE_IESIRE,
              );
              const { fantoma, real } = formateazaPartial(
                cifra.valoare,
                numarare,
              );
              const prefix = cifra.prefix?.trim();
              const sufix = cifra.sufix?.trim();
              const latimeColoana = asezare.latimi[i % coloane];
              const latimeNumar = latimiEm[i] * marimeCifra;
              const indice = String(i + 1).padStart(2, "0");

              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    minWidth: 0,
                  }}
                >
                  {/* Antetul: indice + linie fină pe care accentul crește odată cu numărătoarea */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 20 * u,
                      width: vertical
                        ? latimeColoana
                        : Math.max(
                            latimeNumar,
                            Math.min(latimeColoana, 560 * u),
                          ),
                      height: inaltimeAntet,
                      marginBottom: spatiuAntet,
                      opacity: antet,
                    }}
                  >
                    {n > 1 ? (
                      <div
                        style={{
                          fontFamily: FONT_TEXT,
                          fontWeight: 600,
                          fontSize: marimeIndice,
                          letterSpacing: "0.12em",
                          fontVariantNumeric: "tabular-nums",
                          color: c.accent,
                          lineHeight: 1,
                          translate: `${-10 * u * (1 - antet)}px 0`,
                        }}
                      >
                        {indice}
                      </div>
                    ) : null}
                    <div
                      style={{
                        position: "relative",
                        flex: 1,
                        height: Math.max(1, 2 * u),
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          backgroundColor: transparenta(c.text, 16),
                          transformOrigin: "left center",
                          scale: `${linie} 1`,
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          backgroundColor: c.accent,
                          transformOrigin: "left center",
                          scale: `${numarare * linie} 1`,
                        }}
                      />
                      {/* o sclipire care trece o dată pe linie când numărul „aterizează” */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          width: "30%",
                          left: `${-30 + 130 * sclipire}%`,
                          background: `linear-gradient(90deg, transparent, ${transparenta(c.text, 90)}, transparent)`,
                          opacity: sclipire > 0 && sclipire < 1 ? 1 : 0,
                        }}
                      />
                    </div>
                  </div>

                  {/* Numărul: urcă dintr-o mască, apoi se numără pe loc */}
                  <div
                    style={{
                      overflow: "hidden",
                      paddingTop: "0.12em",
                      marginTop: "-0.12em",
                      paddingBottom: "0.06em",
                      marginBottom: "-0.06em",
                      paddingRight: "0.06em",
                      fontSize: marimeCifra,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        whiteSpace: "nowrap",
                        fontFamily: FONT_TITLU,
                        fontWeight: 800,
                        lineHeight: INALTIME_RAND_CIFRA,
                        letterSpacing: "-0.01em",
                        fontVariantNumeric: "tabular-nums",
                        fontFeatureSettings: '"tnum" 1',
                        color: c.text,
                        translate: `0 ${(1 - intrare) * 105}%`,
                        opacity: interpolate(intrare, [0, 0.35], [0, 1], {
                          extrapolateRight: "clamp",
                        }),
                      }}
                    >
                      {prefix ? (
                        <span
                          style={{
                            fontSize: `${SCARA_UNITATE}em`,
                            fontWeight: 700,
                            letterSpacing: 0,
                            marginRight: `${SPATIU_UNITATE / SCARA_UNITATE}em`,
                            color: c.textSecundar,
                            // „+”, „€” etc. centrate optic pe înălțimea cifrelor, nu lipite de linia de bază
                            translate: "0 -0.55em",
                          }}
                        >
                          {prefix}
                        </span>
                      ) : null}
                      <span>
                        {fantoma ? (
                          <span style={{ color: transparenta(c.text, 16) }}>
                            {fantoma}
                          </span>
                        ) : null}
                        {real}
                      </span>
                      {sufix ? (
                        <span
                          style={{
                            fontSize: `${SCARA_UNITATE}em`,
                            fontWeight: 700,
                            letterSpacing: 0,
                            marginLeft: `${SPATIU_UNITATE / SCARA_UNITATE}em`,
                            color: c.accent,
                          }}
                        >
                          {sufix}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <TextAnimat
                    text={cifra.eticheta}
                    start={t0 + 0.32 * k}
                    pas={0.035}
                    durata={0.8 * Math.max(k, 0.75)}
                    style={{
                      marginTop: spatiuEticheta,
                      fontFamily: FONT_TEXT,
                      fontWeight: 500,
                      fontSize: marimeEticheta,
                      lineHeight: INALTIME_RAND_ETICHETA,
                      color: c.textSecundar,
                      maxWidth: latimeColoana,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

    </AbsoluteFill>
  );
};
