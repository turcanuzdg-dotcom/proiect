import type { TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, interpolate } from "remotion";
import { EASE_IESIRE, EASE_INTRARE_IESIRE, useFormat } from "../tema";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Dizolvare prin întuneric: scena veche se apropie ușor, se estompează optic și
 * se stinge în culoarea fundalului; scena nouă vine din aceeași ceață și se
 * așază, ușor mai mare la început. Cele două se suprapun doar cât sunt amândouă
 * încețoșate, deci titlurile din același loc nu se calcă unul pe altul.
 */
export const Estompare: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
}) => {
  const { u } = useFormat();

  if (presentationDirection === "exiting") {
    const stingere = interpolate(p, [0, 0.7], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
    const apropiere = interpolate(p, [0, 1], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
    return (
      <AbsoluteFill
        style={{
          opacity: 1 - stingere,
          scale: 1 + 0.05 * apropiere,
          filter: stingere > 0.001 ? `blur(${stingere * 12 * u}px)` : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }

  const aparitie = interpolate(p, [0.3, 1], [0, 1], { ...CLAMP, easing: EASE_IESIRE });
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(p, [0.3, 0.85], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE }),
        scale: 1.04 - 0.04 * aparitie,
        filter: aparitie < 0.999 ? `blur(${(1 - aparitie) * 12 * u}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
