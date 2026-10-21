import type { TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { useCulori, useFormat } from "../tema";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE_GLISARE = Easing.bezier(0.76, 0, 0.24, 1);

/**
 * Scena nouă alunecă peste cea veche, ca o carte de joc cu colțuri rotunjite
 * care se așază pe tot cadrul; cea veche se retrage mai lent, mai mică și mai
 * întunecată (paralaxă). 16:9: din dreapta; 9:16: de jos, ca un „swipe”.
 */
export const Glisare: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const c = useCulori();
  const { u, vertical } = useFormat();
  const p = interpolate(presentationProgress, [0, 1], [0, 1], { ...CLAMP, easing: EASE_GLISARE });

  if (presentationDirection === "exiting") {
    const retragere = -26 * p;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill
          style={{
            translate: vertical ? `0 ${retragere}%` : `${retragere}% 0`,
            scale: 1 - 0.05 * p,
          }}
        >
          {children}
        </AbsoluteFill>
        <AbsoluteFill style={{ backgroundColor: c.fundal, opacity: 0.6 * p }} />
      </AbsoluteFill>
    );
  }

  const deplasare = 100 * (1 - p);
  const raza = 56 * u * (1 - p);
  return (
    <AbsoluteFill
      style={{
        translate: vertical ? `0 ${deplasare}%` : `${deplasare}% 0`,
        scale: 0.94 + 0.06 * p,
        borderRadius: raza,
        overflow: "hidden",
        boxShadow: p < 1 ? `0 0 ${90 * u}px rgba(0, 0, 0, ${0.55 * (1 - p)})` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
