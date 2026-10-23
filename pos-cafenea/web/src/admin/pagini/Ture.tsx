import { useState } from 'react';
import { ETICHETE_MISCARE_BANI, type TipMiscareBani } from '@cafenea/shared';
import { Modal } from '../../comun/Modal';
import { formatDataOra, formatLei, formatNumar, formatOra } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api, mesajEroare } from '../api';
import { CapPagina, Dif, FiltruLocatie, Rand, Stare } from '../componente';
import { useAdmin, useDate } from '../context';
import { TabelComenzi, type Comanda } from './Comenzi';

interface Tura {
  id: string;
  locatie: string;
  barista: string | null;
  inchisa_de_nume: string | null;
  verificata_de_nume: string | null;
  deschisa_la: string;
  inchisa_la: string | null;
  creata_automat: boolean;
  fond_initial: number;
  scriptic_fond: number | null;
  declarat_doze: number | null;
  declarat_numerar: number | null;
  declarat_card: number | null;
  declarat_anulari: number | null;
  declarat_casari: number | null;
  scriptic_doze: number | null;
  scriptic_numerar: number | null;
  scriptic_card: number | null;
  scriptic_anulari: number | null;
  scriptic_casari: number | null;
  dif_numerar: number | null;
  dif_card: number | null;
  dif_doze: number | null;
  dif_anulari: number | null;
  dif_casari: number | null;
  dif_fond: number | null;
  observatii: string | null;
  are_discrepante: boolean;
  verificata_la: string | null;
  /** Cifrele s-au schimbat după verificare (vânzare sau corecție de casă ajunsă târziu). */
  modificata_dupa_verif: boolean;
  nota_verificare: string | null;
  vanzari: number;
  nr_comenzi: number;
  bani?: { cont: string; tip: TipMiscareBani; nr: number; suma: number }[];
  /** Doar în detaliu: vânzările pe card ale turei fără plată aprobată de terminal. */
  card_neconfirmat?: { nr: number; suma: number };
  /** Doar în detaliu: retururi pe card aprobate fără anularea comenzii. */
  retur_neanulat?: { nr: number; suma: number; lista: { referinta: string; suma: number; la: string; barista: string | null; nr: number | null; comanda_pe_server: boolean }[] };
}

/** Neverificată sau schimbată după verificare: cere din nou atenția adminului. */
const deVerificat = (t: Tura) => !t.verificata_la || t.modificata_dupa_verif;

function StareTura({ t }: { t: Tura }) {
  if (!t.inchisa_la) return <span className="insigna info">deschisă</span>;
  if (t.are_discrepante && deVerificat(t)) return <span className="insigna pericol">discrepanțe</span>;
  if (t.are_discrepante) return <span className="insigna avertisment">verificată</span>;
  return <span className="insigna succes">în regulă</span>;
}

