import { useEffect, useMemo, useRef, useState } from 'react';
import { formatLei } from '@cafenea/shared';
import { cerereJson } from '../comun/http';
import { formatNumar, formatOra } from '../comun/format';
import { Modal } from '../comun/Modal';
import { useAplicatie } from './context';
import { Reimprospatare } from './reimprospatare';

interface LinieRaport {
  articol_id: number;
  nume: string;
  um: string;
  tip: string;
  scriptic: number;
  faptic: number | null;
  diferenta: number | null;
  valoare: number | null;
  numarat_la: string | null;
}

interface Raport {
  id: number;
  stare: 'deschisa' | 'finalizata';
  inceputa_la: string;
  linii: LinieRaport[];
  numarate: number;
  total_plus: number;
  total_minus: number;
  total_net: number;
}

/** Cât de des se reîmprospătează raportul deschis (scripticul articolelor nenumărate). */
const INTERVAL_REIMPROSPATARE_MS = 30_000;

const TIPURI: Record<string, string> = { materie_prima: 'Materie primă', ambalaj: 'Ambalaje', marfa: 'Mărfuri' };

/**
 * Revizia la punctul de vânzare: barista numără, softul arată pe loc Scriptic vs. Faptic.
 * Scripticul vine de la server în timp real, deci aici e nevoie de internet.
 */
