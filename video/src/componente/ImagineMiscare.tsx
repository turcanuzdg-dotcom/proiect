import type { CSSProperties } from "react";
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export type Directie = "stanga" | "dreapta" | "sus" | "jos" | "centru";

const DEPLASARE: Record<Directie, [number, number]> = {
  stanga: [3, 0],
  dreapta: [-3, 0],
  sus: [0, 3],
  jos: [0, -3],
  centru: [0, 0],
};

/**
 * Fotografie pe tot cadrul cu efect Ken Burns: zoom lent și o ușoară deplasare,
 * liniar pe toată durata secvenței (mișcarea camerei nu trebuie să încetinească).
 * `src` = cale în public/ sau URL.
 */
export const ImagineMiscare: React.FC<{
  src: string;
  directie?: Directie;
  zoom?: [number, number];
  style?: CSSProperties;
}> = ({ src, directie = "centru", zoom = [1.06, 1.16], style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const [dx, dy] = DEPLASARE[directie];

  return (
    <Img
      src={src.startsWith("http") ? src : staticFile(src)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        scale: zoom[0] + (zoom[1] - zoom[0]) * p,
        translate: `${dx * (p - 0.5)}% ${dy * (p - 0.5)}%`,
        ...style,
      }}
    />
  );
};
