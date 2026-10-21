import type { TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, interpolate } from "remotion";
import { EASE_INTRARE_IESIRE, transparenta, useCulori, useFormat } from "../tema";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Muchia e ușor înclinată: mai dinamică decât o linie dreaptă, fără să fie un efect.
const UNGHI = 9; // grade

export type PropsCortina = {
  /** 1 = muchia merge spre dreapta (16:9) sau în sus (9:16); -1 = invers. */
  sens?: 1 | -1;
};

/**
 * Ștergere direcțională: scena nouă e descoperită de o muchie înclinată, marcată
 * de o linie fină în culoarea de accent, cu o strălucire discretă. Scena veche e
 * împinsă puțin în aceeași direcție și se întunecă (paralaxă). În 16:9 muchia
 * traversează cadrul pe orizontală, în 9:16 pe verticală.
 */
export const Cortina: React.FC<TransitionPresentationComponentProps<PropsCortina>> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const c = useCulori();
  const f = useFormat();
  const { u, latime: W, inaltime: H, vertical } = f;
  const sens = passedProps.sens ?? 1;
  const p = interpolate(presentationProgress, [0, 1], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });

  if (presentationDirection === "exiting") {
    const deplasare = 7 * sens * p; // procente
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill style={{ translate: vertical ? `0 ${-deplasare}%` : `${deplasare}% 0` }}>{children}</AbsoluteFill>
        <AbsoluteFill style={{ backgroundColor: c.fundal, opacity: 0.45 * p }} />
      </AbsoluteFill>
    );
  }

  // Lungimea pe care o parcurge muchia și înclinarea ei (în px).
  const lungimeAxa = vertical ? H : W;
  const latimeAxa = vertical ? W : H;
  const s = latimeAxa * Math.tan((UNGHI * Math.PI) / 180);
  const rezerva = 60 * u; // muchia (și strălucirea ei) pornește și iese complet din cadru
  // poziția muchiei pe axă, măsurată în sensul de mers
  const d = interpolate(p, [0, 1], [-s / 2 - rezerva, lungimeAxa + s / 2 + rezerva]);

  // Poligonul zonei descoperite și centrul muchiei, în coordonatele cadrului.
  let poligon: string;
  let cx: number;
  let cy: number;
  if (!vertical) {
    const e = sens === 1 ? d : W - d; // x-ul muchiei la mijlocul înălțimii
    const sus = e + s / 2;
    const jos = e - s / 2;
    poligon =
      sens === 1
        ? `polygon(-10px -10px, ${sus}px -10px, ${jos}px ${H + 10}px, -10px ${H + 10}px)`
        : `polygon(${sus}px -10px, ${W + 10}px -10px, ${W + 10}px ${H + 10}px, ${jos}px ${H + 10}px)`;
    cx = e;
    cy = H / 2;
  } else {
    const e = sens === 1 ? H - d : d; // y-ul muchiei la mijlocul lățimii
    const stanga = e - s / 2;
    const dreapta = e + s / 2;
    poligon =
      sens === 1
        ? `polygon(-10px ${stanga}px, ${W + 10}px ${dreapta}px, ${W + 10}px ${H + 10}px, -10px ${H + 10}px)`
        : `polygon(-10px -10px, ${W + 10}px -10px, ${W + 10}px ${dreapta}px, -10px ${stanga}px)`;
    cx = W / 2;
    cy = e;
  }

  // scena nouă intră și ea puțin, din direcția din care vine muchia
  const intrare = 6 * sens * (1 - p);
  const lungimeLinie = Math.hypot(latimeAxa, s) + 40 * u;
  const grosime = Math.max(2, 3 * u);
  const latimeStralucire = 220 * u;
  const intensitate = Math.sin(Math.PI * Math.min(1, Math.max(0, presentationProgress)));
  // gradientul strălucirii e perpendicular pe muchie
  const directieGradient = vertical ? "180deg" : "90deg";

  const pozitieMuchie = {
    position: "absolute" as const,
    left: cx,
    top: cy,
    rotate: `${UNGHI}deg`,
    translate: "-50% -50%",
  };

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: poligon }}>
        <AbsoluteFill style={{ translate: vertical ? `0 ${intrare}%` : `${-intrare}% 0` }}>{children}</AbsoluteFill>
      </AbsoluteFill>
      {/* strălucirea caldă de-a lungul muchiei */}
      <div
        style={{
          ...pozitieMuchie,
          width: vertical ? lungimeLinie : latimeStralucire,
          height: vertical ? latimeStralucire : lungimeLinie,
          background: `linear-gradient(${directieGradient}, ${transparenta(c.accent, 0)} 0%, ${transparenta(c.accent, 26)} 50%, ${transparenta(c.accent, 0)} 100%)`,
          mixBlendMode: "screen",
          opacity: intensitate,
        }}
      />
      {/* linia fină de accent */}
      <div
        style={{
          ...pozitieMuchie,
          width: vertical ? lungimeLinie : grosime,
          height: vertical ? grosime : lungimeLinie,
          backgroundColor: c.accent,
          boxShadow: `0 0 ${18 * u}px ${transparenta(c.accent, 70)}`,
          opacity: Math.min(1, intensitate * 2.5),
        }}
      />
    </AbsoluteFill>
  );
};