export function Inventar({ onInchide }: { onInchide: () => void }) {
  const app = useAplicatie();
  const token = app.config.token;
  const [raport, setRaport] = useState<Raport | null>(null);
  const [eroare, setEroare] = useState('');
  const [introduse, setIntroduse] = useState<Record<number, string>>({});
  const [filtru, setFiltru] = useState('');
  const [lucreaza, setLucreaza] = useState(false);
  const [confirmare, setConfirmare] = useState(false);
  const deschisa = useRef<number | null>(null);
  /** Scripticul articolelor nenumărate se schimbă la fiecare vânzare: raportul deschis se reîmprospătează
   *  periodic, dar rar (fiecare raport recalculează stocul locației) și niciodată peste o cerere în curs
   *  (citire, salvare, finalizare). */
  const reimprospatare = useRef<Reimprospatare | null>(null);
  reimprospatare.current ??= new Reimprospatare(
    () => void incarca(cerereJson<Raport>(`/api/pos/inventarieri/${deschisa.current}`, { token })),
    () => deschisa.current != null,
  );

  /** Eroarea rămâne afișată până la următoarea reușită; întoarce dacă a reușit. */
  const incarca = async (r?: Promise<Raport>) => {
    try {
      const nou = await reimprospatare.current!.urmareste(
        r ?? cerereJson<Raport>('/api/pos/inventarieri', { token, body: { utilizator_id: app.barista.id } }),
      );
      deschisa.current = nou.stare === 'deschisa' ? nou.id : null;
      setRaport(nou);
      setEroare('');
      return true;
    } catch (e) {
      setEroare((e as Error).message);
      return false;
    }
  };

  useEffect(() => {
    void incarca();
    return reimprospatare.current!.porneste(INTERVAL_REIMPROSPATARE_MS);
    // Se pornește o singură dată, la deschiderea ferestrei.
  }, []);

  const deSalvat = Object.entries(introduse)
    .filter(([, v]) => v.trim() !== '')
    .map(([id, v]) => ({ articol_id: Number(id), faptic: Number(v.replace(',', '.')) }));
  const invalide = deSalvat.some((l) => !Number.isFinite(l.faptic) || l.faptic < 0);

  const salveaza = async () => {
    if (!raport || !deSalvat.length) return;
    setLucreaza(true);
    // Cantitățile tastate se păstrează dacă salvarea nu reușește (de ex. fără internet).
    if (await incarca(cerereJson<Raport>(`/api/pos/inventarieri/${raport.id}/linii`, { token, method: 'PUT', body: { linii: deSalvat } }))) setIntroduse({});
    setLucreaza(false);
  };

  const finalizeaza = async () => {
    if (!raport) return;
    setLucreaza(true);
    await incarca(cerereJson<Raport>(`/api/pos/inventarieri/${raport.id}/finalizeaza`, { token, method: 'POST', body: {} }));
    setConfirmare(false);
    setLucreaza(false);
  };

  const grupuri = useMemo(() => {
    const q = filtru.trim().toLocaleLowerCase('ro');
    const linii = (raport?.linii ?? []).filter((l) => !q || l.nume.toLocaleLowerCase('ro').includes(q));
    return Object.keys(TIPURI)
      .map((tip) => ({ tip, linii: linii.filter((l) => l.tip === tip) }))
      .filter((g) => g.linii.length);
  }, [raport, filtru]);

  const finalizata = raport?.stare === 'finalizata';

  return (
    <Modal
      titlu={finalizata ? 'Raport de inventariere' : 'Inventariere'}
      onInchide={() => {
        if (deSalvat.length && !window.confirm('Aveți cantități nesalvate. Închideți fără să le salvați?')) return;
        onInchide();
      }}
      lat
      subsol={
        raport &&
        (finalizata ? (
          <button className="buton" onClick={onInchide}>Închide</button>
        ) : confirmare ? (
          <>
            <span className="slab">Stocul din sistem va fi corectat la cantitățile numărate ({raport.numarate} articole).</span>
            <button className="buton-secundar" onClick={() => setConfirmare(false)}>Înapoi</button>
            <button className="buton" disabled={lucreaza} onClick={finalizeaza}>Finalizează</button>
          </>
        ) : (
          <>
            <button className="buton" disabled={!deSalvat.length || invalide || lucreaza} onClick={salveaza}>
              Salvează și calculează ({deSalvat.length})
            </button>
            <button className="buton-secundar" disabled={!raport.numarate || deSalvat.length > 0} onClick={() => setConfirmare(true)}>
              Finalizează inventarierea
            </button>
          </>
        ))
      }
    >
      {eroare && (
        <div className="alerta pericol">
          {eroare}. {!app.sync.online && 'Inventarierea are nevoie de internet; vânzarea merge în continuare offline.'}
        </div>
      )}
      {!raport && !eroare && <p className="gol">Se încarcă stocul…</p>}
      {raport && (
        <div className="randuri-form">
          <div className="totaluri-inventar">
            <span>Numărate: <strong>{raport.numarate}</strong> din {raport.linii.length}</span>
            <span className="plus">Plus: {formatLei(raport.total_plus)}</span>
            <span className="minus">Minus: {formatLei(raport.total_minus)}</span>
            <span>Net: <strong className={raport.total_net < 0 ? 'minus' : 'plus'}>{formatLei(raport.total_net)}</strong></span>
          </div>
          {!finalizata && <input type="search" placeholder="Caută articol…" value={filtru} onChange={(e) => setFiltru(e.target.value)} />}
          {grupuri.map((g) => (
            <div key={g.tip} className="tabel-container">
              <table className="tabel tabel-inventar">
                <thead>
                  <tr>
                    <th>{TIPURI[g.tip]}</th>
                    <th className="num">Scriptic</th>
                    <th className="num">Faptic</th>
                    <th className="num">Diferență</th>
                    <th className="num">Valoare</th>
                  </tr>
                </thead>
                <tbody>
                  {g.linii.map((l) => (
                    <tr key={l.articol_id}>
                      <td>
                        {l.nume} <span className="slab mic">({l.um})</span>
                        {l.numarat_la && <div className="slab mic">numărat la {formatOra(l.numarat_la)}</div>}
                      </td>
                      <td className="num">{formatNumar(l.scriptic)}</td>
                      <td className="num">
                        {finalizata ? (
                          formatNumar(l.faptic)
                        ) : (
                          <input
                            className="intrare-numar"
                            inputMode="decimal"
                            aria-label={`Faptic ${l.nume}`}
                            placeholder={l.faptic != null ? formatNumar(l.faptic) : '—'}
                            value={introduse[l.articol_id] ?? ''}
                            onChange={(e) => setIntroduse({ ...introduse, [l.articol_id]: e.target.value })}
                          />
                        )}
                      </td>
                      <td className={`num ${l.diferenta == null ? '' : l.diferenta < 0 ? 'minus' : l.diferenta > 0 ? 'plus' : ''}`}>
                        {l.diferenta == null ? '' : `${l.diferenta > 0 ? '+' : ''}${formatNumar(l.diferenta)}`}
                      </td>
                      <td className="num">{l.valoare == null ? '' : formatLei(l.valoare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
