import { useState } from 'react';
import { Modal } from '../../comun/Modal';
import { formatCantitate, formatDataOra, formatLei, formatNumar } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api } from '../api';
import { CapPagina, FiltruLocatie, Rand, Stare } from '../componente';
import { useAdmin, useDate } from '../context';
import { ETICHETE_MISCARE_STOC, ETICHETE_TIP_ARTICOL, type Articol } from '../tipuri';

interface Matrice {
  locatii: { id: number; nume: string; tip: string }[];
  articole: (Articol & { stocuri: Record<string, number> })[];
}

interface RandStoc {
  articol_id: number;
  nume: string;
  um: string;
  tip: Articol['tip'];
  prag_minim: number;
  cost_mediu: number;
  stoc: number;
  valoare: number;
  sub_prag: boolean;
}

const DOCUMENTE: Record<string, string> = {
  comanda: 'Comandă',
  anulare: 'Anulare',
  receptie: 'Recepție',
  transfer: 'Transfer',
  inventariere: 'Inventariere',
};

export function PaginaStocuri(_: PropsPagina) {
  const [locatie, setLocatie] = useState<number | null>(null);
  const [cauta, setCauta] = useState('');
  const [tip, setTip] = useState('');
  const [fisa, setFisa] = useState<{ locatie_id: number; articol_id: number; nume: string; um: string } | null>(null);
  const { locatii } = useAdmin();

  const filtru = (a: { nume: string; tip: string }) => (!tip || a.tip === tip) && a.nume.toLowerCase().includes(cauta.trim().toLowerCase());

  return (
    <>
      <CapPagina
        titlu="Stocuri"
        subtitlu="Stocul scriptic = suma tuturor mișcărilor (recepții, transferuri, vânzări, casări, inventarieri). Apăsați un articol pentru fișa lui."
      />
      <Rand>
        <FiltruLocatie valoare={locatie} onChange={setLocatie} eticheta="Gestiunea" />
        <label className="camp camp-filtru">
          <span>Tip</span>
          <select value={tip} onChange={(e) => setTip(e.target.value)}>
            <option value="">Toate</option>
            {Object.entries(ETICHETE_TIP_ARTICOL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="camp camp-filtru">
          <span>Caută</span>
          <input type="search" placeholder="de ex. lapte" value={cauta} onChange={(e) => setCauta(e.target.value)} />
        </label>
      </Rand>
      {locatie == null ? (
        <MatriceStocuri filtru={filtru} onFisa={setFisa} />
      ) : (
        <StocLocatie locatieId={locatie} numeLocatie={locatii.find((l) => l.id === locatie)?.nume ?? ''} filtru={filtru} onFisa={setFisa} />
      )}
      {fisa && <FisaArticol {...fisa} numeLocatie={locatii.find((l) => l.id === fisa.locatie_id)?.nume ?? ''} onInchide={() => setFisa(null)} />}
    </>
  );
}

type OnFisa = (f: { locatie_id: number; articol_id: number; nume: string; um: string }) => void;

function MatriceStocuri({ filtru, onFisa }: { filtru: (a: { nume: string; tip: string }) => boolean; onFisa: OnFisa }) {
  const r = useDate(() => api.get<Matrice>('/api/stoc'), []);
  return (
    <Stare {...r}>
      {(m) => {
        const articole = m.articole.filter(filtru);
        const valoareLoc = (id: number) => m.articole.reduce((s, a) => s + Math.max(0, a.stocuri[id] ?? 0) * a.cost_mediu, 0);
        return (
          <>
            <div className="grila-kpi card">
              {m.locatii.map((l) => (
                <div key={l.id} className="kpi">
                  <span className="kpi-eticheta">{l.nume}</span>
                  <span className="kpi-valoare">{formatLei(valoareLoc(l.id))}</span>
                  <span className="kpi-nota">valoarea stocului la cost mediu</span>
                </div>
              ))}
            </div>
            <div className="tabel-container">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Articol</th>
                    <th>Tip</th>
                    {m.locatii.map((l) => (
                      <th key={l.id} className="num">
                        {l.nume}
                      </th>
                    ))}
                    <th className="num">Total rețea</th>
                  </tr>
                </thead>
                <tbody>
                  {articole.map((a) => {
                    const total = Object.values(a.stocuri).reduce((s, x) => s + x, 0);
                    return (
                      <tr key={a.id}>
                        <td>{a.nume}</td>
                        <td className="slab">{ETICHETE_TIP_ARTICOL[a.tip]}</td>
                        {m.locatii.map((l) => {
                          const s = a.stocuri[l.id] ?? 0;
                          const sub = l.tip === 'punct' && a.prag_minim > 0 && s < a.prag_minim;
                          return (
                            <td key={l.id} className={`num ${s < 0 ? 'minus' : ''}`}>
                              <button type="button" className="buton-link" style={{ color: 'inherit', fontWeight: sub ? 700 : 400 }} onClick={() => onFisa({ locatie_id: l.id, articol_id: a.id, nume: a.nume, um: a.um })}>
                                {formatCantitate(s, a.um)}
                              </button>
                              {sub && <span className="insigna pericol" style={{ marginLeft: 4 }}>sub prag</span>}
                            </td>
                          );
                        })}
                        <td className="num">{formatCantitate(total, a.um)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        );
      }}
    </Stare>
  );
}

function StocLocatie({ locatieId, numeLocatie, filtru, onFisa }: { locatieId: number; numeLocatie: string; filtru: (a: { nume: string; tip: string }) => boolean; onFisa: OnFisa }) {
  const r = useDate(() => api.get<RandStoc[]>('/api/stoc', { locatie_id: locatieId }), [locatieId]);
  return (
    <Stare {...r}>
      {(randuri) => {
        const lista = randuri.filter(filtru);
        const valoare = lista.reduce((s, x) => s + x.valoare, 0);
        return (
          <>
            <p className="slab">
              {numeLocatie}: {lista.length} articole, valoare {formatLei(valoare)} · {lista.filter((x) => x.sub_prag).length} sub prag
            </p>
            <div className="tabel-container">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Articol</th>
                    <th>Tip</th>
                    <th className="num">Stoc scriptic</th>
                    <th className="num">Prag minim</th>
                    <th className="num">Cost mediu</th>
                    <th className="num">Valoare</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((a) => (
                    <tr key={a.articol_id} className="clic" onClick={() => onFisa({ locatie_id: locatieId, articol_id: a.articol_id, nume: a.nume, um: a.um })}>
                      <td>
                        {a.nume} {a.sub_prag && <span className="insigna pericol">sub prag</span>}
                      </td>
                      <td className="slab">{ETICHETE_TIP_ARTICOL[a.tip]}</td>
                      <td className={`num ${a.stoc < 0 ? 'minus' : ''}`}>{formatCantitate(a.stoc, a.um)}</td>
                      <td className="num slab">{a.prag_minim ? formatCantitate(a.prag_minim, a.um) : '—'}</td>
                      <td className="num slab">
                        {formatNumar(a.cost_mediu)} lei/{a.um}
                      </td>
                      <td className="num">{formatLei(a.valoare)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Total</td>
                    <td className="num">{formatLei(valoare)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        );
      }}
    </Stare>
  );
}

function FisaArticol(props: { locatie_id: number; articol_id: number; nume: string; um: string; numeLocatie: string; onInchide: () => void }) {
  const r = useDate(
    () =>
      api.get<{ id: number; cantitate: number; tip: string; document_tip: string; document_id: string; cost_unitar: number; creata_la: string; sold: number }[]>(
        '/api/stoc/fisa',
        { locatie_id: props.locatie_id, articol_id: props.articol_id },
      ),
    [props.locatie_id, props.articol_id],
  );
  return (
    <Modal titlu={`Fișa: ${props.nume} · ${props.numeLocatie}`} onInchide={props.onInchide} lat>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Nicio mișcare pentru acest articol în această gestiune.">
        {(miscari) => (
          <div className="tabel-container" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="tabel">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Operațiune</th>
                  <th>Document</th>
                  <th className="num">Cantitate</th>
                  <th className="num">Sold după</th>
                </tr>
              </thead>
              <tbody>
                {miscari.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDataOra(m.creata_la)}</td>
                    <td>{ETICHETE_MISCARE_STOC[m.tip] ?? m.tip}</td>
                    <td className="slab mic">
                      {DOCUMENTE[m.document_tip] ?? m.document_tip} {m.document_tip === 'comanda' || m.document_tip === 'anulare' ? m.document_id.slice(0, 8) : `#${m.document_id}`}
                    </td>
                    <td className={`num ${m.cantitate < 0 ? 'minus' : 'plus'}`}>
                      {m.cantitate > 0 ? '+' : ''}
                      {formatCantitate(m.cantitate, props.um)}
                    </td>
                    <td className="num">{formatCantitate(m.sold, props.um)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {miscari.length >= 200 && <p className="slab mic" style={{ padding: 8 }}>Se afișează ultimele 200 de mișcări.</p>}
          </div>
        )}
      </Stare>
    </Modal>
  );
}
