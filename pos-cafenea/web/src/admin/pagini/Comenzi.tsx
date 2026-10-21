import { Fragment, useState } from 'react';
import { ETICHETE_MOTIVE, type MotivCasare } from '@cafenea/shared';
import { formatDataOra, formatLei, ziLocala } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api } from '../api';
import { AlegeInterval, CapPagina, FiltruLocatie, parametriInterval, Rand, Stare, type IntervalZile } from '../componente';
import { useDate } from '../context';
import { ETICHETE_METODA } from '../tipuri';

interface LinieComanda {
  id: number;
  produs: string;
  cantitate: number;
  pret_unitar: number;
  modificatori: { id: number; nume: string; pret: number }[];
  total: number;
  cost: number;
}

export interface Comanda {
  id: string;
  nr: number;
  locatie: string;
  barista: string | null;
  creata_la: string;
  metoda: 'numerar' | 'card' | 'casare';
  motiv_casare: MotivCasare | null;
  nota: string | null;
  total: number;
  primit: number | null;
  rest: number | null;
  card_autorizare: string | null;
  stare: 'finalizata' | 'anulata';
  motiv_anulare: string | null;
  stoc_restituit: boolean | null;
  linii: LinieComanda[];
}

export function TabelComenzi({ comenzi }: { comenzi: Comanda[] }) {
  const [deschisa, setDeschisa] = useState<string | null>(null);
  return (
    <div className="tabel-container">
      <table className="tabel">
        <thead>
          <tr>
            <th>Ora</th>
            <th>Nr.</th>
            <th>Locația</th>
            <th>Barista</th>
            <th>Produse</th>
            <th>Plată</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {comenzi.map((c) => {
            const produse = c.linii.map((l) => `${l.cantitate > 1 ? `${l.cantitate}× ` : ''}${l.produs}`).join(', ');
            const valoare = c.metoda === 'casare' ? c.linii.reduce((s, l) => s + l.total, 0) : c.total;
            return (
              <Fragment key={c.id}>
                <tr className={`clic${c.stare === 'anulata' ? ' anulata' : ''}`} onClick={() => setDeschisa(deschisa === c.id ? null : c.id)} aria-expanded={deschisa === c.id}>
                  <td>{formatDataOra(c.creata_la)}</td>
                  <td>#{c.nr}</td>
                  <td>{c.locatie}</td>
                  <td>{c.barista ?? '—'}</td>
                  <td className="taiat">{produse}</td>
                  <td>
                    {c.metoda === 'casare' ? (
                      <span className="insigna avertisment">Casare · {c.motiv_casare ? ETICHETE_MOTIVE[c.motiv_casare] : '—'}</span>
                    ) : (
                      <span className={`insigna ${c.metoda === 'card' ? 'info' : ''}`}>{ETICHETE_METODA[c.metoda]}</span>
                    )}{' '}
                    {c.stare === 'anulata' && <span className="insigna pericol">anulată</span>}
                  </td>
                  <td className="num taiat">{c.metoda === 'casare' ? <span className="slab">({formatLei(valoare)})</span> : formatLei(valoare)}</td>
                </tr>
                {deschisa === c.id && (
                  <tr>
                    <td colSpan={7} className="detalii-linii">
                      <ul className="linii-comanda">
                        {c.linii.map((l) => (
                          <li key={l.id}>
                            {l.cantitate} × {l.produs} — {formatLei(l.pret_unitar)}
                            {l.modificatori.length > 0 && <span className="slab"> + {l.modificatori.map((m) => `${m.nume}${m.pret ? ` (${formatLei(m.pret)})` : ''}`).join(', ')}</span>}
                            {' = '}
                            <strong>{formatLei(l.total)}</strong> <span className="slab mic">cost ingrediente {formatLei(l.cost)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="slab mic" style={{ marginTop: 6 }}>
                        {c.metoda === 'numerar' && c.primit != null && `Primit ${formatLei(c.primit)}, rest ${formatLei(c.rest ?? 0)}. `}
                        {c.metoda === 'card' && c.card_autorizare && `Autorizare terminal: ${c.card_autorizare}. `}
                        {c.metoda === 'casare' && 'Fără încasare: valoarea e la preț de vânzare, ingredientele s-au scăzut din stoc. '}
                        {c.nota && `Notă: ${c.nota}. `}
                        {c.stare === 'anulata' && `Anulată: ${c.motiv_anulare ?? ''} (${c.stoc_restituit ? 'ingredientele au revenit în stoc' : 'produsul fusese preparat, ingredientele rămân consumate'}).`}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PaginaComenzi(_: PropsPagina) {
  const azi = ziLocala();
  const [perioada, setPerioada] = useState<IntervalZile>({ de: azi, pana: azi });
  const [locatie, setLocatie] = useState<number | null>(null);
  const [metoda, setMetoda] = useState('');
  const r = useDate(
    () => api.get<Comanda[]>('/api/comenzi', { ...parametriInterval(perioada), locatie_id: locatie, metoda, limita: 500 }),
    [perioada.de, perioada.pana, locatie, metoda],
  );

  return (
    <>
      <CapPagina titlu="Vânzări" subtitlu="Comenzile sincronizate de pe tablete; apăsați un rând pentru detalii." />
      <Rand>
        <AlegeInterval valoare={perioada} onChange={setPerioada} />
        <FiltruLocatie valoare={locatie} onChange={setLocatie} doarPuncte />
        <label className="camp camp-filtru">
          <span>Plata</span>
          <select value={metoda} onChange={(e) => setMetoda(e.target.value)}>
            <option value="">Toate</option>
            <option value="numerar">Numerar</option>
            <option value="card">Card</option>
            <option value="casare">Casări</option>
          </select>
        </label>
      </Rand>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Nicio comandă în intervalul ales.">
        {(comenzi) => {
          const valide = comenzi.filter((c) => c.stare === 'finalizata' && c.metoda !== 'casare');
          return (
            <>
              <p className="slab">
                {comenzi.length}
                {comenzi.length >= 500 ? '+ (primele 500)' : ''} comenzi · încasat {formatLei(valide.reduce((s, c) => s + c.total, 0))} ·{' '}
                {comenzi.filter((c) => c.stare === 'anulata').length} anulate · {comenzi.filter((c) => c.metoda === 'casare').length} casări
              </p>
              <TabelComenzi comenzi={comenzi} />
            </>
          );
        }}
      </Stare>
    </>
  );
}
