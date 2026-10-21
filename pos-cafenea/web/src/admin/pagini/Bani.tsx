import { useState, type FormEvent } from 'react';
import { ETICHETE_MISCARE_BANI, type TipMiscareBani } from '@cafenea/shared';
import { Modal } from '../../comun/Modal';
import { formatDataOra, formatLei, ziLocala } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api, mesajEroare } from '../api';
import { AlegeInterval, CapPagina, FiltruLocatie, Kpi, parametriInterval, Rand, Stare, type IntervalZile } from '../componente';
import { useAdmin, useDate } from '../context';

interface Rezumat {
  locatie_id: number;
  locatie: string;
  sold_numerar: number;
  incasari_numerar: number;
  incasari_card: number;
  plati_marunte: number;
  depuneri: number;
  alimentari: number;
  diferente: number;
}

interface MiscareBani {
  id: number;
  locatie: string;
  cont: 'numerar' | 'card';
  suma: number;
  tip: TipMiscareBani;
  descriere: string | null;
  utilizator: string | null;
  creata_la: string;
}

export function PaginaBani(_: PropsPagina) {
  const azi = ziLocala();
  const [perioada, setPerioada] = useState<IntervalZile>({ de: azi, pana: azi });
  const [locatie, setLocatie] = useState<number | null>(null);
  const [cont, setCont] = useState('');
  const [formular, setFormular] = useState(false);
  const p = parametriInterval(perioada);
  const rezumat = useDate(() => api.get<Rezumat[]>('/api/bani/rezumat', p), [p.de, p.pana]);
  const miscari = useDate(() => api.get<MiscareBani[]>('/api/bani/miscari', { ...p, locatie_id: locatie, cont }), [p.de, p.pana, locatie, cont]);

  return (
    <>
      <CapPagina
        titlu="Bani"
        subtitlu="Fluxul financiar al fiecărei cafenele: încasări, plăți din casă, depuneri și diferențele găsite la numărare."
        actiuni={
          <button type="button" className="buton" onClick={() => setFormular(true)}>
            + Operațiune de casă
          </button>
        }
      />
      <Rand>
        <AlegeInterval valoare={perioada} onChange={setPerioada} />
      </Rand>
      <Stare {...rezumat} gol={(d) => d.length === 0} mesajGol="Nicio cafenea definită.">
        {(lista) => (
          <div className="grila-carduri">
            {lista
              .filter((r) => !locatie || r.locatie_id === locatie)
              .map((r) => (
                <section key={r.locatie_id} className="card card-locatie">
                  <header>
                    <h2>{r.locatie}</h2>
                  </header>
                  <Kpi eticheta="Numerar în casă acum (scriptic)" valoare={formatLei(r.sold_numerar)} />
                  <div className="grila-kpi">
                    <Kpi eticheta="Încasări numerar" valoare={formatLei(r.incasari_numerar)} />
                    <Kpi eticheta="Încasări card" valoare={formatLei(r.incasari_card)} />
                    <Kpi eticheta="Plăți mărunte" valoare={formatLei(r.plati_marunte)} />
                    <Kpi eticheta="Depuneri / ridicări" valoare={formatLei(r.depuneri)} />
                    {r.alimentari !== 0 && <Kpi eticheta="Alimentări" valoare={formatLei(r.alimentari)} />}
                    <Kpi eticheta="Diferențe la numărare" valoare={<span className={r.diferente < 0 ? 'minus' : r.diferente > 0 ? 'dif-plus' : ''}>{formatLei(r.diferente)}</span>} />
                  </div>
                </section>
              ))}
          </div>
        )}
      </Stare>

      <section className="sectiune">
        <h2>Mișcări</h2>
        <Rand>
          <FiltruLocatie valoare={locatie} onChange={setLocatie} doarPuncte />
          <label className="camp camp-filtru">
            <span>Cont</span>
            <select value={cont} onChange={(e) => setCont(e.target.value)}>
              <option value="">Numerar și card</option>
              <option value="numerar">Numerar</option>
              <option value="card">Card</option>
            </select>
          </label>
        </Rand>
        <Stare {...miscari} gol={(d) => d.length === 0} mesajGol="Nicio mișcare de bani în intervalul ales.">
          {(lista) => (
            <div className="tabel-container">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Locația</th>
                    <th>Operațiune</th>
                    <th>Cont</th>
                    <th>Descriere</th>
                    <th className="num">Sumă</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDataOra(m.creata_la)}</td>
                      <td>{m.locatie}</td>
                      <td>
                        {m.tip === 'diferenta_casa' ? <span className="insigna avertisment">{ETICHETE_MISCARE_BANI[m.tip]}</span> : ETICHETE_MISCARE_BANI[m.tip] ?? m.tip}
                      </td>
                      <td>{m.cont === 'card' ? 'Card' : 'Numerar'}</td>
                      <td className="slab">
                        {m.descriere ?? ''}
                        {m.utilizator ? <span className="mic"> · {m.utilizator}</span> : null}
                      </td>
                      <td className={`num ${m.suma < 0 ? 'minus' : ''}`}>{formatLei(m.suma)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lista.length >= 300 && <p className="slab mic" style={{ padding: 8 }}>Se afișează ultimele 300 de mișcări; restrângeți intervalul.</p>}
            </div>
          )}
        </Stare>
      </section>

      {formular && (
        <FormularOperatiune
          locatieImplicita={locatie}
          onInchide={() => setFormular(false)}
          onSalvat={() => {
            setFormular(false);
            rezumat.reincarca();
            miscari.reincarca();
          }}
        />
      )}
    </>
  );
}

