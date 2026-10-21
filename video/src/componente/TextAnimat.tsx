import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_IESIRE } from "../tema";
import { SPATIU_CUVINTE } from "./masuraText";

/**
 * Text care apare cuvânt cu cuvânt, fiecare urcând dintr-o mască.
 * `start`, `pas`, `durata` și `cascada` sunt în secunde.
 * `cascada` (opțional) limitează toată cascada: pasul scade cât să încapă
 * oricâte cuvinte în acel timp.
 *
 * Cuvintele sunt despărțite cu `columnGap` (0,28 em), care nu ocupă loc la capăt
 * de rând: rândurile centrate stau cu adevărat pe centru, iar măsurătorile din
 * masuraText.ts corespund încadrării din browser.
 */
export const TextAnimat: React.FC<{
  text: string;
  start?: number;
  pas?: number;
  durata?: number;
  cascada?: number;
  style?: CSSProperties;
}> = ({ text, start = 0, pas = 0.06, durata = 0.9, cascada, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cuvinte = text.split(/\s+/).filter(Boolean);
  const pasEfectiv =
    cascada !== undefined && cuvinte.length > 1 ? Math.min(pas, cascada / (cuvinte.length - 1)) : pas;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: `${SPATIU_CUVINTE}em`, ...style }}>
      {cuvinte.map((cuvant, i) => {
        const t0 = (start + i * pasEfectiv) * fps;
        const p = interpolate(frame, [t0, t0 + Math.max(1, durata * fps)], [0, 1], {
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
              // spațiu în mască pentru accentele de sus (Ă, Î, Â) și virgula de sub ș, ț,
              // care în Unbounded coboară 0,33 em sub linia de bază (la înălțimea de rând
              // 1,05 rândul se termină la 0,15 em, deci masca trebuie să mai aibă ~0,2 em);
              // marginile negative păstrează exact aceeași așezare a rândurilor
              paddingTop: "0.16em",
              marginTop: "-0.16em",
              paddingBottom: "0.24em",
              marginBottom: "-0.24em",
            }}
          >
            <span
              style={{
                display: "inline-block",
                translate: `0 ${(1 - p) * 125}%`, // pornește complet sub mască, chiar și cu accente
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
