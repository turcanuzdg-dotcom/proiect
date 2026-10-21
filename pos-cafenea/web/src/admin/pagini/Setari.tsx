import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../comun/Modal';
import { formatDataOra, formatLei } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api, mesajEroare } from '../api';
import { CapPagina, FiltruLocatie, Rand, Stare, Taburi } from '../componente';
import { useAdmin, useDate } from '../context';
import type { Locatie } from '../tipuri';

type Tab = 'locatii' | 'utilizatori' | 'tablete' | 'tolerante' | 'erori';
const TABURI: { cheie: Tab; titlu: string }[] = [
  { cheie: 'locatii', titlu: 'Locații' },
  { cheie: 'utilizatori', titlu: 'Utilizatori' },
  { cheie: 'tablete', titlu: 'Tablete' },
  { cheie: 'tolerante', titlu: 'Toleranțe la închidere' },
  { cheie: 'erori', titlu: 'Erori de sincronizare' },
];

export function PaginaSetari({ sub, navigheaza }: PropsPagina) {
  const tab = (TABURI.find((t) => t.cheie === sub[0])?.cheie ?? 'locatii') as Tab;
  return (
    <>
      <CapPagina titlu="Setări" />
      <Taburi taburi={TABURI} activ={tab} onChange={(k) => navigheaza(`setari/${k}`)} />
      {tab === 'locatii' && <TabLocatii />}
      {tab === 'utilizatori' && <TabUtilizatori />}
      {tab === 'tablete' && <TabTablete />}
      {tab === 'tolerante' && <TabTolerante />}
      {tab === 'erori' && <TabErori />}
    </>
  );
}

// ---------------- Locații ----------------