const TIPURI = [
  { tip: 'depunere', titlu: 'Depunere la bancă / ridicare numerar', ajutor: 'Numerarul scos din sertar (scade casa).' },
  { tip: 'plata_marunta', titlu: 'Plată mărunță din casă', ajutor: 'O cheltuială plătită din sertar (scade casa).' },
  { tip: 'alimentare', titlu: 'Alimentare casă', ajutor: 'Numerar adus în sertar, de ex. fond de rest (crește casa).' },
] as const;

function FormularOperatiune({ locatieImplicita, onInchide, onSalvat }: { locatieImplicita: number | null; onInchide: () => void; onSalvat: () => void }) {
  const { locatii, arata } = useAdmin();
  const [locatie, setLocatie] = useState<number | null>(locatieImplicita ?? locatii.find((l) => l.tip === 'punct' && l.activ)?.id ?? null);
  const [tip, setTip] = useState<(typeof TIPURI)[number]['tip']>('depunere');
  const [suma, setSuma] = useState('');
  const [descriere, setDescriere] = useState('');
  // Momentul real al operațiunii: o depunere făcută aseară intră în ziua de ieri.
  const [la, setLa] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);

  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    const s = Number(suma.replace(',', '.'));
    if (!locatie) return setEroare('Alegeți cafeneaua');
    if (!(s > 0)) return setEroare('Suma trebuie să fie pozitivă');
    setLucreaza(true);
    try {
      await api.post('/api/bani/miscari', { locatie_id: locatie, tip, suma: s, descriere: descriere.trim() || TIPURI.find((t) => t.tip === tip)!.titlu, la: new Date(la).toISOString() });
      arata('Operațiunea a fost înregistrată');
      onSalvat();
    } catch (err) {
      setEroare(mesajEroare(err));
    } finally {
      setLucreaza(false);
    }
  };

  return (
    <Modal
      titlu="Operațiune de casă"
      onInchide={onInchide}
      subsol={
        <>
          <button type="button" className="buton-secundar" onClick={onInchide}>
            Renunță
          </button>
          <button type="submit" form="formular-bani" className="buton" disabled={lucreaza}>
            Înregistrează
          </button>
        </>
      }
    >
      <form id="formular-bani" className="randuri-form" onSubmit={salveaza}>
        {eroare && <div className="alerta pericol">{eroare}</div>}
        <FiltruLocatie valoare={locatie} onChange={setLocatie} doarPuncte faraToate eticheta="Cafeneaua" />
        <fieldset className="randuri-form" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
          <legend className="slab mic" style={{ fontWeight: 600, marginBottom: 6 }}>
            Tipul operațiunii
          </legend>
          {TIPURI.map((t) => (
            <label key={t.tip} className="bifa">
              <input type="radio" name="tip" checked={tip === t.tip} onChange={() => setTip(t.tip)} />
              <span>
                {t.titlu}
                <span className="slab mic"> — {t.ajutor}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="camp">
          <span>Suma (lei)</span>
          <input inputMode="decimal" value={suma} onChange={(e) => setSuma(e.target.value)} required />
        </label>
        <label className="camp">
          <span>Descriere</span>
          <input value={descriere} onChange={(e) => setDescriere(e.target.value)} placeholder="de ex. depus la MAIB, chitanța nr. 123" />
        </label>
        <label className="camp">
          <span>Când a avut loc</span>
          <input type="datetime-local" value={la} onChange={(e) => setLa(e.target.value)} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} required />
        </label>
      </form>
    </Modal>
  );
}
