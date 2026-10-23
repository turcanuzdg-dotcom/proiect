import { Fragment, useState } from 'react';
import { ETICHETE_MOTIVE, type MotivCasare } from '@cafenea/shared';
import { adaugaZile, formatDataOra, formatLei, ziLocala } from '../../comun/format';
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
  /** Prețul din catalog la sincronizare (lipsă la comenzile mai vechi). */
  pret_catalog: number | null;
  modificatori: { id: number; nume: string; pret: number; pret_catalog?: number }[];
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
  /** Un preț de pe tabletă diferă de catalogul de la sincronizare. */
  pret_abatere: boolean;
  /** Card: true = plată aprobată de terminal pentru această comandă; false = neconfirmată; null la numerar. */
  card_confirmat?: boolean | null;
  /** Restituită pe card prin terminal, dar neanulată (după 10 minute). */
  retur_neanulat?: boolean;
  linii: LinieComanda[];
}

/** Textul „catalog: X” lângă un preț care diferă de catalog. */
function Catalog({ pret, catalog }: { pret: number; catalog: number | null | undefined }) {
  if (catalog == null || Math.abs(pret - catalog) < 0.005) return null;
  return <span className="minus mic"> (catalog {formatLei(catalog)})</span>;
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
                    {c.metoda === 'card' && c.card_confirmat === false && (
                      <span className="insigna pericol" title="Nicio plată aprobată de terminal (prin server) pentru această comandă și sumă: comparați cu raportul băncii">
                        card neconfirmat
                      </span>
                    )}{' '}
                    {c.retur_neanulat && (
                      <span className="insigna pericol" title="Terminalul a aprobat returul pe card, dar comanda nu e anulată: se numără încă la încasări">
                        retur fără anulare
                      </span>
                    )}{' '}
                    {c.pret_abatere && (
                      <span className="insigna avertisment" title="Prețul trimis de tabletă diferă de catalogul de la sincronizare">
                        preț ≠ catalog
                      </span>
                    )}
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
                            <Catalog pret={l.pret_unitar} catalog={l.pret_catalog} />
                            {l.modificatori.length > 0 && (
                              <span className="slab">
                                {' + '}
                                {l.modificatori.map((m, i) => (
                                  <Fragment key={m.id}>
                                    {i > 0 && ', '}
                                    {m.nume}
                                    {m.pret ? ` (${formatLei(m.pret)})` : ''}
                                    <Catalog pret={m.pret} catalog={m.pret_catalog} />
                                  </Fragment>
                                ))}
                              </span>
                            )}
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

export function PaginaComenzi({ sub }: PropsPagina) {
  const azi = ziLocala();
  // Din panou („comenzi/abateri”): comenzile din ultimele 7 zile cu prețuri diferite de catalog.
  const dinAlerta = sub[0] === 'abateri';
  // Din panou („comenzi/card-neconfirmat”): vânzările pe card fără plată aprobată de terminal, ultimele 7 zile.
  const dinAlertaCard = sub[0] === 'card-neconfirmat';
  // Din panou („comenzi/retur-neanulat”): comenzile restituite pe card, dar neanulate, ultimele 30 de zile.
  const dinAlertaRetur = sub[0] === 'retur-neanulat';
  const [perioada, setPerioada] = useState<IntervalZile>({
    de: dinAlertaRetur ? adaugaZile(azi, -29) : dinAlerta || dinAlertaCard ? adaugaZile(azi, -6) : azi,
    pana: azi,
  });
  const [locatie, setLocatie] = useState<number | null>(null);
  const [metoda, setMetoda] = useState('');
  const [abateri, setAbateri] = useState(dinAlerta);
  const [neconfirmate, setNeconfirmate] = useState(dinAlertaCard);
  const [retururi, setRetururi] = useState(dinAlertaRetur);
  const r = useDate(
    () =>
      api.get<Comanda[]>('/api/comenzi', {
        ...parametriInterval(perioada), locatie_id: locatie, metoda, pret_abatere: abateri || undefined, card_neconfirmat: neconfirmate || undefined,
        retur_neanulat: retururi || undefined, limita: 500,
      }),
    [perioada.de, perioada.pana, locatie, metoda, abateri, neconfirmate, retururi],
    { locatie },
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
        <label className="bifa">
          <input type="checkbox" checked={abateri} onChange={(e) => setAbateri(e.target.checked)} /> Doar prețuri diferite de catalog
        </label>
        <label className="bifa">
          <input type="checkbox" checked={neconfirmate} onChange={(e) => setNeconfirmate(e.target.checked)} /> Doar card neconfirmat de terminal
        </label>
        <label className="bifa">
          <input type="checkbox" checked={retururi} onChange={(e) => setRetururi(e.target.checked)} /> Doar retur pe card fără anulare
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
