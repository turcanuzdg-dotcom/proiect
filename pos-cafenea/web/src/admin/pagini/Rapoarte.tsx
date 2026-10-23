import { useMemo, useState } from 'react';
import { ETICHETE_MOTIVE, type MotivCasare, type RandComparatie, type RandVanzari } from '@cafenea/shared';
import { adaugaZile, formatCantitate, formatData, formatLei, formatNumar, ziLocala } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api } from '../api';
import { Actualizat, AlegeInterval, CapPagina, FiltruLocatie, Kpi, parametriInterval, presetari, Rand, Stare, Taburi, type IntervalZile } from '../componente';
import { useDate } from '../context';
import { BareOrizontale, BarePereche, GraficColoane, LegendaAB } from '../grafice';
import { ETICHETE_TIP_ARTICOL, type Articol } from '../tipuri';

/** Rapoartele nu se recalculează la fiecare vânzare: „actualizat la HH:MM” și Reîmprospătează. */
const FARA_LIVE = { live: false } as const;

type Tab = 'vanzari' | 'comparatie' | 'consum' | 'pierderi';
const TABURI: { cheie: Tab; titlu: string }[] = [
  { cheie: 'vanzari', titlu: 'Vânzări și profitabilitate' },
  { cheie: 'comparatie', titlu: 'Comparare perioade' },
  { cheie: 'consum', titlu: 'Consum materie primă' },
  { cheie: 'pierderi', titlu: 'Pierderi și casări' },
];

export function PaginaRapoarte({ sub, navigheaza }: PropsPagina) {
  const tab = (TABURI.find((t) => t.cheie === sub[0])?.cheie ?? 'vanzari') as Tab;
  const azi = ziLocala();
  const [perioada, setPerioada] = useState<IntervalZile>({ de: adaugaZile(azi, -29), pana: azi });
  const [locatie, setLocatie] = useState<number | null>(null);

  return (
    <>
      <CapPagina titlu="Rapoarte" subtitlu="Toate cifrele exclud comenzile anulate; casările apar separat, la pierderi." />
      <Taburi taburi={TABURI} activ={tab} onChange={(k) => navigheaza(`rapoarte/${k}`)} />
      {tab !== 'comparatie' && (
        <Rand>
          <AlegeInterval valoare={perioada} onChange={setPerioada} />
          <FiltruLocatie valoare={locatie} onChange={setLocatie} doarPuncte />
        </Rand>
      )}
      {tab === 'vanzari' && <RaportVanzari perioada={perioada} locatie={locatie} />}
      {tab === 'comparatie' && <RaportComparatie />}
      {tab === 'consum' && <RaportConsum perioada={perioada} locatie={locatie} />}
      {tab === 'pierderi' && <RaportPierderi perioada={perioada} locatie={locatie} />}
    </>
  );
}

function Grupare({ valoare, onChange }: { valoare: 'produs' | 'categorie'; onChange: (g: 'produs' | 'categorie') => void }) {
  return (
    <label className="camp camp-filtru">
      <span>Grupare</span>
      <select value={valoare} onChange={(e) => onChange(e.target.value as 'produs' | 'categorie')}>
        <option value="produs">Pe produse</option>
        <option value="categorie">Pe categorii</option>
      </select>
    </label>
  );
}

// ---------------- Vânzări ----------------

