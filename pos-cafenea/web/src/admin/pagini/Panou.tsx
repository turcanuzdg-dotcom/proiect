import { formatCantitate, formatDataOra, formatLei, inceputZi, ziLocala } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api } from '../api';
import { CapPagina, Dif, Kpi, Stare } from '../componente';
import { useDate } from '../context';

interface DatePanou {
  vanzari: { locatie_id: number; locatie: string; comenzi: number; numerar: number; card: number; total: number; casari: number; ture_deschise: number }[];
  discrepante: { id: string; deschisa_la: string; inchisa_la: string | null; locatie: string; barista: string | null; dif_numerar: number | null; dif_card: number | null; dif_doze: number | null; dif_anulari: number | null; dif_casari: number | null; dif_fond: number | null; modificata_dupa_verif: boolean }[];
  sub_prag: { locatie: string; nume: string; um: string; prag_minim: number; stoc: number }[];
  erori_sync: number;
  /** Comenzi din ultimele 7 zile cu prețuri diferite de catalog. */
  preturi_abatute: number;
  /** Operațiuni din ultimele 7 zile cu ora tabletei dată înapoi. */
  ore_suspecte: number;
  /** Aceleași operațiuni, pe tablete. */
  ore_suspecte_tablete: { dispozitiv: string; locatie: string; n: number }[];
  dispozitive: { nume: string; locatie: string; ultima_sincronizare: string | null }[];
}

const ORA = 3_600_000;

