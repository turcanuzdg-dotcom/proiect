import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCulori } from "../tema";

/**
 * Fundal închis „viu” pentru scenele fără fotografie: două lumini difuze
 * în culorile proiectului, care plutesc lent.
 */
export const Fundal: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const c = useCulori();
  const p = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: c.fundal, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${20 + 10 * p}% ${30 + 8 * p}%, ${c.principala}55 0%, transparent 45%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${85 - 12 * p}% ${80 - 10 * p}%, ${c.accent}33 0%, transparent 40%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Granulație fină de film peste tot cadrul (se schimbă la fiecare 2 cadre). */
export const Granulatie: React.FC<{ opacitate?: number }> = ({ opacitate = 0.07 }) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2) % 50;
  return (
    <AbsoluteFill style={{ opacity: opacitate, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id={`granulatie-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#granulatie-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};