function RaportVanzari({ perioada, locatie }: { perioada: IntervalZile; locatie: number | null }) {
  const [grupare, setGrupare] = useState<'produs' | 'categorie'>('produs');
  const [ordonare, setOrdonare] = useState<'incasari' | 'cantitate' | 'marja' | 'marja_procent'>('incasari');
  const p = parametriInterval(perioada);
  const r = useDate(
    () => api.get<{ randuri: RandVanzari[]; serie: { zi: string; incasari: number; comenzi: number }[] }>('/api/rapoarte/vanzari', { ...p, locatie_id: locatie, grupare }),
    [p.de, p.pana, locatie, grupare],
    FARA_LIVE,
  );

  return (
    <>
      <Actualizat {...r} />
      <Stare {...r}>
        {(d) => {
          const total = d.randuri.reduce((s, x) => s + x.incasari, 0);
          const cost = d.randuri.reduce((s, x) => s + x.cost, 0);
          const comenzi = d.serie.reduce((s, x) => s + x.comenzi, 0);
          const randuri = [...d.randuri].sort((a, b) => (b[ordonare] ?? -Infinity) - (a[ordonare] ?? -Infinity));
          // Toate zilele intervalului, și cele fără vânzări, ca axa timpului să nu sară.
          const pezi = new Map(d.serie.map((x) => [x.zi, x]));
          const zile: string[] = [];
          for (let z = perioada.de; z <= perioada.pana && zile.length < 400; z = adaugaZile(z, 1)) zile.push(z);
          return (
            <>
              <div className="card grila-kpi">
                <Kpi eticheta="Încasări" valoare={formatLei(total)} />
                <Kpi eticheta="Cost ingrediente" valoare={formatLei(cost)} />
                <Kpi eticheta="Marjă brută" valoare={formatLei(total - cost)} nota={total ? `${formatNumar(((total - cost) / total) * 100)}% din încasări` : undefined} />
                <Kpi eticheta="Comenzi" valoare={formatNumar(comenzi)} nota={comenzi ? `bon mediu ${formatLei(total / comenzi)}` : undefined} />
              </div>
              {zile.length > 1 && (
                <div className="card">
                  <GraficColoane
                    titlu="Încasări pe zile"
                    formatValoare={formatLei}
                    puncte={zile.map((z) => {
                      const x = pezi.get(z);
                      return {
                        eticheta: `${z.slice(8, 10)}.${z.slice(5, 7)}`,
                        etichetaLunga: formatData(`${z}T12:00:00`),
                        valoare: x?.incasari ?? 0,
                        detaliu: `${x?.comenzi ?? 0} comenzi`,
                      };
                    })}
                  />
                </div>
              )}
              <Rand>
                <Grupare valoare={grupare} onChange={setGrupare} />
                <label className="camp camp-filtru">
                  <span>Ordonează după</span>
                  <select value={ordonare} onChange={(e) => setOrdonare(e.target.value as typeof ordonare)}>
                    <option value="incasari">Încasări (volum valoric)</option>
                    <option value="cantitate">Cantitate vândută</option>
                    <option value="marja">Marjă în lei (profitabilitate)</option>
                    <option value="marja_procent">Marjă %</option>
                  </select>
                </label>
              </Rand>
              {randuri.length === 0 ? (
                <div className="gol card">Nicio vânzare în intervalul ales.</div>
              ) : (
                <div className="tabel-container">
                  <table className="tabel">
                    <thead>
                      <tr>
                        <th>{grupare === 'produs' ? 'Produs' : 'Categorie'}</th>
                        <th className="num">Cantitate</th>
                        <th className="num">Încasări</th>
                        <th className="num">% din total</th>
                        <th className="num">Cost</th>
                        <th className="num">Marjă</th>
                        <th className="num">Marjă %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {randuri.map((x) => (
                        <tr key={x.cheie}>
                          <td>{x.nume}</td>
                          <td className="num">{formatNumar(x.cantitate)}</td>
                          <td className="num">{formatLei(x.incasari)}</td>
                          <td className="num slab">{total ? `${formatNumar((x.incasari / total) * 100)}%` : '—'}</td>
                          <td className="num">{formatLei(x.cost)}</td>
                          <td className="num">{formatLei(x.marja)}</td>
                          <td className="num">{x.marja_procent == null ? '—' : `${formatNumar(x.marja_procent)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Total</td>
                        <td className="num">{formatNumar(randuri.reduce((s, x) => s + x.cantitate, 0))}</td>
                        <td className="num">{formatLei(total)}</td>
                        <td className="num">100%</td>
                        <td className="num">{formatLei(cost)}</td>
                        <td className="num">{formatLei(total - cost)}</td>
                        <td className="num">{total ? `${formatNumar(((total - cost) / total) * 100)}%` : '—'}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          );
        }}
      </Stare>
    </>
  );
}

// ---------------- Comparare perioade ----------------

function presetariComparatie(): { titlu: string; a: IntervalZile; b: IntervalZile }[] {
  const azi = ziLocala();
  const d = new Date();
  const zi = (y: number, m: number, z: number) => ziLocala(new Date(y, m, z));
  // Săptămâna începe luni.
  const luni = adaugaZile(azi, -((d.getDay() + 6) % 7));
  const an = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  const p = presetari();
  const lunaAceasta = p.find((x) => x.titlu === 'Luna aceasta')!.interval;
  const lunaTrecuta = p.find((x) => x.titlu === 'Luna trecută')!.interval;
  return [
    { titlu: 'Săptămâna trecută vs. aceasta', a: { de: adaugaZile(luni, -7), pana: adaugaZile(luni, -1) }, b: { de: luni, pana: azi } },
    { titlu: 'Luna trecută vs. aceasta', a: lunaTrecuta, b: lunaAceasta },
    { titlu: `Iulie vs. august ${an}`, a: { de: zi(an, 6, 1), pana: zi(an, 6, 31) }, b: { de: zi(an, 7, 1), pana: zi(an, 7, 31) } },
    { titlu: `Vara vs. toamna ${an}`, a: { de: zi(an, 5, 1), pana: zi(an, 7, 31) }, b: { de: zi(an, 8, 1), pana: zi(an, 10, 30) } },
  ];
}

const nrZile = (i: IntervalZile) => Math.round((Date.parse(`${i.pana}T12:00:00`) - Date.parse(`${i.de}T12:00:00`)) / 86_400_000) + 1;

function RaportComparatie() {
  const preset = presetariComparatie();
  const [a, setA] = useState<IntervalZile>(preset[0].a);
  const [b, setB] = useState<IntervalZile>(preset[0].b);
  const [locatie, setLocatie] = useState<number | null>(null);
  const [grupare, setGrupare] = useState<'produs' | 'categorie'>('produs');
  const [cauta, setCauta] = useState('');
  const pa = parametriInterval(a);
  const pb = parametriInterval(b);
  const r = useDate(
    () =>
      api.get<{ randuri: RandComparatie[]; total_a: number; total_b: number }>('/api/rapoarte/comparatie', {
        a_de: pa.de,
        a_pana: pa.pana,
        b_de: pb.de,
        b_pana: pb.pana,
        locatie_id: locatie,
        grupare,
      }),
    [pa.de, pa.pana, pb.de, pb.pana, locatie, grupare],
    FARA_LIVE,
  );
  const activ = preset.find((x) => x.a.de === a.de && x.a.pana === a.pana && x.b.de === b.de && x.b.pana === b.pana);
  const eticheta = (i: IntervalZile) => `${formatData(`${i.de}T12:00:00`)} – ${formatData(`${i.pana}T12:00:00`)}`;

  return (
    <>
      <div className="card randuri-form">
        <div className="bara-filtre">
          {preset.map((x) => (
            <button
              key={x.titlu}
              type="button"
              className={activ === x ? 'buton' : 'buton-secundar'}
              onClick={() => {
                setA(x.a);
                setB(x.b);
              }}
            >
              {x.titlu}
            </button>
          ))}
        </div>
        <AlegeInterval eticheta="Perioada A" valoare={a} onChange={setA} />
        <AlegeInterval eticheta="Perioada B" valoare={b} onChange={setB} />
        <Rand>
          <FiltruLocatie valoare={locatie} onChange={setLocatie} doarPuncte />
          <Grupare valoare={grupare} onChange={setGrupare} />
          <label className="camp camp-filtru">
            <span>Caută</span>
            <input type="search" placeholder="de ex. Iced Coffee" value={cauta} onChange={(e) => setCauta(e.target.value)} />
          </label>
        </Rand>
      </div>
      <Actualizat {...r} />
      <Stare {...r}>
        {(d) => {
          const randuri = d.randuri.filter((x) => x.nume.toLowerCase().includes(cauta.trim().toLowerCase()));
          const max = Math.max(0, ...randuri.map((x) => Math.max(x.a_cantitate, x.b_cantitate)));
          const difTotal = d.total_b - d.total_a;
          const zileA = nrZile(a);
          const zileB = nrZile(b);
          return (
            <>
              <div className="card grila-kpi">
                <Kpi eticheta={`A: ${eticheta(a)}`} valoare={formatLei(d.total_a)} />
                <Kpi eticheta={`B: ${eticheta(b)}`} valoare={formatLei(d.total_b)} />
                <Kpi
                  eticheta="Diferență B − A"
                  valoare={<span className={difTotal < 0 ? 'minus' : difTotal > 0 ? 'plus' : ''}>{`${difTotal > 0 ? '+' : ''}${formatLei(difTotal)}`}</span>}
                  nota={d.total_a ? `${difTotal >= 0 ? '+' : ''}${formatNumar((difTotal / d.total_a) * 100)}%` : undefined}
                />
              </div>
              {zileA !== zileB && (
                <div className="alerta">
                  Perioadele au lungimi diferite (A: {zileA} zile, B: {zileB} zile). Media pe zi: A {formatLei(d.total_a / zileA)}, B {formatLei(d.total_b / zileB)}.
                </div>
              )}
              {randuri.length === 0 ? (
                <div className="gol card">Nicio vânzare pentru filtrele alese.</div>
              ) : (
                <>
                  <LegendaAB a={`A: ${eticheta(a)}`} b={`B: ${eticheta(b)}`} />
                  <div className="tabel-container">
                    <table className="tabel">
                      <thead>
                        <tr>
                          <th>{grupare === 'produs' ? 'Produs' : 'Categorie'}</th>
                          <th>Cantitate A / B</th>
                          <th className="num">Cant. A</th>
                          <th className="num">Cant. B</th>
                          <th className="num">Încasări A</th>
                          <th className="num">Încasări B</th>
                          <th className="num">Diferență</th>
                          <th className="num">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {randuri.map((x) => (
                          <tr key={x.cheie}>
                            <td>{x.nume}</td>
                            <td>
                              <BarePereche a={x.a_cantitate} b={x.b_cantitate} max={max} />
                            </td>
                            <td className="num">{formatNumar(x.a_cantitate)}</td>
                            <td className="num">{formatNumar(x.b_cantitate)}</td>
                            <td className="num">{formatLei(x.a_incasari)}</td>
                            <td className="num">{formatLei(x.b_incasari)}</td>
                            <td className={`num ${x.dif_incasari < 0 ? 'minus' : x.dif_incasari > 0 ? 'plus' : ''}`}>
                              {x.dif_incasari > 0 ? '+' : ''}
                              {formatLei(x.dif_incasari)}
                            </td>
                            <td className={`num ${x.dif_incasari < 0 ? 'minus' : x.dif_incasari > 0 ? 'plus' : ''}`}>
                              {x.dif_procent == null ? (x.b_incasari > 0 ? 'nou' : '—') : `${x.dif_procent > 0 ? '+' : ''}${formatNumar(x.dif_procent)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          );
        }}
      </Stare>
    </>
  );
}

// ---------------- Consum ----------------

interface RandConsum {
  locatie_id: number;
  locatie: string;
  articol_id: number;
  nume: string;
  um: string;
  tip: Articol['tip'];
  vanzari: number;
  casari: number;
  retur: number;
  valoare: number;
  total: number;
  total_afisat: number;
  um_afisat: string;
}

function RaportConsum({ perioada, locatie }: { perioada: IntervalZile; locatie: number | null }) {
  const p = parametriInterval(perioada);
  const [tip, setTip] = useState('');
  const r = useDate(() => api.get<RandConsum[]>('/api/rapoarte/consum', { ...p, locatie_id: locatie }), [p.de, p.pana, locatie], FARA_LIVE);
  return (
    <>
      <Rand>
        <label className="camp camp-filtru">
          <span>Tip articol</span>
          <select value={tip} onChange={(e) => setTip(e.target.value)}>
            <option value="">Toate</option>
            {Object.entries(ETICHETE_TIP_ARTICOL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </Rand>
      <Actualizat {...r} />
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Niciun consum în intervalul ales.">
        {(randuri) => {
          const lista = randuri.filter((x) => !tip || x.tip === tip);
          const locatii = [...new Map(lista.map((x) => [x.locatie_id, x.locatie])).entries()];
          return (
            <>
              <p className="slab mic">Consumul = ce s-a scos din stoc prin vânzări și casări, minus ce a revenit prin anulări. Valoarea e la costul mediu din momentul consumului.</p>
              {locatii.map(([id, nume]) => {
                const aici = lista.filter((x) => x.locatie_id === id);
                const valoare = aici.reduce((s, x) => s + x.valoare, 0);
                return (
                  <section key={id} className="sectiune">
                    <h2>
                      {nume} <span className="slab" style={{ fontSize: 14, fontWeight: 400 }}>· {formatLei(valoare)}</span>
                    </h2>
                    <div className="tabel-container">
                      <table className="tabel">
                        <thead>
                          <tr>
                            <th>Articol</th>
                            <th className="num">Consum total</th>
                            <th className="num">din vânzări</th>
                            <th className="num">din casări</th>
                            <th className="num">revenit (anulări)</th>
                            <th className="num">Valoare</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aici.map((x) => (
                            <tr key={x.articol_id}>
                              <td>
                                {x.nume}
                                <div className="slab mic">{ETICHETE_TIP_ARTICOL[x.tip]}</div>
                              </td>
                              <td className="num">
                                <strong>{formatCantitate(x.total_afisat, x.um_afisat)}</strong>
                              </td>
                              <td className="num">{formatCantitate(x.vanzari, x.um)}</td>
                              <td className="num">{x.casari ? formatCantitate(x.casari, x.um) : '—'}</td>
                              <td className="num">{x.retur ? formatCantitate(x.retur, x.um) : '—'}</td>
                              <td className="num">{formatLei(x.valoare)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={5}>Total {nume}</td>
                            <td className="num">{formatLei(valoare)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                );
              })}
            </>
          );
        }}
      </Stare>
    </>
  );
}

// ---------------- Pierderi ----------------

interface Pierderi {
  casari: { motiv: MotivCasare; eticheta: string; produse: number; valoare_cost: number; valoare_vanzare: number }[];
  casari_produse: { nume: string; motiv: MotivCasare; cantitate: number; valoare_cost: number }[];
  anulari: { restituit: boolean; comenzi: number; valoare_vanzare: number; valoare_cost: number }[];
  casari_anulate: number;
  inventar: { locatie: string; nume: string; um: string; cantitate: number; valoare: number }[];
  casa: { minus: number; plus: number };
  total_pierderi_cost: number;
}

function RaportPierderi({ perioada, locatie }: { perioada: IntervalZile; locatie: number | null }) {
  const p = parametriInterval(perioada);
  const r = useDate(() => api.get<Pierderi>('/api/rapoarte/pierderi', { ...p, locatie_id: locatie }), [p.de, p.pana, locatie], FARA_LIVE);
  return (
    <>
      <Actualizat {...r} />
      <Stare {...r}>
        {(d) => {
          const casari = d.casari.reduce((s, x) => s + x.valoare_cost, 0);
          const faraRestituire = d.anulari.find((x) => !x.restituit);
          const cuRestituire = d.anulari.find((x) => x.restituit);
          const minusInventar = d.inventar.filter((x) => x.valoare < 0).reduce((s, x) => s + x.valoare, 0);
          const plusInventar = d.inventar.filter((x) => x.valoare > 0).reduce((s, x) => s + x.valoare, 0);
          return (
            <PierderiContinut
              d={d}
              casari={casari}
              faraRestituire={faraRestituire}
              cuRestituire={cuRestituire}
              minusInventar={minusInventar}
              plusInventar={plusInventar}
            />
          );
        }}
      </Stare>
    </>
  );
}

function PierderiContinut(props: {
  d: Pierderi;
  casari: number;
  faraRestituire?: Pierderi['anulari'][number];
  cuRestituire?: Pierderi['anulari'][number];
  minusInventar: number;
  plusInventar: number;
}) {
  const { d } = props;
  const bareMotive = useMemo(() => d.casari.map((x) => ({ eticheta: x.eticheta, valoare: x.valoare_cost })), [d.casari]);
  return (
    <>
      <div className="card grila-kpi">
        <Kpi eticheta="Total pierderi (la cost)" valoare={formatLei(d.total_pierderi_cost)} nota="casări + anulări preparate + minus la inventar" />
        <Kpi eticheta="Casări" valoare={formatLei(props.casari)} nota={`${d.casari.reduce((s, x) => s + x.produse, 0)} produse`} />
        <Kpi eticheta="Anulări după preparare" valoare={formatLei(props.faraRestituire?.valoare_cost ?? 0)} nota={`${props.faraRestituire?.comenzi ?? 0} comenzi`} />
        <Kpi eticheta="Minus la inventar" valoare={<span className={props.minusInventar < 0 ? 'minus' : ''}>{formatLei(props.minusInventar)}</span>} nota={props.plusInventar ? `plusuri ${formatLei(props.plusInventar)}` : undefined} />
        <Kpi eticheta="Lipsă de numerar la ture" valoare={<span className={d.casa.minus < 0 ? 'minus' : ''}>{formatLei(d.casa.minus)}</span>} nota={d.casa.plus ? `plusuri ${formatLei(d.casa.plus)}` : undefined} />
      </div>

      <div className="grila-carduri late">
        <section className="card sectiune">
          <h2>Casări pe motive (la cost)</h2>
          {d.casari.length === 0 ? (
            <p className="slab">Nicio casare în interval.</p>
          ) : (
            <>
              <BareOrizontale randuri={bareMotive} formatValoare={formatLei} />
              <div className="tabel-container">
                <table className="tabel">
                  <thead>
                    <tr>
                      <th>Motiv</th>
                      <th className="num">Produse</th>
                      <th className="num">La cost</th>
                      <th className="num">La preț de vânzare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.casari.map((x) => (
                      <tr key={x.motiv}>
                        <td>{x.eticheta}</td>
                        <td className="num">{x.produse}</td>
                        <td className="num">{formatLei(x.valoare_cost)}</td>
                        <td className="num slab">{formatLei(x.valoare_vanzare)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="card sectiune">
          <h2>Produsele casate cel mai des</h2>
          {d.casari_produse.length === 0 ? (
            <p className="slab">—</p>
          ) : (
            <div className="tabel-container">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Produs</th>
                    <th>Motiv</th>
                    <th className="num">Cant.</th>
                    <th className="num">La cost</th>
                  </tr>
                </thead>
                <tbody>
                  {d.casari_produse.slice(0, 15).map((x) => (
                    <tr key={`${x.nume}-${x.motiv}`}>
                      <td>{x.nume}</td>
                      <td className="slab">{ETICHETE_MOTIVE[x.motiv] ?? x.motiv}</td>
                      <td className="num">{x.cantitate}</td>
                      <td className="num">{formatLei(x.valoare_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card sectiune">
          <h2>Anulări și retururi</h2>
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Tip</th>
                  <th className="num">Comenzi</th>
                  <th className="num">Restituit clienților</th>
                  <th className="num">Pierdere la cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Produs preparat, apoi anulat</td>
                  <td className="num">{props.faraRestituire?.comenzi ?? 0}</td>
                  <td className="num">{formatLei(props.faraRestituire?.valoare_vanzare ?? 0)}</td>
                  <td className="num minus">{formatLei(props.faraRestituire?.valoare_cost ?? 0)}</td>
                </tr>
                <tr>
                  <td>Anulat înainte de preparare (stoc restituit)</td>
                  <td className="num">{props.cuRestituire?.comenzi ?? 0}</td>
                  <td className="num">{formatLei(props.cuRestituire?.valoare_vanzare ?? 0)}</td>
                  <td className="num slab">0,00 lei</td>
                </tr>
                {d.casari_anulate > 0 && (
                  <tr>
                    <td>Casări anulate (fără bani)</td>
                    <td className="num">{d.casari_anulate}</td>
                    <td className="num slab">—</td>
                    <td className="num slab">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card sectiune">
          <h2>Diferențe la inventariere</h2>
          {d.inventar.length === 0 ? (
            <p className="slab">Nicio inventariere finalizată în interval.</p>
          ) : (
            <div className="tabel-container">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Gestiunea</th>
                    <th>Articol</th>
                    <th className="num">Cantitate</th>
                    <th className="num">Valoare</th>
                  </tr>
                </thead>
                <tbody>
                  {d.inventar.map((x) => (
                    <tr key={`${x.locatie}:${x.nume}`}>
                      <td>{x.locatie}</td>
                      <td>{x.nume}</td>
                      <td className={`num ${x.cantitate < 0 ? 'minus' : 'plus'}`}>{formatCantitate(x.cantitate, x.um)}</td>
                      <td className={`num ${x.valoare < 0 ? 'minus' : 'plus'}`}>{formatLei(x.valoare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
