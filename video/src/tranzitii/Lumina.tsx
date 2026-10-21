import type { TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, interpolate } from "remotion";
import { EASE_INTRARE_IESIRE, useCulori, useFormat } from "../tema";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Dizolvare printr-o lumină caldă de film („light leak”), desenată din gradiente,
 * deci deterministă și ieftină: o pată de lumină în tonurile accentului trece
 * prin cadru, iar sub ea o scenă se supraexpune ușor și o lasă pe cealaltă să apară.
 * Tonurile sunt calde (chihlimbar, portocaliu) pentru orice paletă; accentul doar le nuanțează.
 */
export const Lumina: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
}) => {
  const c = useCulori();
  const { u } = useFormat();

  // Schimbul de scene se ascunde sub vârful luminii (p ≈ 0,36): scena veche se
  // supraexpune, se estompează optic și dispare până la p = 0,5, înainte ca textele
  // scenei noi să urce; cele două titluri nu apar niciodată clare unul peste altul.
  if (presentationDirection === "exiting") {
    const expunere = interpolate(p, [0, 0.45], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
    const disparitie = interpolate(p, [0.3, 0.5], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
    return (
      <AbsoluteFill
        style={{
          opacity: 1 - disparitie,
          filter:
            expunere > 0.001
              ? `brightness(${1 + 0.35 * expunere}) saturate(${1 + 0.15 * expunere}) blur(${expunere * 10 * u}px)`
              : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }

  const aparitie = interpolate(p, [0.22, 0.48], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
  const revenire = interpolate(p, [0.22, 1], [0, 1], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
  // anvelopa luminii: urcă repede, coboară lent
  const lumina = interpolate(p, [0, 0.36, 1], [0, 1, 0], { ...CLAMP, easing: EASE_INTRARE_IESIRE });
  const x = interpolate(p, [0, 1], [-10, 95]); // centrul petei, în procente din lățime
  // o lumină de film e caldă indiferent de paletă; accentul o nuanțează doar puțin
  const cald = `color-mix(in srgb, #ff7a2a 78%, ${c.accent})`;
  const miez = `color-mix(in srgb, #fff1d6 80%, ${c.accent})`;
  const auriu = `color-mix(in srgb, #ffbe5c 75%, ${c.accent})`;

  return (
    <>
      <AbsoluteFill
        style={{
          opacity: aparitie,
          filter: revenire < 0.999 ? `brightness(${1.35 - 0.35 * revenire})` : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
      <AbsoluteFill style={{ mixBlendMode: "screen", opacity: lumina, pointerEvents: "none" }}>
        <AbsoluteFill
          style={{
            background: [
              // miezul fierbinte, aproape alb
              `radial-gradient(ellipse 20% 36% at ${x}% 44%, ${miez} 0%, transparent 100%)`,
              // pata caldă, mare
              `radial-gradient(ellipse 58% 88% at ${x - 10}% 56%, ${cald} 0%, transparent 70%)`,
              // o a doua lumină, mai rece și mai sus
              `radial-gradient(ellipse 40% 62% at ${x + 30}% 16%, color-mix(in srgb, ${auriu} 60%, transparent) 0%, transparent 70%)`,
              // marginea filmului, arsă
              `linear-gradient(90deg, color-mix(in srgb, ${cald} 50%, transparent) 0%, transparent 30%)`,
              // ceața caldă de pe tot cadrul
              `linear-gradient(color-mix(in srgb, ${auriu} 12%, transparent), color-mix(in srgb, ${auriu} 12%, transparent))`,
            ].join(", "),
          }}
        />
      </AbsoluteFill>
    </>
  );
};
