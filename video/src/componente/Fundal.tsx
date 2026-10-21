import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { transparenta, useCulori } from "../tema";

/**
 * Fundal închis „viu” pentru scenele fără fotografie: două lumini difuze care
 * plutesc lent. Prima e culoarea principală; a doua e un turcoaz adânc derivat
 * din ea (o lumină rece care se armonizează cu bleumarinul). Galbenul accentului
 * rămâne pentru linii, etichete și cifre: pe negru, la opacitate mică, ar da o
 * pată maronie. Culorile trec prin `transparenta()` / `color-mix`, deci merg cu
 * orice format CSS din `culori` (#rgb, rgb(), hsl(), nume).
 */
export const Fundal: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const c = useCulori();
  const p = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const secundara = c.lumina ?? `color-mix(in srgb, ${c.principala} 60%, #3FE0D0)`;

  return (
    <AbsoluteFill style={{ backgroundColor: c.fundal, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${20 + 10 * p}% ${30 + 8 * p}%, ${transparenta(c.principala, 33)} 0%, transparent 45%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${85 - 12 * p}% ${80 - 10 * p}%, ${transparenta(secundara, 16)} 0%, transparent 40%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Granulația de film                                                  */
/* ------------------------------------------------------------------ */

// Texturi de zgomot pregenerate (public/granulatie, 512×512, gri, se repetă fără
// cusătură). Un feTurbulence calculat la fiecare cadru costa ~45% din timpul de
// randare în Full HD; o textură desenată pe canvas costă aproape nimic.
const NR_TEXTURI = 6;
const LATURA = 512;

let texturi: HTMLImageElement[] | null = null;
let incarcare: Promise<HTMLImageElement[]> | null = null;
const incarcaTexturi = () => {
  incarcare ??= Promise.all(
    Array.from({ length: NR_TEXTURI }, async (_, i) => {
      const img = new Image();
      img.src = staticFile(`granulatie/granulatie-${i}.png`);
      await img.decode();
      return img;
    }),
  ).then((lista) => {
    texturi = lista;
    return lista;
  });
  return incarcare;
};

/** Amestec întreg determinist, pentru decalajul texturii la fiecare schimbare. */
const amesteca = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/**
 * Granulație fină de film peste tot cadrul (se schimbă la fiecare 2 cadre).
 * Textura și decalajul ei vin determinist din numărul cadrului, deci două
 * randări ale aceluiași cadru sunt identice; randarea așteaptă texturile.
 */
export const Granulatie: React.FC<{ opacitate?: number }> = ({ opacitate = 0.07 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => (texturi ? null : delayRender("Texturile granulației de film")));
  const [gata, setGata] = useState(texturi !== null);

  useEffect(() => {
    if (gata) return;
    let activ = true;
    incarcaTexturi()
      .then(() => {
        if (activ) setGata(true);
      })
      .catch((err) => cancelRender(err));
    return () => {
      activ = false;
    };
  }, [gata, cancelRender]);

  const pas = Math.floor(frame / 2);
  // desenul se face sincron, înainte de captură (useLayoutEffect)
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!gata || !texturi || !ctx) return;
    const h = amesteca(pas);
    const model = ctx.createPattern(texturi[pas % NR_TEXTURI], "repeat");
    if (!model) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(-(h % LATURA), -((h >>> 9) % LATURA));
    ctx.fillStyle = model;
    ctx.fillRect(0, 0, width + LATURA, height + LATURA);
    ctx.restore();
  }, [gata, pas, width, height]);

  useEffect(() => {
    if (gata && handle !== null) continueRender(handle);
  }, [gata, handle, continueRender]);

  return (
    <AbsoluteFill style={{ opacity: opacitate, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <canvas ref={ref} width={width} height={height} style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};
