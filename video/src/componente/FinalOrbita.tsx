import { AbsoluteFill } from "remotion";
import { transparenta, useCulori, useFormat } from "../tema";

const punct = (cx: number, cy: number, r: number, grade: number) => {
  const a = (grade * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};

/**
 * Elementul de mișcare al scenei finale, în spatele textului: un inel fin
 * „desenat” de o cometă în culoarea de accent, care apoi continuă să orbiteze
 * lent, și un cadran de gradații foarte discret care se rotește invers.
 *
 * `desen` (0–1) = cât din inel e desenat; `secunde` = timpul scurs, pentru
 * rotația continuă (liniară, ca mișcarea să nu se oprească în timpul menținerii).
 */
export const FinalOrbita: React.FC<{
  cx: number;
  cy: number;
  raza: number;
  desen: number;
  secunde: number;
  /** 0–1, liniar pe toată scena: inelul se apropie puțin mai repede decât textul (paralaxă). */
  deriva?: number;
  opacitate?: number;
}> = ({ cx, cy, raza, desen, secunde, deriva = 0, opacitate = 1 }) => {
  const c = useCulori();
  const f = useFormat();
  const { u } = f;

  const circumferinta = 2 * Math.PI * raza;
  const grosime = Math.max(1, 1.5 * u);

  // Capul cometei conduce desenul inelului, apoi merge mai departe, lent.
  const VITEZA = 11; // grade pe secundă
  const unghiCap = -90 + 360 * desen + VITEZA * secunde;
  const COADA = 78; // grade
  const start = punct(cx, cy, raza, -COADA);
  const cap = punct(cx, cy, raza, 0);
  const arc = `M ${start.x} ${start.y} A ${raza} ${raza} 0 0 1 ${cap.x} ${cap.y}`;

  // Cadranul: gradații scurte pe un cerc mai mare, rotite invers, foarte încet.
  const razaCadran = raza * 1.2;
  const nrGradatii = 120;
  const pasGradatii = (2 * Math.PI * razaCadran) / nrGradatii;
  const vizibilCadran = Math.min(1, Math.max(0, (desen - 0.25) / 0.6));

  return (
    <AbsoluteFill
      style={{
        opacity: opacitate,
        pointerEvents: "none",
        scale: 1 + 0.05 * deriva,
        transformOrigin: `${cx}px ${cy}px`,
      }}
    >
      <svg width={f.latime} height={f.inaltime} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="final-coada" gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={cap.x} y2={cap.y}>
            <stop offset="0" stopColor={c.accent} stopOpacity={0} />
            <stop offset="0.7" stopColor={c.accent} stopOpacity={0.45} />
            <stop offset="1" stopColor={c.accent} stopOpacity={0.95} />
          </linearGradient>
          <radialGradient id="final-halou">
            <stop offset="0" stopColor={c.accent} stopOpacity={0.55} />
            <stop offset="0.35" stopColor={c.accent} stopOpacity={0.16} />
            <stop offset="1" stopColor={c.accent} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="final-lumina">
            <stop offset="0" stopColor={c.principala} stopOpacity={0.16} />
            <stop offset="1" stopColor={c.principala} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* lumină difuză în centrul inelului, ca textul să aibă un „ecran” */}
        <circle cx={cx} cy={cy} r={raza * 1.1} fill="url(#final-lumina)" opacity={desen} />

        {/* cadranul de gradații */}
        <circle
          cx={cx}
          cy={cy}
          r={razaCadran}
          fill="none"
          stroke={c.text}
          strokeOpacity={0.13 * vizibilCadran}
          strokeWidth={10 * u}
          strokeDasharray={`${Math.max(1, 1.5 * u)} ${pasGradatii - Math.max(1, 1.5 * u)}`}
          transform={`rotate(${-4 * secunde} ${cx} ${cy})`}
        />
        <circle
          cx={cx}
          cy={cy}
          r={razaCadran + 9 * u}
          fill="none"
          stroke={c.text}
          strokeOpacity={0.07 * vizibilCadran}
          strokeWidth={grosime}
        />

        {/* inelul principal, desenat din vârf, în sensul acelor de ceasornic */}
        <circle
          cx={cx}
          cy={cy}
          r={raza}
          fill="none"
          stroke={c.text}
          strokeOpacity={0.2}
          strokeWidth={grosime}
          strokeDasharray={circumferinta}
          strokeDashoffset={circumferinta * (1 - desen)}
          transform={`rotate(-90 ${cx} ${cy})`}
        />

        {/* cometa: coadă în degrade și un cap luminos */}
        <g transform={`rotate(${unghiCap} ${cx} ${cy})`} opacity={Math.min(1, desen * 4)}>
          <path d={arc} fill="none" stroke="url(#final-coada)" strokeWidth={Math.max(1.5, 3 * u)} strokeLinecap="round" />
          <circle cx={cap.x} cy={cap.y} r={34 * u} fill="url(#final-halou)" />
          <circle cx={cap.x} cy={cap.y} r={Math.max(2, 4.5 * u)} fill={c.accent} />
          <circle cx={cap.x} cy={cap.y} r={Math.max(1, 2 * u)} fill={transparenta(c.text, 90)} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
