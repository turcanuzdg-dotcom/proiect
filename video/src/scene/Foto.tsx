import { AbsoluteFill } from "remotion";
import type { ScenaFoto } from "../date/tipuri";
import { FONT_TITLU, useCulori, useFormat } from "../tema";

// SCHELET: de înlocuit cu scena finală.
export const Foto: React.FC<{ scena: ScenaFoto }> = ({ scena }) => {
  const c = useCulori();
  const f = useFormat();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: c.fundal,
        color: c.text,
        fontFamily: FONT_TITLU,
        fontSize: 80 * f.u,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {scena.tip}
    </AbsoluteFill>
  );
};