export function PaginaTure({ sub, navigheaza }: PropsPagina) {
  const [locatie, setLocatie] = useState<number | null>(null);
  const [doarDiscrepante, setDoarDiscrepante] = useState(false);
  const [neverificate, setNeverificate] = useState(false);
  const r = useDate(
    () => api.get<Tura[]>('/api/ture', { locatie_id: locatie, doar_discrepante: doarDiscrepante || undefined, neverificate: neverificate || undefined }),
    [locatie, doarDiscrepante, neverificate],
    { locatie },
  );
  const deschisa = sub[0] ?? null;

  return (
    <>
      <CapPagina
        titlu="Ture și închideri"
        subtitlu="La închidere barista declară ce a numărat fără să vadă cifrele sistemului; diferențele peste toleranță ajung aici."
      />
      <Rand>
        <FiltruLocatie valoare={locatie} onChange={setLocatie} doarPuncte />
        <label className="bifa">
          <input type="checkbox" checked={doarDiscrepante} onChange={(e) => setDoarDiscrepante(e.target.checked)} /> Doar cu discrepanțe
        </label>
        <label className="bifa">
          <input type="checkbox" checked={neverificate} onChange={(e) => setNeverificate(e.target.checked)} /> Doar neverificate
        </label>
      </Rand>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Nicio tură pentru filtrele alese.">
        {(ture) => (
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Tura</th>
                  <th>Locația</th>
                  <th>Barista</th>
                  <th className="num">Vânzări</th>
                  <th className="num">Dif. numerar</th>
                  <th className="num">Dif. card</th>
                  <th className="num">Dif. doze</th>
                  <th className="num">Dif. anulări / casări</th>
                  <th>Stare</th>
                </tr>
              </thead>
              <tbody>
                {ture.map((t) => (
                  <tr key={t.id} className={`clic${t.are_discrepante && deVerificat(t) ? ' discrepanta' : ''}`} onClick={() => navigheaza(`ture/${t.id}`)}>
                    <td>
                      {formatDataOra(t.deschisa_la)} – {t.inchisa_la ? formatOra(t.inchisa_la) : '…'}
                      {t.creata_automat && <span className="insigna avertisment" style={{ marginLeft: 6 }}>creată automat</span>}
                      {t.modificata_dupa_verif && <span className="insigna avertisment" style={{ marginLeft: 6 }}>modificată după verificare</span>}
                    </td>
                    <td>{t.locatie}</td>
                    <td>{t.barista ?? '—'}</td>
                    <td className="num">
                      {formatLei(t.vanzari)} <span className="slab mic">({t.nr_comenzi})</span>
                    </td>
                    <td className="num">{t.inchisa_la ? <Dif valoare={t.dif_numerar} lei /> : '—'}</td>
                    <td className="num">{t.inchisa_la ? <Dif valoare={t.dif_card} lei /> : '—'}</td>
                    <td className="num">{t.inchisa_la ? <Dif valoare={t.dif_doze} /> : '—'}</td>
                    <td className="num">
                      {t.inchisa_la ? (
                        <>
                          <Dif valoare={t.dif_anulari} /> / <Dif valoare={t.dif_casari} />
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <StareTura t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stare>
      {deschisa && <DetaliuTura id={deschisa} onInchide={() => navigheaza('ture')} />}
    </>
  );
}

function DetaliuTura({ id, onInchide }: { id: string; onInchide: () => void }) {
  const { arata } = useAdmin();
  const r = useDate(() => api.get<Tura>(`/api/ture/${id}`), [id]);
  const comenzi = useDate(() => api.get<Comanda[]>('/api/comenzi', { tura_id: id, limita: 1000 }), [id]);
  const [nota, setNota] = useState('');
  const [arataComenzi, setArataComenzi] = useState(false);
  const [lucreaza, setLucreaza] = useState(false);

  const verifica = async () => {
    setLucreaza(true);
    try {
      await api.post(`/api/ture/${id}/verifica`, { nota: nota || null });
      arata('Tura a fost marcată verificată');
      r.reincarca();
    } catch (e) {
      arata(mesajEroare(e), 'pericol');
    } finally {
      setLucreaza(false);
    }
  };

  const t = r.date;
  return (
    <Modal
      titlu={t ? `Tura ${t.locatie} · ${formatDataOra(t.deschisa_la)}` : 'Tura'}
      onInchide={onInchide}
      lat
      subsol={
        t && (t.inchisa_la || t.are_discrepante) && deVerificat(t) ? (
          <>
            <input placeholder="Notă (de ex. „discutat cu barista, lipsa reținută din salariu”)" value={nota} onChange={(e) => setNota(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <button type="button" className="buton" disabled={lucreaza} onClick={verifica}>
              Marchează verificată
            </button>
          </>
        ) : undefined
      }
    >
      <Stare {...r}>
        {(t) => (
          <div className="randuri-form">
            <p>
              <StareTura t={t} /> Deschisă de <strong>{t.barista ?? '—'}</strong> la {formatDataOra(t.deschisa_la)}
              {t.inchisa_la ? (
                <>
                  , închisă de <strong>{t.inchisa_de_nume ?? '—'}</strong> la {formatDataOra(t.inchisa_la)}.
                </>
              ) : (
                ' — încă deschisă pe tabletă.'
              )}
            </p>
            {t.creata_automat && (
              <div className="alerta avertisment">Tura a fost creată automat de server: vânzările au sosit fără evenimentul de deschidere.</div>
            )}
            {t.verificata_la && (
              <div className={`alerta ${t.modificata_dupa_verif ? 'avertisment' : 'succes'}`}>
                Verificată de {t.verificata_de_nume ?? 'admin'} la {formatDataOra(t.verificata_la)}
                {t.nota_verificare ? `: ${t.nota_verificare}` : ''}
                {t.modificata_dupa_verif &&
                  '. Modificată după verificare: o vânzare sau o corecție de casă sincronizată târziu i-a schimbat cifrele; verificați-o din nou.'}
              </div>
            )}
            <div className="tabel-container">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Ce s-a verificat</th>
                    <th className="num">Declarat (barista)</th>
                    <th className="num">Scriptic (sistem)</th>
                    <th className="num">Diferență</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Fond inițial la deschidere</td>
                    <td className="num">{formatLei(t.fond_initial)}</td>
                    <td className="num">{t.scriptic_fond != null ? formatLei(t.scriptic_fond) : '—'}</td>
                    <td className="num">
                      <Dif valoare={t.dif_fond} lei />
                    </td>
                  </tr>
                  <tr>
                    <td>Numerar în sertar</td>
                    <td className="num">{t.declarat_numerar != null ? formatLei(t.declarat_numerar) : '—'}</td>
                    <td className="num">{t.scriptic_numerar != null ? formatLei(t.scriptic_numerar) : '—'}</td>
                    <td className="num">
                      <Dif valoare={t.dif_numerar} lei />
                    </td>
                  </tr>
                  <tr>
                    <td>Card (raportul terminalului)</td>
                    <td className="num">{t.declarat_card != null ? formatLei(t.declarat_card) : '—'}</td>
                    <td className="num">{t.scriptic_card != null ? formatLei(t.scriptic_card) : '—'}</td>
                    <td className="num">
                      <Dif valoare={t.dif_card} lei />
                    </td>
                  </tr>
                  <tr>
                    <td>Doze de cafea (contorul râșniței)</td>
                    <td className="num">{formatNumar(t.declarat_doze)}</td>
                    <td className="num">{formatNumar(t.scriptic_doze)}</td>
                    <td className="num">
                      <Dif valoare={t.dif_doze} />
                    </td>
                  </tr>
                  <tr>
                    <td>Produse anulate / returnate</td>
                    <td className="num">{formatNumar(t.declarat_anulari)}</td>
                    <td className="num">{formatNumar(t.scriptic_anulari)}</td>
                    <td className="num">
                      <Dif valoare={t.dif_anulari} />
                    </td>
                  </tr>
                  <tr>
                    <td>Produse casate</td>
                    <td className="num">{formatNumar(t.declarat_casari)}</td>
                    <td className="num">{formatNumar(t.scriptic_casari)}</td>
                    <td className="num">
                      <Dif valoare={t.dif_casari} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {t.observatii && (
              <div className="card">
                <strong>Observațiile baristei:</strong> {t.observatii}
              </div>
            )}
            {t.card_neconfirmat && t.card_neconfirmat.nr > 0 && (
              <div className="alerta avertisment">
                <strong>
                  {t.card_neconfirmat.nr} {t.card_neconfirmat.nr === 1 ? 'vânzare' : 'vânzări'} pe card neconfirmate de terminal: {formatLei(t.card_neconfirmat.suma)}
                </strong>{' '}
                — sunt în totalul card al sistemului, dar terminalul (prin server) nu a aprobat nicio plată pentru ele. Comparați cu raportul
                băncii; la un terminal separat, fără legătură, toate vânzările pe card apar așa.
              </div>
            )}
            {t.retur_neanulat && t.retur_neanulat.nr > 0 && (
              <div className="alerta pericol">
                <strong>
                  {t.retur_neanulat.nr} {t.retur_neanulat.nr === 1 ? 'retur' : 'retururi'} pe card fără anularea comenzii: {formatLei(t.retur_neanulat.suma)}
                </strong>{' '}
                — banii au fost restituiți prin terminal, dar comanda se numără încă la card în tura aceasta (
                {t.retur_neanulat.lista
                  .map((x) => `${x.nr != null ? `bon #${x.nr}` : 'comandă lipsă pe server'}, ${formatDataOra(x.la)}${x.barista ? `, ${x.barista}` : ''}`)
                  .join('; ')}
                ).
              </div>
            )}
            {t.bani && t.bani.length > 0 && (
              <div className="sectiune">
                <h3>Banii turei</h3>
                <div className="tabel-container">
                  <table className="tabel">
                    <thead>
                      <tr>
                        <th>Cont</th>
                        <th>Operațiune</th>
                        <th className="num">Nr.</th>
                        <th className="num">Sumă</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.bani.map((b) => (
                        <tr key={`${b.cont}-${b.tip}`}>
                          <td>{b.cont === 'card' ? 'Card' : 'Numerar'}</td>
                          <td>{ETICHETE_MISCARE_BANI[b.tip] ?? b.tip}</td>
                          <td className="num">{b.nr}</td>
                          <td className={`num ${b.suma < 0 ? 'minus' : ''}`}>{formatLei(b.suma)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="sectiune">
              <button type="button" className="buton-link" onClick={() => setArataComenzi((x) => !x)}>
                {arataComenzi ? 'Ascunde comenzile turei' : `Arată comenzile turei (${t.nr_comenzi})`}
              </button>
              {arataComenzi && (
                <Stare {...comenzi} gol={(d) => d.length === 0} mesajGol="Nicio comandă.">
                  {(c) => <TabelComenzi comenzi={c} />}
                </Stare>
              )}
            </div>
          </div>
        )}
      </Stare>
    </Modal>
  );
}
