import { getImageDimensions } from "@remotion/media-utils";
import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { type Directie, ImagineMiscare } from "../componente/ImagineMiscare";
import { latimeEchilibrata, randuriText } from "../componente/masuraText";
import { TextAnimat } from "../componente/TextAnimat";
import type { ScenaFoto } from "../date/tipuri";
import { EASE_IESIRE, FONT_TEXT, FONT_TITLU, greutateTitlu, inaltimeRandTitlu, sursa, useCulori, useFormat } from "../tema";

/* ------------------------------------------------------------------ */
/* Mișcarea camerei                                                    */
/* ------------------------------------------------------------------ */

/** FNV-1a + amestec final, ca fotografii cu nume apropiate să primească mișcări diferite. */
const hashText = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

const RAPORT_IMPLICIT = 3 / 2;

/** Raportul lățime/înălțime al fotografiei; randarea așteaptă până îl aflăm. */
const useRaportImagine = (src: string) => {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Dimensiunile fotografiei ${src}`));
  const [raport, setRaport] = useState<number | null>(null);

  useEffect(() => {
    let activ = true;
    getImageDimensions(sursa(src))
      .then(({ width, height }) => {
        if (activ) setRaport(width > 0 && height > 0 ? width / height : RAPORT_IMPLICIT);
      })
      .catch(() => {
        if (activ) setRaport(RAPORT_IMPLICIT);
      });
    return () => {
      activ = false;
    };
  }, [src]);

  // Eliberăm randarea abia după ce noul raport a ajuns în DOM.
  useEffect(() => {
    if (raport !== null) continueRender(handle);
  }, [raport, handle, continueRender]);

  return raport ?? RAPORT_IMPLICIT;
};

type Miscare = {
  directie: Directie;
  zoom: [number, number];
  /** Panoramare prin object-position, pe axa pe care fotografia e tăiată mult. */
  pozitie: (p: number) => string;
};

/**
 * Alege mișcarea determinist din numele fișierului. Dacă fotografia e tăiată mult
 * de `cover` (peisaj în 9:16, portret în 16:9), camera o parcurge lent pe acea axă,
 * ca privitorul să vadă cât mai mult din ea.
 */
const alegeMiscare = (
  imagine: string,
  raportImagine: number,
  latime: number,
  inaltime: number,
  secunde: number,
  u: number,
): Miscare => {
  const h = hashText(imagine);
  const raportCadru = latime / inaltime;
  const taiere = Math.max(raportImagine / raportCadru, raportCadru / raportImagine);
  const inversZoom = ((h >>> 2) & 1) === 1;

  if (taiere > 1.3) {
    const orizontal = raportImagine > raportCadru;
    // pixeli ascunși pe axa tăiată (la zoom 1)
    const ascuns = orizontal ? inaltime * raportImagine - latime : latime / raportImagine - inaltime;
    // viteză constantă (~70 px/s la u=1), dar fără să ajungem la margine
    const parcurs = Math.min(ascuns * 0.8, 70 * u * secunde);
    const procent = (parcurs / ascuns) * 100;
    const inapoi = ((h >>> 3) & 1) === 1; // stânga / sus
    const directie: Directie = orizontal ? (inapoi ? "stanga" : "dreapta") : inapoi ? "sus" : "jos";
    const sens = inapoi ? -1 : 1;
    return {
      directie,
      zoom: inversZoom ? [1.1, 1.04] : [1.04, 1.1], // minim 1.04: deplasarea de ±1.5% nu atinge marginea
      pozitie: (p) => {
        const v = 50 + sens * procent * (p - 0.5);
        return orizontal ? `${v}% 50%` : `50% ${v}%`;
      },
    };
  }

  const directii: Directie[] = ["stanga", "dreapta", "sus", "jos"];
  return {
    directie: directii[h % 4],
    zoom: inversZoom ? [1.16, 1.06] : [1.06, 1.16],
    pozitie: () => "50% 50%",
  };
};

/* ------------------------------------------------------------------ */
/* Legenda: mărimea și încadrarea textelor                             */
/* ------------------------------------------------------------------ */

// Lățimile vin din tabelele de glife comune (masuraText.ts), nu din DOM: fonturile se
// încarcă asincron, iar measureText ar memora lățimi greșite.

/**
 * Mărimea titlului = cea mai mare la care încape în numărul de rânduri permis
 * (`trepte` = [[mărime minimă, rânduri maxime]], în ordinea preferinței), apoi
 * coloana cea mai îngustă cu același număr de rânduri (rânduri echilibrate).
 */
const asezareTitlu = (titlu: string, latimeMax: number, maxim: number, trepte: [number, number][]) => {
  let marime = trepte[trepte.length - 1][0];
  cauta: for (const [minim, randuriMax] of trepte) {
    for (let s = maxim; s >= minim; s -= 2) {
      const r = randuriText({ text: titlu, font: "titlu", marime: s, latime: latimeMax, spatiere: -0.02 });
      if (r.celMaiLung <= latimeMax && r.randuri <= randuriMax) {
        marime = s;
        break cauta;
      }
    }
  }
  return {
    marime,
    latime: latimeEchilibrata({ text: titlu, font: "titlu", marime, latime: latimeMax, spatiere: -0.02 }),
  };
};

/* ------------------------------------------------------------------ */
/* Scena                                                               */
/* ------------------------------------------------------------------ */

const Legenda: React.FC<{ titlu?: string; text?: string; k: number }> = ({ titlu, text, k }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const c = useCulori();
  const f = useFormat();
  const u = f.u;

  // Geometrie
  const latimePanou = f.vertical ? f.latime - 2 * f.margineX : Math.min(1400 * u, f.latime - 2 * f.margineX);
  const padSus = (f.vertical ? 46 : 40) * u;
  const padJos = (f.vertical ? 50 : 44) * u;
  const padStanga = (f.vertical ? 40 : 42) * u;
  const padDreapta = (f.vertical ? 48 : 64) * u;
  const latimeBara = 5 * u;
  const spatiuBara = (f.vertical ? 30 : 34) * u;
  const latimeColoana = latimePanou - padStanga - padDreapta - latimeBara - spatiuBara;

  // 2% rezervă pentru erorile de măsurare
  const titluAsezat = titlu
    ? f.vertical
      ? asezareTitlu(titlu, latimeColoana * 0.98, 88 * u, [
          [76 * u, 3],
          [68 * u, 4],
          [60 * u, 5],
          [48 * u, 6],
        ])
      : asezareTitlu(titlu, latimeColoana * 0.98, 88 * u, [
          [72 * u, 2],
          [58 * u, 3],
          [48 * u, 4],
        ])
    : null;
  const marime = titluAsezat?.marime ?? 0;
  const inaltimeRand = titlu ? inaltimeRandTitlu(titlu) : 1.2;
  const marimeDescriere = (titlu ? (text && text.length > 110 ? 40 : 42) : 54) * u;
  // descrierea: cel mult cât titlul sau o măsură comodă de citit, cu rânduri echilibrate
  const masuraDescriere = (titlu ? (f.vertical ? 15 : 26) : f.vertical ? 15 : 20) * marimeDescriere;
  const latimeDescriere = text
    ? latimeEchilibrata({
        text,
        font: "text",
        marime: marimeDescriere,
        latime: Math.min(latimeColoana, Math.max(titluAsezat?.latime ?? 0, masuraDescriere)) * 0.98,
        spatiere: -0.005,
        spatiuCuvinte: 0.27, // spațiul obișnuit din Inter: descrierea e text simplu, nu TextAnimat
      })
    : 0;

  // Timpi (secunde), comprimați pentru scenele scurte
  // (primele 0.6 s se suprapun cu fondul tranziției, deci intrarea începe după ~0.2 s)
  const t0 = 0.22 * k;
  const tTitlu = 0.38 * k;
  const pasTitlu = 0.055 * k;
  const cuvinteTitlu = titlu ? titlu.split(/\s+/).filter(Boolean).length : 0;
  const tText = titlu ? tTitlu + Math.min(cuvinteTitlu, 7) * pasTitlu + 0.14 * k : tTitlu;
  const sfarsitIntrare = (t0 + 0.95 * k) * fps;

  const intrare = interpolate(frame, [t0 * fps, (t0 + 0.95 * k) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IESIRE,
  });
  const bara = interpolate(frame, [(t0 + 0.2 * k) * fps, (t0 + 1.0 * k) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IESIRE,
  });
  const descriere = interpolate(frame, [tText * fps, (tText + 0.85 * k) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IESIRE,
  });
  // după intrare, legenda continuă să urce foarte lent (paralaxă față de fotografie)
  const deriva = interpolate(frame, [sfarsitIntrare, Math.max(durationInFrames, sfarsitIntrare + 1)], [0, -12 * u], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const raza = (f.vertical ? 34 : 30) * u;
  const umbra = `color-mix(in srgb, ${c.fundal} 40%, transparent)`;

  return (
    <div
      style={{
        position: "absolute",
        left: f.margineX,
        // în 9:16 deasupra zonei acoperite de legenda și butoanele aplicațiilor
        bottom: f.margineJos,
        maxWidth: latimePanou,
        translate: `0 ${(1 - intrare) * 46 * u + deriva}px`,
        opacity: interpolate(intrare, [0, 0.35], [0, 1], { extrapolateRight: "clamp" }),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: spatiuBara,
          padding: `${padSus}px ${padDreapta}px ${padJos}px ${padStanga}px`,
          borderRadius: raza,
          // sticlă fumurie: o reflexie albă discretă peste o tentă din culoarea fundalului
          background: `linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.03) 100%), linear-gradient(${umbra}, ${umbra})`,
          backdropFilter: `blur(${36 * u}px) saturate(140%)`,
          WebkitBackdropFilter: `blur(${36 * u}px) saturate(140%)`,
          border: "1px solid rgba(255,255,255,0.13)",
          boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.10)`,
          clipPath: `inset(0 ${(1 - intrare) * 100}% 0 0 round ${raza}px)`,
        }}
      >
        <div
          style={{
            width: latimeBara,
            flexShrink: 0,
            borderRadius: latimeBara,
            backgroundColor: c.accent,
            scale: `1 ${bara}`,
            transformOrigin: "50% 0%",
            // aliniată cu vârful majusculelor din primul rând, oricare ar fi înălțimea rândului
            marginTop: titlu ? ((inaltimeRand - 1.24) / 2 + 0.22) * marime : 0.2 * marimeDescriere,
            marginBottom: text ? 0.2 * marimeDescriere : 0.1 * marime,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {titlu && titluAsezat ? (
            <TextAnimat
              text={titlu}
              start={tTitlu}
              pas={pasTitlu}
              durata={0.85 * k}
              style={{
                maxWidth: titluAsezat.latime,
                fontFamily: FONT_TITLU,
                fontWeight: greutateTitlu(700),
                fontSize: marime,
                lineHeight: inaltimeRand,
                letterSpacing: "-0.02em",
                color: c.text,
              }}
            />
          ) : null}
          {text ? (
            // descrierea urcă dintr-o mască, ca un singur bloc, cu rânduri echilibrate
            <div
              style={{
                overflow: "hidden",
                paddingTop: "0.2em",
                paddingBottom: "0.2em",
                marginBottom: "-0.2em",
                marginTop: titlu ? `${0.36 * marimeDescriere - 0.2 * marimeDescriere}px` : "-0.2em",
                fontSize: marimeDescriere,
              }}
            >
              <div
                style={{
                  maxWidth: latimeDescriere,
                  fontFamily: FONT_TEXT,
                  fontWeight: titlu ? 500 : 600,
                  lineHeight: 1.32,
                  letterSpacing: titlu ? "-0.005em" : "-0.012em",
                  color: c.text,
                  textWrap: "balance",
                  translate: `0 ${(1 - descriere) * 105}%`,
                  opacity: interpolate(descriere, [0, 0.5], [0, titlu ? 0.84 : 0.96], {
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                {text}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const Foto: React.FC<{ scena: ScenaFoto }> = ({ scena }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const c = useCulori();
  const f = useFormat();
  const raport = useRaportImagine(scena.imagine);

  const secunde = durationInFrames / fps;
  // ritmul intrării se comprimă pentru scenele scurte, dar nu se lungește
  const k = Math.min(1, Math.max(0.45, secunde / 4.5));
  const miscare = alegeMiscare(scena.imagine, raport, width, height, secunde, f.u);
  const p = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titlu = scena.titlu?.trim() || undefined;
  const text = scena.text?.trim() || undefined;
  const areLegenda = Boolean(titlu || text);
  const fundal = (procent: number) => `color-mix(in srgb, ${c.fundal} ${procent}%, transparent)`;

  return (
    <AbsoluteFill style={{ backgroundColor: c.fundal, overflow: "hidden" }}>
      <ImagineMiscare
        src={scena.imagine}
        directie={miscare.directie}
        zoom={miscare.zoom}
        style={{
          objectPosition: miscare.pozitie(p),
          filter: "saturate(1.05) contrast(1.05) brightness(0.94)",
        }}
      />

      {/* vinietă și margine de sus, pentru aerul cinematografic */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 120% 90% at 50% 42%, transparent 55%, ${fundal(55)} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(to bottom, ${fundal(45)} 0%, transparent ${f.vertical ? 18 : 24}%)`,
        }}
      />

      {/* fundul întunecat sub legendă, ca textul să se citească pe orice fotografie */}
      <AbsoluteFill
        style={{
          opacity: interpolate(frame, [0, 0.9 * k * fps], [areLegenda ? 0.4 : 0.7, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_IESIRE,
          }),
          background: areLegenda
            ? f.vertical
              ? `linear-gradient(to top, ${fundal(94)} 0%, ${fundal(80)} 16%, ${fundal(52)} 32%, ${fundal(18)} 46%, transparent 60%)`
              : `linear-gradient(to top, ${fundal(94)} 0%, ${fundal(80)} 22%, ${fundal(50)} 44%, ${fundal(16)} 62%, transparent 78%)`
            : `linear-gradient(to top, ${fundal(50)} 0%, transparent 38%)`,
        }}
      />

      {areLegenda ? <Legenda titlu={titlu} text={text} k={k} /> : null}

    </AbsoluteFill>
  );
};
