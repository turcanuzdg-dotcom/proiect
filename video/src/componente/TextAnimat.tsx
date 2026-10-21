import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_IESIRE } from "../tema";

/**
 * Text care apare cuvânt cu cuvânt, fiecare urcând dintr-o mască.
 * `start` și `pas` sunt în secunde.
 */
export const TextAnimat: React.FC<{
  text: string;
  start?: number;
  pas?: number;
  durata?: number;
  style?: CSSProperties;
}> = ({ text, start = 0, pas = 0.06, durata = 0.9, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cuvinte = text.split(/\s+/).filter(Boolean);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", ...style }}>
      {cuvinte.map((cuvant, i) => {
        const t0 = (start + i * pas) * fps;
        const p = interpolate(frame, [t0, t0 + durata * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE_IESIRE,
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              overflow: "hidden",
              // spațiu sub linie pentru diacriticele de jos (ș, ț) și coada literelor
              paddingBottom: "0.12em",
              marginBottom: "-0.12em",
              marginRight: i < cuvinte.length - 1 ? "0.28em" : 0,
            }}
          >
            <span
              style={{
                display: "inline-block",
                translate: `0 ${(1 - p) * 110}%`,
                opacity: interpolate(p, [0, 0.4], [0, 1], {
                  extrapolateRight: "clamp",
                }),
              }}
            >
              {cuvant}
            </span>
          </span>
        );
      })}
    </div>
  );
};
