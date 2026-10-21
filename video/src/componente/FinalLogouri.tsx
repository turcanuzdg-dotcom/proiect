import { getImageDimensions } from "@remotion/media-utils";
import { useEffect, useRef, useState } from "react";
import { Img, interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { EASE_IESIRE, useFormat } from "../tema";

const sursa = (src: string) => (src.startsWith("http") ? src : staticFile(src));

/**
 * Raportul lățime/înălțime al fiecărui logo, citit înainte de primul cadru
 * (randarea așteaptă prin delayRender, deci rezultatul e determinist).
 * Un fișier care nu se poate citi primește un raport neutru; eroarea reală o
 * semnalează oricum <Img>.
 */
const useRapoarte = (logouri: string[]) => {
  const { delayRender, continueRender } = useDelayRender();
  const cheie = logouri.join("|");
  const [rezultat, setRezultat] = useState<{ cheie: string; rapoarte: number[] } | null>(null);
  const [handle] = useState(() => delayRender("Dimensiunile logourilor din scena finală"));
  const continuat = useRef(false);

  useEffect(() => {
    let anulat = false;
    Promise.all(
      cheie
        .split("|")
        .filter(Boolean)
        .map((l) =>
          getImageDimensions(sursa(l))
            .then((d) => (d.width > 0 && d.height > 0 ? d.width / d.height : 1.6))
            .catch(() => 1.6),
        ),
    ).then((rapoarte) => {
      if (anulat) return;
      setRezultat({ cheie, rapoarte });
      if (!continuat.current) {
        continuat.current = true;
        continueRender(handle);
      }
    });
    return () => {
      anulat = true;
    };
  }, [cheie, continueRender, handle]);

  return rezultat && rezultat.cheie === cheie ? rezultat.rapoarte : null;
};

type Logo = { w: number; h: number; index: number };

export type AsezareLogouri = {
  randuri: Logo[][];
  latime: number;
  inaltime: number;
  padX: number;
  padY: number;
  spatiu: number;
  spatiuRanduri: number;
  raza: number;
};

/**
 * Așază logourile: toate încap într-o înălțime uniformă `inaltimeMax`, dar cele
 * late coboară puțin (echilibru optic: un logo pătrat și unul lat par la fel de
 * „grele”). Spațiile dintre logouri sunt egale. Dacă rândul nu încape în
 * `latimeMax`, logourile se împart pe două (sau trei) rânduri, apoi se micșorează.
 */
const aseaza = (rapoarte: number[], inaltimeMax: number, latimeMax: number, u: number): AsezareLogouri => {
  const n = rapoarte.length;
  const padX = 56 * u;
  const padY = 32 * u;
  let rezerva: { varianta: AsezareLogouri; marime: number } | null = null;

  for (let r = 1; r <= Math.min(3, n); r++) {
    const peRand = Math.ceil(n / r);
    const s0 = r === 1 ? 1 : r === 2 ? 0.86 : 0.76;
    const h0 = inaltimeMax * s0;
    const logouri: Logo[] = rapoarte.map((a, index) => {
      let h = h0 * Math.min(1, a ** -0.32);
      let w = h * a;
      if (w > h0 * 3.4) {
        w = h0 * 3.4;
        h = w / a;
      }
      return { w, h, index };
    });
    const grupuri: Logo[][] = [];
    for (let i = 0; i < n; i += peRand) grupuri.push(logouri.slice(i, i + peRand));

    const spatiu0 = (r > 1 ? 64 : 72) * u;
    const latRand = (rand: Logo[], sp: number) => rand.reduce((s, x) => s + x.w, 0) + sp * (rand.length - 1);
    const scara = Math.min(1, (latimeMax - 2 * padX) / Math.max(...grupuri.map((g) => latRand(g, spatiu0))));
    const spatiu = spatiu0 * scara;
    const randuri = grupuri.map((g) => g.map((x) => ({ ...x, w: x.w * scara, h: x.h * scara })));
    const spatiuRanduri = 36 * u * scara;
    const varianta: AsezareLogouri = {
      randuri,
      latime: Math.max(...randuri.map((g) => latRand(g, spatiu))) + 2 * padX,
      inaltime: randuri.length * h0 * scara + (randuri.length - 1) * spatiuRanduri + 2 * padY,
      padX,
      padY,
      spatiu,
      spatiuRanduri,
      raza: 28 * u,
    };
    // prima variantă care nu micșorează prea mult; altfel cea cu logourile cele mai mari
    if (scara >= 0.82) return varianta;
    if (!rezerva || s0 * scara > rezerva.marime) rezerva = { varianta, marime: s0 * scara };
  }
  return rezerva!.varianta;
};

/**
 * Așezarea plăcii de logouri (sau null dacă nu sunt logouri), ca scena să poată
 * centra restul conținutului deasupra ei.
 */
export const useAsezareLogouri = (logouri: string[] | undefined, inaltimeMax: number, latimeMax: number) => {
  const { u } = useFormat();
  const lista = (logouri ?? []).filter((l) => l.trim().length > 0);
  const rapoarte = useRapoarte(lista);
  if (lista.length === 0 || !rapoarte) return null;
  return { lista, asezare: aseaza(rapoarte, inaltimeMax, latimeMax, u) };
};

/**
 * Rândul de logouri al scenei finale, pe o placă deschisă la culoare (logourile
 * partenerilor au adesea text închis, care pe fundalul întunecat s-ar pierde).
 * Placa apare prima, apoi logourile, pe rând. `start`, `pas`, `durata` în secunde.
 */
export const FinalLogouri: React.FC<{
  logouri: string[];
  asezare: AsezareLogouri;
  start: number;
  pas: number;
  durata: number;
}> = ({ logouri, asezare: a, start, pas, durata }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useFormat();
  const progres = (de: number, la: number) =>
    interpolate(frame, [de * fps, la * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_IESIRE,
    });
  // placa se lățește din centru (ca o capsulă care se deschide), apoi vin logourile
  const placa = progres(start - 0.25, start + 0.4);

  return (
    <div
      style={{
        position: "relative",
        width: a.inaltime + (a.latime - a.inaltime) * placa,
        height: a.inaltime,
        borderRadius: a.raza,
        overflow: "hidden",
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        boxShadow: `0 ${24 * u}px ${64 * u}px rgba(0, 0, 0, 0.35)`,
        opacity: Math.min(1, placa * 4),
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: a.latime,
          height: a.inaltime,
          translate: "-50% 0",
          padding: `${a.padY}px ${a.padX}px`,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: a.spatiuRanduri,
        }}
      >
        {a.randuri.map((rand, r) => (
          <div key={r} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: a.spatiu }}>
            {rand.map((logo) => {
              const t0 = start + logo.index * pas;
              const p = progres(t0, t0 + durata);
              return (
                <Img
                  key={logo.index}
                  src={sursa(logouri[logo.index])}
                  style={{
                    width: logo.w,
                    height: logo.h,
                    objectFit: "contain",
                    flexShrink: 0,
                    opacity: p,
                    translate: `0 ${(1 - p) * 14 * u}px`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
