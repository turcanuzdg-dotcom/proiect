// Grafice simple în SVG, fără bibliotecă. O singură serie = o singură culoare (caramel),
// comparația A/B = albastru/portocaliu (paletă validată pentru daltonism).

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

export const CULOARE_SERIE = '#c8742c';
export const CULOARE_SERIE_ACTIVA = '#9c5518';
export const CULOARE_A = '#2a78d6';
export const CULOARE_B = '#eb6834';
const GRILA = '#e8e2d9';
const AXA = '#c9bfb2';

function latimeContainer(ref: RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Repere „rotunde” pe axa Y: 0, pas, 2·pas… cu pasul din 1/2/2,5/5 × 10^k. */
function repere(max: number, tinta = 4): number[] {
  if (max <= 0) return [0];
  const brut = max / tinta;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= brut) ?? 10 * p;
  const r: number[] = [];
  for (let v = 0; v <= max + pas * 0.001; v += pas) r.push(Math.round(v * 1000) / 1000);
  if (r[r.length - 1] < max) r.push(r[r.length - 1] + pas);
  return r;
}

const compact = new Intl.NumberFormat('ro-MD', { notation: 'compact', maximumFractionDigits: 1 });

/** Bară cu capătul de date rotunjit (4px) și baza dreaptă. */
function caleColoana(x: number, y: number, w: number, baza: number, r = 4) {
  const h = baza - y;
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${baza}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${baza}Z`;
}

export interface PunctColoana {
  eticheta: string;
  etichetaLunga: string;
  valoare: number;
  detaliu?: string;
}

export function GraficColoane({ puncte, formatValoare, titlu }: { puncte: PunctColoana[]; formatValoare: (v: number) => string; titlu: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const latime = latimeContainer(ref);
  const [activ, setActiv] = useState<number | null>(null);
  const [tabel, setTabel] = useState(false);
  useEffect(() => setActiv(null), [puncte]);

  const inaltime = 220;
  const m = { sus: 12, jos: 26, stanga: 52, dreapta: 8 };
  const latimePlot = Math.max(100, latime - m.stanga - m.dreapta);
  const baza = inaltime - m.jos;
  const max = Math.max(0, ...puncte.map((p) => p.valoare));
  const ticks = repere(max);
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => baza - (v / top) * (baza - m.sus);
  const banda = puncte.length ? latimePlot / puncte.length : latimePlot;
  const wBara = Math.max(2, Math.min(24, banda - 2));
  const pasEticheta = Math.max(1, Math.ceil(48 / banda));

  const tasta = (e: KeyboardEvent) => {
    if (!puncte.length) return;
    if (e.key === 'ArrowRight') setActiv((a) => Math.min(puncte.length - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActiv((a) => Math.max(0, (a ?? puncte.length) - 1));
    else return;
    e.preventDefault();
  };

  const p = activ != null ? puncte[activ] : null;
  const xActiv = activ != null ? m.stanga + banda * activ + banda / 2 : 0;

  return (
    <div className="grafic">
      <div className="grafic-cap">
        <h3>{titlu}</h3>
        <button type="button" className="buton-link mic" onClick={() => setTabel((t) => !t)}>
          {tabel ? 'Vezi graficul' : 'Vezi ca tabel'}
        </button>
      </div>
      {tabel ? (
        <div className="tabel-container" style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table className="tabel">
            <thead>
              <tr>
                <th>Ziua</th>
                <th className="num">Valoare</th>
                <th>Detaliu</th>
              </tr>
            </thead>
            <tbody>
              {puncte.map((x) => (
                <tr key={x.etichetaLunga}>
                  <td>{x.etichetaLunga}</td>
                  <td className="num">{formatValoare(x.valoare)}</td>
                  <td className="slab">{x.detaliu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="grafic-zona" onPointerLeave={() => setActiv(null)}>
          <svg
            width={latime}
            height={inaltime}
            role="img"
            aria-label={`${titlu}. Folosiți săgețile stânga/dreapta pentru valori.`}
            tabIndex={0}
            onKeyDown={tasta}
            onBlur={() => setActiv(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.stanga} x2={latime - m.dreapta} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXA : GRILA} strokeWidth={1} />
                <text x={m.stanga - 8} y={y(t)} dy="0.32em" textAnchor="end" className="grafic-text">
                  {compact.format(t)}
                </text>
              </g>
            ))}
            {puncte.map((pt, i) => {
              const x = m.stanga + banda * i + (banda - wBara) / 2;
              return (
                <path
                  key={pt.etichetaLunga}
                  d={caleColoana(x, y(pt.valoare), wBara, baza)}
                  fill={activ === i ? CULOARE_SERIE_ACTIVA : CULOARE_SERIE}
                />
              );
            })}
            {puncte.map((pt, i) =>
              i % pasEticheta === 0 ? (
                <text key={`e${pt.etichetaLunga}`} x={m.stanga + banda * i + banda / 2} y={baza + 17} textAnchor="middle" className="grafic-text">
                  {pt.eticheta}
                </text>
              ) : null,
            )}
            {/* Zone de atingere pe toată înălțimea benzii: cititorul țintește ziua, nu bara. */}
            {puncte.map((pt, i) => (
              <rect
                key={`h${pt.etichetaLunga}`}
                x={m.stanga + banda * i}
                y={m.sus}
                width={banda}
                height={baza - m.sus}
                fill="transparent"
                onPointerEnter={() => setActiv(i)}
                onPointerMove={() => setActiv(i)}
              />
            ))}
          </svg>
          {p && (
            <div
              className="grafic-tooltip"
              style={{ left: Math.min(Math.max(xActiv, 70), latime - 70), top: Math.max(0, y(p.valoare) - 8) }}
            >
              <strong>{formatValoare(p.valoare)}</strong>
              <span>{p.etichetaLunga}</span>
              {p.detaliu && <span>{p.detaliu}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Două bare orizontale subțiri (A sus, B jos) pentru un rând din tabelul de comparație. */
export function BarePereche({ a, b, max }: { a: number; b: number; max: number }) {
  const w = 140;
  const h = 7;
  const lung = (v: number) => (max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * w) : 0);
  const bara = (v: number, yy: number, c: string) => {
    const L = lung(v);
    if (!L) return null;
    const r = Math.min(4, L / 2, h / 2);
    return <path d={`M0,${yy}H${L - r}Q${L},${yy} ${L},${yy + r}V${yy + h - r}Q${L},${yy + h} ${L - r},${yy + h}H0Z`} fill={c} />;
  };
  return (
    <svg width={w} height={h * 2 + 2} aria-hidden="true" className="bare-pereche">
      {bara(a, 0, CULOARE_A)}
      {bara(b, h + 2, CULOARE_B)}
    </svg>
  );
}

export function LegendaAB({ a, b }: { a: string; b: string }) {
  return (
    <div className="legenda">
      <span>
        <i style={{ background: CULOARE_A }} /> {a}
      </span>
      <span>
        <i style={{ background: CULOARE_B }} /> {b}
      </span>
    </div>
  );
}

/** Bare orizontale cu o singură serie; valoarea stă lângă capătul barei, în culoarea textului. */
export function BareOrizontale({ randuri, formatValoare }: { randuri: { eticheta: string; valoare: number }[]; formatValoare: (v: number) => string }) {
  const max = Math.max(0, ...randuri.map((r) => r.valoare));
  return (
    <div className="bare-orizontale">
      {randuri.map((r) => (
        <div key={r.eticheta} className="bara-rand" title={`${r.eticheta}: ${formatValoare(r.valoare)}`}>
          <span className="bara-eticheta">{r.eticheta}</span>
          <span className="bara-pista">
            <span className="bara-umplere" style={{ width: `${max > 0 ? Math.max(1, (r.valoare / max) * 100) : 0}%`, background: CULOARE_SERIE }} />
          </span>
          <span className="bara-valoare num">{formatValoare(r.valoare)}</span>
        </div>
      ))}
    </div>
  );
}
