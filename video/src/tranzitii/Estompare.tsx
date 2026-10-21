import type { TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, interpolate } from "remotion";
import { EASE_IESIRE, EASE_INTRARE_IESIRE, useFormat } from "../tema";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Dizolvare optică: scena veche se apropie ușor și se încețoșează repede, apoi
 * se stinge lent; scena nouă vine peste ea din aceeași ceață și se așază, ușor
 * mai mare la început. Cele două se suprapun cât sunt amândouă încețoșate (deci
 * titlurile din același loc nu se calcă unul pe altul), dar opacitățile se
 * acoperă reciproc, așa că imaginea nu „clipește” prin negru la mijloc.
 */
export const Estompare: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
}) => {
  const { u } = useFormat();

  if (presentationDirection === "exiting") {
    const ceata = interpolate(p, [0, 0.4], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
    const stingere = interpolate(p, [0.25, 0.85], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
    const apropiere = interpolate(p, [0, 1], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
    return (
      <AbsoluteFill
        style={{
          opacity: 1 - stingere,
          scale: 1 + 0.05 * apropiere,
          filter: ceata > 0.001 ? `blur(${ceata * 16 * u}px)` : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }

  const aparitie = interpolate(p, [0.15, 1], [0, 1], { ...CLAMP, easing: EASE_IESIRE });
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(p, [0.15, 0.6], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE }),
        scale: 1.04 - 0.04 * aparitie,
        filter: aparitie < 0.999 ? `blur(${(1 - aparitie) * 16 * u}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