export function PaginaPanou({ navigheaza }: PropsPagina) {
  const azi = ziLocala();
  const r = useDate(() => api.get<DatePanou>('/api/panou', { de_azi: inceputZi(azi) }), [azi]);

  return (
    <>
      <CapPagina titlu="Panou" subtitlu={`Situația de azi, ${new Date().toLocaleDateString('ro-MD', { weekday: 'long', day: 'numeric', month: 'long' })}`} />
      <Stare {...r}>
        {(d) => {
          const total = d.vanzari.reduce((s, v) => s + v.total, 0);
          const comenzi = d.vanzari.reduce((s, v) => s + v.comenzi, 0);
          const tableteVechi = d.dispozitive.filter((x) => !x.ultima_sincronizare || Date.now() - new Date(x.ultima_sincronizare).getTime() > ORA);
          const nrAlerte = d.discrepante.length + d.sub_prag.length + (d.erori_sync ? 1 : 0) + (d.preturi_abatute ? 1 : 0) + (d.ore_suspecte ? 1 : 0) + tableteVechi.length;
          return (
            <>
              <div className="card grila-kpi">
                <Kpi eticheta="Vânzări azi, toată rețeaua" valoare={formatLei(total)} />
                <Kpi eticheta="Comenzi" valoare={comenzi} />
                <Kpi eticheta="Bon mediu" valoare={comenzi ? formatLei(total / comenzi) : '—'} />
                <Kpi eticheta="De verificat" valoare={nrAlerte} nota={nrAlerte ? 'vezi alertele de mai jos' : 'nimic deschis'} />
              </div>

              <div className="grila-carduri">
                {d.vanzari.map((v) => (
                  <section key={v.locatie_id} className="card card-locatie">
                    <header>
                      <h2>{v.locatie}</h2>
                      {v.ture_deschise > 0 ? <span className="insigna succes">tură deschisă</span> : <span className="insigna">fără tură deschisă</span>}
                    </header>
                    <div className="grila-kpi">
                      <Kpi eticheta="Total încasat" valoare={formatLei(v.total)} />
                      <Kpi eticheta="Comenzi" valoare={v.comenzi} />
                      <Kpi eticheta="Numerar" valoare={formatLei(v.numerar)} />
                      <Kpi eticheta="Card" valoare={formatLei(v.card)} />
                    </div>
                    <p className="slab mic">
                      Casări azi: {v.casari}{' '}
                      <button type="button" className="buton-link mic" onClick={() => navigheaza(`comenzi`)}>
                        vezi vânzările
                      </button>
                    </p>
                  </section>
                ))}
              </div>

              <section className="sectiune">
                <h2>Alerte</h2>
                {nrAlerte === 0 && <div className="alerta succes">Nicio discrepanță neverificată, niciun stoc sub prag, toate tabletele sincronizate.</div>}
                <div className="lista-alerte">
                  {d.discrepante.map((t) => (
                    <div key={t.id} className="alerta pericol">
                      <span>
                        <strong>Discrepanță la tură</strong> · {t.locatie} · {t.barista ?? '—'} · {formatDataOra(t.deschisa_la)}
                        {t.inchisa_la ? '' : ' (tură încă deschisă)'}
                        {t.modificata_dupa_verif ? ' (modificată după verificare)' : ''} —{' '}
                        {(
                          [
                            ['numerar', t.dif_numerar, true],
                            ['card', t.dif_card, true],
                            ['doze', t.dif_doze, false],
                            ['anulări', t.dif_anulari, false],
                            ['casări', t.dif_casari, false],
                            ['fond la deschidere', t.dif_fond, true],
                          ] as const
                        )
                          .filter(([, v]) => v)
                          .map(([nume, v, lei], i) => (
                            <span key={nume}>
                              {i > 0 && ', '}
                              {nume} <Dif valoare={v} lei={lei} />
                            </span>
                          ))}
                      </span>
                      <button type="button" className="buton-secundar" onClick={() => navigheaza(`ture/${t.id}`)}>
                        Deschide tura
                      </button>
                    </div>
                  ))}
                  {d.erori_sync > 0 && (
                    <div className="alerta avertisment">
                      <span>
                        <strong>{d.erori_sync} {d.erori_sync === 1 ? 'operațiune de pe tabletă n-a putut fi aplicată' : 'operațiuni de pe tablete n-au putut fi aplicate'}</strong> — sunt păstrate și pot fi reaplicate după corectare.
                      </span>
                      <button type="button" className="buton-secundar" onClick={() => navigheaza('setari/erori')}>
                        Vezi erorile
                      </button>
                    </div>
                  )}
                  {d.preturi_abatute > 0 && (
                    <div className="alerta avertisment">
                      <span>
                        <strong>
                          {d.preturi_abatute} {d.preturi_abatute === 1 ? 'comandă' : 'comenzi'} cu prețuri diferite de catalog
                        </strong>{' '}
                        în ultimele 7 zile — normal pentru vânzări offline după o schimbare de preț; altfel, verificați tableta.
                      </span>
                      <button type="button" className="buton-secundar" onClick={() => navigheaza('comenzi/abateri')}>
                        Vezi comenzile
                      </button>
                    </div>
                  )}
                  {d.ore_suspecte > 0 && (
                    <div className="alerta avertisment">
                      <span>
                        <strong>
                          {d.ore_suspecte} {d.ore_suspecte === 1 ? 'operațiune' : 'operațiuni'} cu ora tabletei dată înapoi
                        </strong>{' '}
                        în ultimele 7 zile ({d.ore_suspecte_tablete.map((x) => `${x.dispozitiv}, ${x.locatie}: ${x.n}`).join('; ')}) — ceasul
                        unei tablete a fost schimbat. Verificați „Data și ora automate” pe tabletă și turele atinse.
                      </span>
                      <button type="button" className="buton-secundar" onClick={() => navigheaza('setari/ore')}>
                        Vezi operațiunile
                      </button>
                    </div>
                  )}
                  {tableteVechi.map((x) => (
                    <div key={x.nume} className="alerta avertisment">
                      <span>
                        <strong>{x.nume}</strong> ({x.locatie}) nu s-a sincronizat {x.ultima_sincronizare ? `din ${formatDataOra(x.ultima_sincronizare)}` : 'niciodată'}. Poate lucrează offline; vânzările se vor trimite când revine internetul.
                      </span>
                    </div>
                  ))}
                </div>
                {d.sub_prag.length > 0 && (
                  <div className="tabel-container">
                    <table className="tabel">
                      <thead>
                        <tr>
                          <th>Stoc sub prag</th>
                          <th>Locația</th>
                          <th className="num">Stoc</th>
                          <th className="num">Prag minim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.sub_prag.map((s) => (
                          <tr key={`${s.locatie}-${s.nume}`} className="clic" onClick={() => navigheaza('stocuri')}>
                            <td>{s.nume}</td>
                            <td>{s.locatie}</td>
                            <td className="num minus">{formatCantitate(s.stoc, s.um)}</td>
                            <td className="num">{formatCantitate(s.prag_minim, s.um)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {d.dispozitive.length > 0 && (
                <section className="sectiune">
                  <h2>Tablete</h2>
                  <div className="tabel-container">
                    <table className="tabel">
                      <thead>
                        <tr>
                          <th>Tableta</th>
                          <th>Locația</th>
                          <th>Ultima sincronizare</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.dispozitive.map((x) => {
                          const vechi = !x.ultima_sincronizare || Date.now() - new Date(x.ultima_sincronizare).getTime() > ORA;
                          return (
                            <tr key={x.nume}>
                              <td>{x.nume}</td>
                              <td>{x.locatie}</td>
                              <td>
                                {formatDataOra(x.ultima_sincronizare)} {vechi ? <span className="insigna avertisment">peste o oră</span> : <span className="insigna succes">la zi</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          );
        }}
      </Stare>
    </>
  );
}