function TabLocatii() {
  const { locatii, reincarcaLocatii, arata } = useAdmin();
  const [editat, setEditat] = useState<Locatie | 'nou' | null>(null);
  const [nume, setNume] = useState('');
  const [tip, setTip] = useState<'depozit' | 'punct'>('punct');
  const [activ, setActiv] = useState(true);

  useEffect(() => {
    if (!editat) return;
    setNume(editat === 'nou' ? '' : editat.nume);
    setTip(editat === 'nou' ? 'punct' : editat.tip);
    setActiv(editat === 'nou' ? true : editat.activ);
  }, [editat]);

  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editat === 'nou') await api.post('/api/locatii', { nume: nume.trim(), tip });
      else if (editat) await api.put(`/api/locatii/${editat.id}`, { nume: nume.trim(), tip, activ });
      arata('Locația a fost salvată');
      setEditat(null);
      reincarcaLocatii();
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };

  return (
    <>
      <Rand>
        <p className="slab mic" style={{ maxWidth: 640 }}>
          Fiecare locație e o gestiune separată, cu stoc și bani proprii. Depozitul primește facturile; cafenelele vând.
        </p>
        <button type="button" className="buton" style={{ marginLeft: 'auto' }} onClick={() => setEditat('nou')}>
          + Locație nouă
        </button>
      </Rand>
      <div className="tabel-container">
        <table className="tabel">
          <thead>
            <tr>
              <th>Nume</th>
              <th>Tip</th>
              <th>Stare</th>
            </tr>
          </thead>
          <tbody>
            {locatii.map((l) => (
              <tr key={l.id} className="clic" onClick={() => setEditat(l)}>
                <td>{l.nume}</td>
                <td>{l.tip === 'depozit' ? 'Depozit' : 'Punct de vânzare'}</td>
                <td>{l.activ ? <span className="insigna succes">activă</span> : <span className="insigna">inactivă</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editat && (
        <Modal
          titlu={editat === 'nou' ? 'Locație nouă' : `Locația ${editat.nume}`}
          onInchide={() => setEditat(null)}
          subsol={
            <>
              <button type="button" className="buton-secundar" onClick={() => setEditat(null)}>
                Renunță
              </button>
              <button type="submit" form="formular-locatie" className="buton">
                Salvează
              </button>
            </>
          }
        >
          <form id="formular-locatie" className="randuri-form" onSubmit={salveaza}>
            <label className="camp">
              <span>Nume</span>
              <input value={nume} onChange={(e) => setNume(e.target.value)} required />
            </label>
            <label className="camp">
              <span>Tip</span>
              <select value={tip} onChange={(e) => setTip(e.target.value as 'depozit' | 'punct')}>
                <option value="punct">Punct de vânzare (cafenea)</option>
                <option value="depozit">Depozit</option>
              </select>
            </label>
            {editat !== 'nou' && (
              <label className="bifa">
                <input type="checkbox" checked={activ} onChange={(e) => setActiv(e.target.checked)} /> Activă
              </label>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}

// ---------------- Utilizatori ----------------

interface Utilizator {
  id: number;
  nume: string;
  rol: 'admin' | 'barista';
  login: string | null;
  locatie_id: number | null;
  locatie: string | null;
  activ: boolean;
  are_pin: boolean;
}

function TabUtilizatori() {
  const r = useDate(() => api.get<Utilizator[]>('/api/utilizatori'), []);
  const [editat, setEditat] = useState<Utilizator | 'nou' | null>(null);
  return (
    <>
      <Rand>
        <p className="slab mic" style={{ maxWidth: 640 }}>
          Baristele intră pe tabletă cu PIN-ul (4–6 cifre), care atribuie vânzările; administratorii intră în acest panou cu utilizator și parolă.
        </p>
        <button type="button" className="buton" style={{ marginLeft: 'auto' }} onClick={() => setEditat('nou')}>
          + Utilizator nou
        </button>
      </Rand>
      <Stare {...r}>
        {(lista) => (
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Nume</th>
                  <th>Rol</th>
                  <th>Acces</th>
                  <th>Locația</th>
                  <th>Stare</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id} className={`clic${u.activ ? '' : ' anulata'}`} onClick={() => setEditat(u)}>
                    <td>{u.nume}</td>
                    <td>{u.rol === 'admin' ? 'Administrator' : 'Barista'}</td>
                    <td className="slab">
                      {u.login ? `utilizator „${u.login}”` : ''}
                      {u.login && u.are_pin ? ' · ' : ''}
                      {u.are_pin ? 'PIN setat' : ''}
                    </td>
                    <td>{u.rol === 'barista' ? u.locatie ?? 'toate cafenelele' : '—'}</td>
                    <td>{u.activ ? <span className="insigna succes">activ</span> : <span className="insigna">dezactivat</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stare>
      {editat && (
        <FormularUtilizator
          utilizator={editat === 'nou' ? null : editat}
          onInchide={() => setEditat(null)}
          onSalvat={() => {
            setEditat(null);
            r.reincarca();
          }}
        />
      )}
    </>
  );
}

function FormularUtilizator(props: { utilizator: Utilizator | null; onInchide: () => void; onSalvat: () => void }) {
  const { arata } = useAdmin();
  const u = props.utilizator;
  const [nume, setNume] = useState(u?.nume ?? '');
  const [rol, setRol] = useState<'admin' | 'barista'>(u?.rol ?? 'barista');
  const [login, setLogin] = useState(u?.login ?? '');
  const [parola, setParola] = useState('');
  const [pin, setPin] = useState('');
  const [locatie, setLocatie] = useState<number | null>(u?.locatie_id ?? null);
  const [activ, setActiv] = useState(u?.activ ?? true);
  const [eroare, setEroare] = useState<string | null>(null);

  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    setEroare(null);
    if (pin && !/^\d{4,6}$/.test(pin)) return setEroare('PIN-ul are 4–6 cifre');
    if (rol === 'barista' && !u && !pin) return setEroare('Barista are nevoie de un PIN ca să intre pe tabletă');
    if (rol === 'admin' && !login.trim()) return setEroare('Administratorul are nevoie de un nume de utilizator');
    if (rol === 'admin' && !u && parola.length < 8) return setEroare('Parola are cel puțin 8 caractere');
    if (parola && parola.length < 8) return setEroare('Parola are cel puțin 8 caractere');
    try {
      const corp = {
        nume: nume.trim(),
        rol,
        login: login.trim() || null,
        parola: parola || null,
        pin: pin || null,
        locatie_id: rol === 'barista' ? locatie : null,
        activ,
      };
      if (u) await api.put(`/api/utilizatori/${u.id}`, corp);
      else await api.post('/api/utilizatori', corp);
      arata('Utilizatorul a fost salvat');
      props.onSalvat();
    } catch (err) {
      setEroare(mesajEroare(err));
    }
  };

  return (
    <Modal
      titlu={u ? `Utilizator: ${u.nume}` : 'Utilizator nou'}
      onInchide={props.onInchide}
      subsol={
        <>
          <button type="button" className="buton-secundar" onClick={props.onInchide}>
            Renunță
          </button>
          <button type="submit" form="formular-utilizator" className="buton">
            Salvează
          </button>
        </>
      }
    >
      <form id="formular-utilizator" className="randuri-form" onSubmit={salveaza} autoComplete="off">
        {eroare && <div className="alerta pericol">{eroare}</div>}
        <label className="camp">
          <span>Nume</span>
          <input value={nume} onChange={(e) => setNume(e.target.value)} required />
        </label>
        <label className="camp">
          <span>Rol</span>
          <select value={rol} onChange={(e) => setRol(e.target.value as 'admin' | 'barista')}>
            <option value="barista">Barista (tabletă)</option>
            <option value="admin">Administrator (panou)</option>
          </select>
        </label>
        {rol === 'barista' ? (
          <>
            <label className="camp">
              <span>PIN pentru tabletă {u?.are_pin ? '(gol = rămâne cel vechi)' : ''}</span>
              <input inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4–6 cifre" />
            </label>
            <FiltruLocatie valoare={locatie} onChange={setLocatie} doarPuncte eticheta="Cafeneaua (gol = poate lucra în toate)" />
          </>
        ) : (
          <div className="doua-coloane">
            <label className="camp">
              <span>Utilizator</span>
              <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
            </label>
            <label className="camp">
              <span>Parola {u ? '(gol = rămâne cea veche)' : ''}</span>
              <input type="password" value={parola} onChange={(e) => setParola(e.target.value)} autoComplete="new-password" placeholder="cel puțin 8 caractere" />
            </label>
          </div>
        )}
        {u && (
          <label className="bifa">
            <input type="checkbox" checked={activ} onChange={(e) => setActiv(e.target.checked)} /> Activ (dezactivarea închide sesiunile deschise)
          </label>
        )}
      </form>
    </Modal>
  );
}

// ---------------- Tablete ----------------

interface Dispozitiv {
  id: number;
  nume: string;
  locatie_id: number;
  locatie: string;
  cod_asociere: string | null;
  activ: boolean;
  creat_la: string;
  ultima_sincronizare: string | null;
  asociat: boolean;
}

function TabTablete() {
  const { arata, locatii } = useAdmin();
  const r = useDate(() => api.get<Dispozitiv[]>('/api/dispozitive'), []);
  const [nou, setNou] = useState(false);
  const [nume, setNume] = useState('');
  const [locatie, setLocatie] = useState<number | null>(null);
  const [cod, setCod] = useState<{ nume: string; cod: string } | null>(null);

  useEffect(() => {
    if (locatie == null) setLocatie(locatii.find((l) => l.tip === 'punct' && l.activ)?.id ?? null);
  }, [locatii, locatie]);

  const creeaza = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const d = await api.post<Dispozitiv>('/api/dispozitive', { nume: nume.trim(), locatie_id: locatie });
      setNou(false);
      setNume('');
      setCod({ nume: d.nume, cod: d.cod_asociere! });
      r.reincarca();
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };
  const reasociaza = async (d: Dispozitiv) => {
    if (!window.confirm(`Generați un cod nou pentru „${d.nume}”? Tableta actuală va trebui asociată din nou.`)) return;
    try {
      const x = await api.post<Dispozitiv>(`/api/dispozitive/${d.id}/reasociere`);
      setCod({ nume: d.nume, cod: x.cod_asociere! });
      r.reincarca();
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };
  const comuta = async (d: Dispozitiv) => {
    try {
      await api.put(`/api/dispozitive/${d.id}/activ`, { activ: !d.activ });
      arata(d.activ ? 'Tableta a fost dezactivată' : 'Tableta a fost reactivată');
      r.reincarca();
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };

  return (
    <>
      <Rand>
        <p className="slab mic" style={{ maxWidth: 640 }}>
          Fiecare tabletă de la tejghea se asociază o singură dată cu o cafenea, printr-un cod. O tabletă pierdută se dezactivează de aici.
        </p>
        <button type="button" className="buton" style={{ marginLeft: 'auto' }} onClick={() => setNou(true)}>
          + Tabletă nouă
        </button>
      </Rand>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Nicio tabletă înregistrată.">
        {(lista) => (
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Tableta</th>
                  <th>Cafeneaua</th>
                  <th>Stare</th>
                  <th>Ultima sincronizare</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((d) => (
                  <tr key={d.id} className={d.activ ? undefined : 'anulata'}>
                    <td>{d.nume}</td>
                    <td>{d.locatie}</td>
                    <td>
                      {!d.activ ? (
                        <span className="insigna">dezactivată</span>
                      ) : d.asociat ? (
                        <span className="insigna succes">asociată</span>
                      ) : (
                        <span className="insigna info">așteaptă codul {d.cod_asociere}</span>
                      )}
                    </td>
                    <td>{formatDataOra(d.ultima_sincronizare)}</td>
                    <td className="num">
                      <button type="button" className="buton-link" onClick={() => reasociaza(d)}>
                        Cod nou
                      </button>
                      <button type="button" className="buton-link" onClick={() => comuta(d)}>
                        {d.activ ? 'Dezactivează' : 'Reactivează'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stare>
      {nou && (
        <Modal
          titlu="Tabletă nouă"
          onInchide={() => setNou(false)}
          subsol={
            <>
              <button type="button" className="buton-secundar" onClick={() => setNou(false)}>
                Renunță
              </button>
              <button type="submit" form="formular-tableta" className="buton">
                Creează și arată codul
              </button>
            </>
          }
        >
          <form id="formular-tableta" className="randuri-form" onSubmit={creeaza}>
            <label className="camp">
              <span>Nume</span>
              <input value={nume} onChange={(e) => setNume(e.target.value)} required placeholder="de ex. Tabletă tejghea Centru" />
            </label>
            <FiltruLocatie valoare={locatie} onChange={setLocatie} doarPuncte faraToate eticheta="Cafeneaua" />
          </form>
        </Modal>
      )}
      {cod && (
        <Modal
          titlu={`Codul de asociere: ${cod.nume}`}
          onInchide={() => setCod(null)}
          subsol={
            <button type="button" className="buton" onClick={() => setCod(null)}>
              Gata
            </button>
          }
        >
          <div className="randuri-form">
            <div className="cod-mare" aria-label="Cod de asociere">
              {cod.cod}
            </div>
            <ol className="slab" style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                Pe tabletă, deschideți <strong>{window.location.origin}/pos.html</strong>.
              </li>
              <li>Introduceți codul de mai sus. Codul merge o singură dată.</li>
              <li>Din meniul browserului alegeți „Adaugă pe ecranul principal”, ca aplicația să pornească și fără internet.</li>
            </ol>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------- Toleranțe ----------------

function TabTolerante() {
  const { arata } = useAdmin();
  const r = useDate(() => api.get<{ numerar: number; card: number; doze: number }>('/api/setari/tolerante'), []);
  const [v, setV] = useState<{ numerar: string; card: string; doze: string } | null>(null);
  useEffect(() => {
    if (r.date && !v) setV({ numerar: String(r.date.numerar), card: String(r.date.card), doze: String(r.date.doze) });
  }, [r.date, v]);

  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    if (!v) return;
    const n = (s: string) => Number(s.replace(',', '.'));
    const corp = { numerar: n(v.numerar), card: n(v.card), doze: n(v.doze) };
    if (Object.values(corp).some((x) => !(x >= 0))) return arata('Toleranțele sunt numere pozitive', 'pericol');
    try {
      await api.put('/api/setari/tolerante', corp);
      arata('Toleranțele au fost salvate');
      r.reincarca();
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };

  return (
    <Stare {...r}>
      {(t) => (
        <form className="card randuri-form" style={{ maxWidth: 560 }} onSubmit={salveaza}>
          <p className="slab">
            La închiderea turei, o diferență mai mare decât pragul de mai jos marchează tura „cu discrepanțe” și apare pe Panou. Orice diferență la anulări sau casări se semnalează întotdeauna.
          </p>
          {v && (
            <div className="trei-coloane">
              <label className="camp">
                <span>Numerar (lei)</span>
                <input inputMode="decimal" value={v.numerar} onChange={(e) => setV({ ...v, numerar: e.target.value })} />
              </label>
              <label className="camp">
                <span>Card (lei)</span>
                <input inputMode="decimal" value={v.card} onChange={(e) => setV({ ...v, card: e.target.value })} />
              </label>
              <label className="camp">
                <span>Doze de cafea</span>
                <input inputMode="decimal" value={v.doze} onChange={(e) => setV({ ...v, doze: e.target.value })} />
              </label>
            </div>
          )}
          <p className="slab mic">
            Acum: numerar ±{formatLei(t.numerar)}, card ±{formatLei(t.card)}, doze ±{t.doze}.
          </p>
          <div>
            <button type="submit" className="buton">
              Salvează
            </button>
          </div>
        </form>
      )}
    </Stare>
  );
}

// ---------------- Erori de sincronizare ----------------

interface EroareSync {
  id: string;
  tip: string;
  la: string | null;
  primit_la: string;
  eroare: string | null;
  dispozitiv: string | null;
  locatie: string | null;
  payload: { date?: Record<string, unknown> } & Record<string, unknown>;
}

const TIPURI_EVENIMENT: Record<string, string> = {
  comanda: 'Vânzare / casare',
  comanda_anulata: 'Anulare',
  tura_deschisa: 'Deschidere tură',
  tura_inchisa: 'Închidere tură',
  plata_marunta: 'Plată mărunță',
};

function TabErori() {
  const { arata } = useAdmin();
  const r = useDate(() => api.get<EroareSync[]>('/api/sync/erori'), []);
  const [detaliu, setDetaliu] = useState<EroareSync | null>(null);

  const actiune = async (e: EroareSync, ce: 'reaplica' | 'rezolvat') => {
    if (ce === 'rezolvat' && !window.confirm('Marcați evenimentul ca rezolvat fără să-l aplicați? Nu se va mai modifica stocul sau banii pentru el.')) return;
    try {
      await api.post(`/api/sync/erori/${e.id}/${ce}`);
      arata(ce === 'reaplica' ? 'Evenimentul a fost aplicat' : 'Marcat rezolvat');
      setDetaliu(null);
      r.reincarca();
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
      r.reincarca();
    }
  };

  return (
    <>
      <p className="slab mic" style={{ maxWidth: 720 }}>
        Operațiunile făcute pe tabletă (inclusiv offline) care n-au putut fi aplicate pe server, de exemplu pentru că un produs a fost șters între timp. Nimic nu se pierde: corectați cauza (refaceți produsul, utilizatorul etc.), apoi „Reaplică”.
      </p>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Nicio eroare de sincronizare. Toate operațiunile de pe tablete au fost aplicate.">
        {(lista) => (
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Făcută pe tabletă</th>
                  <th>Tableta</th>
                  <th>Operațiune</th>
                  <th>Eroarea</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {formatDataOra(e.la ?? e.primit_la)}
                      <div className="slab mic">primită {formatDataOra(e.primit_la)}</div>
                    </td>
                    <td>
                      {e.dispozitiv ?? '—'}
                      <div className="slab mic">{e.locatie}</div>
                    </td>
                    <td>{TIPURI_EVENIMENT[e.tip] ?? e.tip}</td>
                    <td className="minus">{e.eroare}</td>
                    <td className="num">
                      <button type="button" className="buton-link" onClick={() => setDetaliu(e)}>
                        Detalii
                      </button>
                      <button type="button" className="buton-link" onClick={() => actiune(e, 'reaplica')}>
                        Reaplică
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stare>
      {detaliu && (
        <Modal
          titlu={`${TIPURI_EVENIMENT[detaliu.tip] ?? detaliu.tip} · ${formatDataOra(detaliu.la ?? detaliu.primit_la)}`}
          onInchide={() => setDetaliu(null)}
          lat
          subsol={
            <>
              <button type="button" className="buton-secundar" onClick={() => actiune(detaliu, 'rezolvat')}>
                Marchează rezolvat (fără aplicare)
              </button>
              <button type="button" className="buton" onClick={() => actiune(detaliu, 'reaplica')}>
                Reaplică
              </button>
            </>
          }
        >
          <div className="randuri-form">
            <div className="alerta pericol">{detaliu.eroare}</div>
            <RezumatEveniment e={detaliu} />
            <details>
              <summary className="slab mic">Datele complete trimise de tabletă</summary>
              <pre className="payload">{JSON.stringify(detaliu.payload, null, 2)}</pre>
            </details>
          </div>
        </Modal>
      )}
    </>
  );
}

function RezumatEveniment({ e }: { e: EroareSync }) {
  const d = (e.payload?.date ?? {}) as Record<string, any>;
  const randuri: [string, string][] = [];
  if (e.tip === 'comanda') {
    randuri.push(['Plata', String(d.metoda ?? '—')]);
    randuri.push(['Total', typeof d.total === 'number' ? formatLei(d.total) : '—']);
    if (Array.isArray(d.linii)) randuri.push(['Linii', d.linii.map((l: any) => `${l.cantitate}× produsul #${l.produs_id}`).join(', ')]);
  }
  if (e.tip === 'comanda_anulata') randuri.push(['Comanda', String(d.comanda_id ?? '—')], ['Motiv', String(d.motiv ?? '—')]);
  if (e.tip === 'tura_inchisa') randuri.push(['Numerar declarat', formatLei(Number(d.numerar ?? 0))], ['Card declarat', formatLei(Number(d.card ?? 0))], ['Doze', String(d.doze ?? '—')]);
  if (e.tip === 'plata_marunta') randuri.push(['Suma', formatLei(Number(d.suma ?? 0))], ['Descriere', String(d.descriere ?? '')]);
  if (d.utilizator_id) randuri.push(['Utilizator', `#${d.utilizator_id}`]);
  if (!randuri.length) return null;
  return (
    <table className="tabel">
      <tbody>
        {randuri.map(([k, v]) => (
          <tr key={k}>
            <td className="slab">{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
