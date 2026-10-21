import { useEffect, useState } from 'react';
import { Modal } from '../../comun/Modal';
import { formatCantitate, formatDataOra, formatLei } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api, mesajEroare } from '../api';
import { CapPagina, Dif, FiltruLocatie, Rand, Stare } from '../componente';
import { useAdmin, useDate } from '../context';
import { ETICHETE_TIP_ARTICOL, type Articol } from '../tipuri';

interface Inventariere {
  id: number;
  locatie: string;
  locatie_id: number;
  stare: 'deschisa' | 'finalizata';
  inceputa_la: string;
  finalizata_la: string | null;
  utilizator: string | null;
  nr_linii: number;
  valoare_diferente: number;
}

interface Raport {
  id: number;
  locatie: string;
  locatie_id: number;
  stare: 'deschisa' | 'finalizata';
  inceputa_la: string;
  finalizata_la: string | null;
  linii: { articol_id: number; nume: string; um: string; tip: Articol['tip']; scriptic: number; faptic: number | null; diferenta: number | null; valoare: number | null; numarat_la: string | null }[];
  numarate: number;
  total_plus: number;
  total_minus: number;
  total_net: number;
}

export function PaginaInventarieri({ sub, navigheaza }: PropsPagina) {
  const { arata, locatii } = useAdmin();
  const [locatie, setLocatie] = useState<number | null>(null);
  const [incepe, setIncepe] = useState(false);
  const r = useDate(() => api.get<Inventariere[]>('/api/inventarieri', { locatie_id: locatie }), [locatie]);
  const deschisa = sub[0] ? Number(sub[0]) : null;

  return (
    <>
      <CapPagina
        titlu="Inventarieri"
        subtitlu="Stocul numărat (faptic) comparat cu cel din sistem (scriptic). Se poate face și de pe tableta din cafenea."
        actiuni={
          <button type="button" className="buton" onClick={() => setIncepe(true)}>
            + Începe inventarierea
          </button>
        }
      />
      <Rand>
        <FiltruLocatie valoare={locatie} onChange={setLocatie} eticheta="Gestiunea" />
      </Rand>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Nicio inventariere încă.">
        {(lista) => (
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Începută</th>
                  <th>Gestiunea</th>
                  <th>De către</th>
                  <th className="num">Articole numărate</th>
                  <th className="num">Valoarea diferențelor</th>
                  <th>Stare</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <tr key={i.id} className="clic" onClick={() => navigheaza(`inventarieri/${i.id}`)}>
                    <td>{formatDataOra(i.inceputa_la)}</td>
                    <td>{i.locatie}</td>
                    <td>{i.utilizator ?? 'tableta'}</td>
                    <td className="num">{i.nr_linii}</td>
                    <td className="num">{i.stare === 'finalizata' ? <Dif valoare={i.valoare_diferente} lei /> : '—'}</td>
                    <td>{i.stare === 'deschisa' ? <span className="insigna info">în lucru</span> : <span className="insigna succes">finalizată {formatDataOra(i.finalizata_la)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stare>
      {incepe && (
        <IncepeInventariere
          locatii={locatii.filter((l) => l.activ)}
          onInchide={() => setIncepe(false)}
          onPornit={(id) => {
            setIncepe(false);
            r.reincarca();
            navigheaza(`inventarieri/${id}`);
          }}
          onEroare={(m) => arata(m, 'pericol')}
        />
      )}
      {deschisa != null && !Number.isNaN(deschisa) && <FoaieInventar id={deschisa} onInchide={() => navigheaza('inventarieri')} />}
    </>
  );
}

function IncepeInventariere(props: { locatii: { id: number; nume: string }[]; onInchide: () => void; onPornit: (id: number) => void; onEroare: (m: string) => void }) {
  const [locatie, setLocatie] = useState<number | null>(props.locatii[0]?.id ?? null);
  return (
    <Modal
      titlu="Începe inventarierea"
      onInchide={props.onInchide}
      subsol={
        <>
          <button type="button" className="buton-secundar" onClick={props.onInchide}>
            Renunță
          </button>
          <button
            type="button"
            className="buton"
            disabled={!locatie}
            onClick={async () => {
              try {
                const r = await api.post<{ id: number }>('/api/inventarieri', { locatie_id: locatie });
                props.onPornit(r.id);
              } catch (e) {
                props.onEroare(mesajEroare(e));
              }
            }}
          >
            Începe
          </button>
        </>
      }
    >
      <div className="randuri-form">
        <FiltruLocatie valoare={locatie} onChange={setLocatie} faraToate eticheta="Gestiunea inventariată" />
        <p className="slab mic">Dacă gestiunea are deja o inventariere în lucru (de ex. pornită de pe tabletă), se deschide aceea.</p>
      </div>
    </Modal>
  );
}

function FoaieInventar({ id, onInchide }: { id: number; onInchide: () => void }) {
  const { arata } = useAdmin();
  const r = useDate(() => api.get<Raport>(`/api/inventarieri/${id}`), [id]);
  const [valori, setValori] = useState<Record<number, string>>({});
  const [cauta, setCauta] = useState('');
  const [lucreaza, setLucreaza] = useState(false);

  // Valorile deja salvate pe server apar în câmpuri; ce tastează adminul are prioritate.
  useEffect(() => {
    if (!r.date) return;
    setValori((v) => {
      const nou: Record<number, string> = {};
      for (const l of r.date!.linii) nou[l.articol_id] = v[l.articol_id] ?? (l.faptic != null ? String(l.faptic) : '');
      return nou;
    });
  }, [r.date]);

  const modificate = () =>
    (r.date?.linii ?? [])
      .filter((l) => (valori[l.articol_id] ?? '') !== (l.faptic != null ? String(l.faptic) : ''))
      .map((l) => {
        const s = (valori[l.articol_id] ?? '').trim().replace(',', '.');
        return { articol_id: l.articol_id, faptic: s === '' ? null : Number(s) };
      });

  const salveaza = async () => {
    const linii = modificate();
    if (linii.some((l) => l.faptic != null && (!Number.isFinite(l.faptic) || l.faptic < 0))) {
      arata('Cantitățile numărate trebuie să fie numere pozitive', 'pericol');
      return false;
    }
    if (!linii.length) return true;
    setLucreaza(true);
    try {
      await api.put(`/api/inventarieri/${id}/linii`, { linii });
      r.reincarca();
      arata('Numărătoarea a fost salvată');
      return true;
    } catch (e) {
      arata(mesajEroare(e), 'pericol');
      return false;
    } finally {
      setLucreaza(false);
    }
  };

  const finalizeaza = async () => {
    if (!(await salveaza())) return;
    if (!window.confirm('Finalizați inventarierea? Diferențele se înregistrează în stoc și foaia nu mai poate fi modificată.')) return;
    setLucreaza(true);
    try {
      await api.post(`/api/inventarieri/${id}/finalizeaza`);
      arata('Inventarierea a fost finalizată; stocul a fost aliniat la faptic');
      r.reincarca();
    } catch (e) {
      arata(mesajEroare(e), 'pericol');
    } finally {
      setLucreaza(false);
    }
  };

  const d = r.date;
  const deschisa = d?.stare === 'deschisa';
  return (
    <Modal
      titlu={d ? `Inventariere ${d.locatie} · ${formatDataOra(d.inceputa_la)}` : 'Inventariere'}
      onInchide={onInchide}
      lat
      subsol={
        deschisa ? (
          <>
            <span className="slab" style={{ marginRight: 'auto', alignSelf: 'center' }}>
              Numărate: {d.numarate} · net <Dif valoare={d.total_net} lei />
            </span>
            <button type="button" className="buton-secundar" disabled={lucreaza} onClick={salveaza}>
              Salvează
            </button>
            <button type="button" className="buton" disabled={lucreaza} onClick={finalizeaza}>
              Finalizează și aliniază stocul
            </button>
          </>
        ) : undefined
      }
    >
      <Stare {...r}>
        {(d) => {
          const linii = d.linii.filter((l) => l.nume.toLowerCase().includes(cauta.trim().toLowerCase()));
          return (
            <div className="randuri-form">
              {d.stare === 'finalizata' ? (
                <div className="grila-kpi card">
                  <div className="kpi">
                    <span className="kpi-eticheta">Plusuri</span>
                    <span className="kpi-valoare plus">{formatLei(d.total_plus)}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-eticheta">Minusuri</span>
                    <span className="kpi-valoare minus">{formatLei(d.total_minus)}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-eticheta">Net</span>
                    <span className="kpi-valoare">{formatLei(d.total_net)}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-eticheta">Finalizată</span>
                    <span className="kpi-valoare" style={{ fontSize: 16 }}>{formatDataOra(d.finalizata_la)}</span>
                  </div>
                </div>
              ) : (
                <p className="slab mic">
                  Scripticul articolelor nenumărate e cel de acum și se schimbă la fiecare vânzare; după numărare, un articol e comparat cu stocul din momentul numărării. Câmp gol = nenumărat.
                </p>
              )}
              <input type="search" placeholder="Caută articolul" value={cauta} onChange={(e) => setCauta(e.target.value)} />
              <div className="tabel-container">
                <table className="tabel">
                  <thead>
                    <tr>
                      <th>Articol</th>
                      <th className="num">Scriptic</th>
                      <th className="num">Faptic (numărat)</th>
                      <th className="num">Diferență</th>
                      <th className="num">Valoare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linii.map((l) => (
                      <tr key={l.articol_id}>
                        <td>
                          {l.nume}
                          <div className="slab mic">{ETICHETE_TIP_ARTICOL[l.tip]}</div>
                        </td>
                        <td className="num">{formatCantitate(l.scriptic, l.um)}</td>
                        <td className="num">
                          {d.stare === 'deschisa' ? (
                            <span className="cu-um" style={{ justifyContent: 'flex-end' }}>
                              <input
                                className="input-mic"
                                inputMode="decimal"
                                aria-label={`Faptic ${l.nume}`}
                                value={valori[l.articol_id] ?? ''}
                                onChange={(e) => setValori((v) => ({ ...v, [l.articol_id]: e.target.value }))}
                              />
                              <span className="um">{l.um}</span>
                            </span>
                          ) : (
                            formatCantitate(l.faptic ?? 0, l.um)
                          )}
                        </td>
                        <td className="num">{l.diferenta == null ? <span className="slab">nenumărat</span> : <Dif valoare={l.diferenta} um={l.um} />}</td>
                        <td className="num">{l.valoare == null ? '—' : <Dif valoare={l.valoare} lei />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }}
      </Stare>
    </Modal>
  );
}
