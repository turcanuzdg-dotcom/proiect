import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../comun/Modal';
import { formatDataOra, formatLei } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api, mesajEroare } from '../api';
import { CapPagina, FiltruLocatie, Rand, Stare, Taburi } from '../componente';
import { useAdmin, useDate } from '../context';
import type { Locatie } from '../tipuri';

type Tab = 'locatii' | 'utilizatori' | 'tablete' | 'fiscal' | 'tolerante' | 'erori' | 'jurnal';
const TABURI: { cheie: Tab; titlu: string }[] = [
  { cheie: 'locatii', titlu: 'Locații' },
  { cheie: 'utilizatori', titlu: 'Utilizatori' },
  { cheie: 'tablete', titlu: 'Tablete' },
  { cheie: 'fiscal', titlu: 'Terminal fiscal' },
  { cheie: 'tolerante', titlu: 'Toleranțe la închidere' },
  { cheie: 'erori', titlu: 'Erori de sincronizare' },
  { cheie: 'jurnal', titlu: 'Jurnal' },
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
      {tab === 'fiscal' && <TabFiscal />}
      {tab === 'tolerante' && <TabTolerante />}
      {tab === 'erori' && <TabErori />}
      {tab === 'jurnal' && <TabJurnal />}
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
  are_parola: boolean;
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

/** Ca pe server (rute/admin.ts): contul de administrator vede toți banii rețelei. */
const PAROLA_ADMIN_MINIM = 12;

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
    if (rol === 'admin' && !u?.are_parola && parola.length < PAROLA_ADMIN_MINIM) {
      return setEroare(`Administratorul are nevoie de o parolă de cel puțin ${PAROLA_ADMIN_MINIM} caractere`);
    }
    if (rol === 'admin' && parola && parola.length < PAROLA_ADMIN_MINIM) return setEroare(`Parola unui administrator are cel puțin ${PAROLA_ADMIN_MINIM} caractere`);
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
              <span className="slab mic">Nu folosiți PIN-ul cardului bancar: PIN-ul tabletei nu e o protecție puternică.</span>
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
              <span>Parola {u?.are_parola ? '(gol = rămâne cea veche)' : ''}</span>
              <input type="password" value={parola} onChange={(e) => setParola(e.target.value)} autoComplete="new-password" placeholder={`cel puțin ${PAROLA_ADMIN_MINIM} caractere`} />
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

// ---------------- Terminal fiscal (POSLink) ----------------

interface ConfigTerminal {
  configurat: boolean;
  fiscal: { cota_tva_implicita: string; antet: string };
}

function TabFiscal() {
  const { arata } = useAdmin();
  const r = useDate(() => api.get<ConfigTerminal>('/api/terminal/config'), []);
  const [cota, setCota] = useState<string | null>(null);
  const [antet, setAntet] = useState<string | null>(null);
  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/api/setari/fiscal', { cota_tva_implicita: (cota ?? r.date?.fiscal.cota_tva_implicita ?? 'A').toUpperCase(), antet: antet ?? r.date?.fiscal.antet ?? '' });
      arata('Setările fiscale au fost salvate');
      r.reincarca();
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };
  return (
    <Stare {...r}>
      {(c) => (
        <div className="randuri-form" style={{ maxWidth: 720 }}>
          <div className={`alerta ${c.configurat ? 'succes' : 'avertisment'}`}>
            {c.configurat
              ? 'Legătura cu POSLink (Intelectsoft) este configurată pe server. Fiecare tabletă primește terminalul ei din tabul „Tablete”.'
              : 'Legătura cu POSLink nu este configurată: setați variabila POSLINK_API_KEY pe server (cheia din cabinetul POSLink). Până atunci tabletele folosesc simulatorul.'}
          </div>
          <p className="slab mic">
            Terminalul bancar Android în regim fiscal (de ex. PAX A930 cu IS Fiscal) face trei lucruri pentru tabletă: încasează cardul, tipărește bonul fiscal și
            scoate raportul Z. Cheia API stă doar pe server; tableta vorbește cu serverul nostru.
          </p>
          <form className="randuri-form" onSubmit={salveaza}>
            <div className="doua-coloane">
              <label className="camp">
                <span>Cota TVA implicită (litera de pe casa fiscală)</span>
                <input value={cota ?? c.fiscal.cota_tva_implicita} onChange={(e) => setCota(e.target.value.toUpperCase().slice(0, 1))} maxLength={1} />
              </label>
              <label className="camp">
                <span>Text în antetul bonului (opțional)</span>
                <input value={antet ?? c.fiscal.antet} onChange={(e) => setAntet(e.target.value)} maxLength={60} placeholder="de ex. Mulțumim!" />
              </label>
            </div>
            <div>
              <button type="submit" className="buton">
                Salvează
              </button>
            </div>
          </form>
          <p className="slab mic">
            Literele cotelor (A = 20%, B = 8%, …) sunt cele configurate pe casa fiscală a clientului; se văd în cabinetul MEV. Un produs poate avea propria literă, din Rețetar.
          </p>
        </div>
      )}
    </Stare>
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
  terminal_device_id: string | null;
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
    if (d.activ && !window.confirm(`Dezactivați „${d.nume}”? Tableta nu mai poate vinde sau sincroniza; pentru a o folosi din nou va trebui asociată cu un cod nou.`)) return;
    try {
      const x = await api.put<{ cod_asociere: string | null }>(`/api/dispozitive/${d.id}/activ`, { activ: !d.activ });
      if (d.activ) arata('Tableta a fost dezactivată; tokenul ei nu mai funcționează');
      else {
        // Reactivarea nu readuce tokenul vechi: tableta se asociază din nou, cu un cod nou.
        arata('Tableta a fost reactivată; asociați-o cu codul nou');
        if (x.cod_asociere) setCod({ nume: d.nume, cod: x.cod_asociere });
      }
      r.reincarca();
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };
  // ID-ul terminalului (DeviceID din cabinetul POSLink) legat de tabletă.
  const [terminale, setTerminale] = useState<Record<number, string>>({});
  const salveazaTerminal = async (d: Dispozitiv) => {
    const valoare = (terminale[d.id] ?? d.terminal_device_id ?? '').trim();
    try {
      await api.put(`/api/dispozitive/${d.id}/terminal`, { terminal_device_id: valoare || null });
      arata(valoare ? 'Terminalul a fost legat de tabletă' : 'Terminalul a fost dezlegat');
      setTerminale((v) => { const n = { ...v }; delete n[d.id]; return n; });
      r.reincarca();
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };
  const verificaTerminal = async (d: Dispozitiv) => {
    try {
      const s = await api.get<{ stare: Record<string, unknown> }>(`/api/dispozitive/${d.id}/terminal/stare`);
      const st = s.stare;
      arata(`Terminal ${st.online === false ? 'offline' : 'online'}${st.battery != null ? ` · baterie ${st.battery}%` : ''}${st.paper != null ? ` · hârtie ${st.paper}` : ''}${st.bank ? ` · ${st.bank}` : ''}`);
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };

  return (
    <>
      <Rand>
        <p className="slab mic" style={{ maxWidth: 640 }}>
          Fiecare tabletă de la tejghea se asociază o singură dată cu o cafenea, printr-un cod. O tabletă pierdută se dezactivează de aici:
          accesul ei se oprește imediat, iar dacă o reactivați, primiți un cod nou de asociere (accesul vechi nu mai revine).
          Vânzările netrimise de pe tabletă rămân în ea și pleacă după re-asociere.
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
                  <th>Terminal fiscal (ID POSLink)</th>
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
                    <td>
                      <span className="cu-um">
                        <input
                          className="input-mic"
                          style={{ width: 240 }}
                          placeholder="DeviceID din cabinetul POSLink"
                          aria-label={`Terminal ${d.nume}`}
                          value={terminale[d.id] ?? d.terminal_device_id ?? ''}
                          onChange={(e) => setTerminale((v) => ({ ...v, [d.id]: e.target.value }))}
                        />
                        {terminale[d.id] !== undefined && terminale[d.id] !== (d.terminal_device_id ?? '') && (
                          <button type="button" className="buton-link" onClick={() => salveazaTerminal(d)}>
                            Salvează
                          </button>
                        )}
                        {d.terminal_device_id && terminale[d.id] === undefined && (
                          <button type="button" className="buton-link" onClick={() => verificaTerminal(d)}>
                            Verifică
                          </button>
                        )}
                      </span>
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
        Operațiunile făcute pe tabletă (inclusiv offline) care n-au putut fi aplicate pe server, de exemplu pentru că un produs a fost șters între timp. Nimic nu se pierde: corectați cauza (refaceți produsul, utilizatorul etc.), apoi „Reaplică”. Dacă eroarea spune că utilizatorul nu are PIN de tabletă, dați-i un PIN în tabul Utilizatori și reaplicați.
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

// ---------------- Jurnal de audit ----------------

interface IntrareJurnal {
  id: number;
  la: string;
  utilizator: string | null;
  dispozitiv: string | null;
  locatie: string | null;
  adresa: string | null;
  actiune: string;
  cale: string | null;
  stare_http: number | null;
  date: { login?: string; corp?: unknown; inainte?: unknown; incercari?: number; exemple?: string[] } | null;
}

/** Numele pe înțeles ale acțiunilor; cele necunoscute apar ca atare (metoda și ruta). */
const ACTIUNI: Record<string, string> = {
  'login.reusit': 'Autentificare în panou',
  'login.esuat': 'Autentificare eșuată',
  'login.esuat.necunoscut': 'Autentificări eșuate (conturi inexistente)',
  'POST /api/auth/logout': 'Ieșire din panou',
  'POST /api/locatii': 'Locație creată',
  'PUT /api/locatii/:id': 'Locație modificată',
  'POST /api/utilizatori': 'Utilizator creat',
  'PUT /api/utilizatori/:id': 'Utilizator modificat',
  'POST /api/dispozitive': 'Tabletă creată',
  'POST /api/dispozitive/:id/reasociere': 'Cod nou pentru tabletă',
  'PUT /api/dispozitive/:id/activ': 'Tabletă activată / dezactivată',
  'PUT /api/dispozitive/:id/terminal': 'Terminal legat de tabletă',
  'PUT /api/setari/fiscal': 'Setări fiscale',
  'PUT /api/setari/tolerante': 'Toleranțe la închidere',
  'POST /api/articole': 'Articol creat',
  'PUT /api/articole/:id': 'Articol modificat',
  'POST /api/categorii': 'Categorie creată',
  'PUT /api/categorii/:id': 'Categorie modificată',
  'POST /api/produse': 'Produs creat',
  'PUT /api/produse/:id': 'Produs sau rețetă modificată',
  'POST /api/modificatori': 'Modificator creat',
  'PUT /api/modificatori/:id': 'Modificator modificat',
  'POST /api/receptii': 'Recepție de marfă',
  'POST /api/transferuri': 'Transfer între locații',
  'POST /api/inventarieri': 'Inventariere începută',
  'PUT /api/inventarieri/:id/linii': 'Numărare la inventar',
  'POST /api/inventarieri/:id/finalizeaza': 'Inventariere finalizată',
  'POST /api/ture/:id/verifica': 'Tură verificată',
  'POST /api/bani/miscari': 'Operațiune de casă',
  'POST /api/sync/erori/:id/reaplica': 'Eveniment de pe tabletă reaplicat',
  'POST /api/sync/erori/:id/rezolvat': 'Eveniment de pe tabletă marcat rezolvat (fără aplicare)',
  'POST /api/pos/asociere': 'Tabletă asociată',
  'POST /api/pos/terminal/plata': 'Plată cu cardul (terminal)',
  'POST /api/pos/terminal/retur': 'Retur pe card (terminal)',
  'POST /api/pos/terminal/bon': 'Bon fiscal',
  'POST /api/pos/terminal/raport-z': 'Raport Z',
  'POST /api/pos/inventarieri': 'Inventariere începută pe tabletă',
  'PUT /api/pos/inventarieri/:id/linii': 'Numărare la inventar pe tabletă',
  'POST /api/pos/inventarieri/:id/finalizeaza': 'Inventariere finalizată pe tabletă',
};

function titluActiune(e: IntrareJurnal): string {
  if (e.actiune === 'PUT /api/dispozitive/:id/activ') {
    const activ = (e.date?.corp as { activ?: boolean } | undefined)?.activ;
    if (activ !== undefined) return activ ? 'Tabletă reactivată (cod nou)' : 'Tabletă dezactivată';
  }
  if (e.actiune === 'login.esuat.necunoscut' && e.date?.incercari) return `${ACTIUNI[e.actiune]}: ${e.date.incercari}`;
  return ACTIUNI[e.actiune] ?? e.actiune;
}

function cine(e: IntrareJurnal): string {
  if (e.utilizator) return e.utilizator;
  if (e.dispozitiv) return `${e.dispozitiv}${e.locatie ? ` (${e.locatie})` : ''}`;
  if (e.date?.login) return `„${e.date.login}”`;
  if (e.date?.exemple?.length) return e.date.exemple.map((x) => `„${x}”`).join(', ');
  return '—';
}

function TabJurnal() {
  const [cauta, setCauta] = useState('');
  const [filtru, setFiltru] = useState('');
  const [detaliu, setDetaliu] = useState<IntrareJurnal | null>(null);
  const [esecuri, setEsecuri] = useState(false);
  // Căutarea pleacă la server după o scurtă pauză în tastare.
  useEffect(() => {
    const t = setTimeout(() => setFiltru(cauta.trim()), 300);
    return () => clearTimeout(t);
  }, [cauta]);
  const r = useDate(() => api.get<IntrareJurnal[]>('/api/jurnal', { cauta: filtru || undefined, esecuri_login: esecuri ? '1' : undefined }), [filtru, esecuri]);

  return (
    <>
      <p className="slab mic" style={{ maxWidth: 720 }}>
        Cine a schimbat ce, de unde și când: modificările din panou, autentificările și operațiunile tabletelor făcute în afara cozii de
        vânzări (terminal, inventariere, asociere). Jurnalul nu se poate modifica sau șterge și nu conține parole, PIN-uri sau coduri.
        Se arată ultimele 500 de intrări. Autentificările eșuate sunt ascunse implicit; încercările pe nume de cont inexistente se
        adună într-un singur rând pe minut pentru fiecare adresă.
      </p>
      <input type="search" placeholder="Caută (utilizator, tabletă, acțiune, adresă, valoare…)" value={cauta} onChange={(e) => setCauta(e.target.value)} />
      <label className="mic">
        <input type="checkbox" checked={esecuri} onChange={(e) => setEsecuri(e.target.checked)} /> Arată și autentificările eșuate
      </label>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol={filtru ? 'Nicio intrare nu se potrivește căutării.' : 'Jurnalul e gol.'}>
        {(lista) => (
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Când</th>
                  <th>Cine</th>
                  <th>Acțiunea</th>
                  <th>Adresa</th>
                  <th>Rezultat</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDataOra(e.la)}</td>
                    <td>{cine(e)}</td>
                    <td>
                      {titluActiune(e)}
                      {e.cale && ACTIUNI[e.actiune] && <div className="slab mic">{e.cale}</div>}
                    </td>
                    <td className="slab mic">{e.adresa ?? '—'}</td>
                    <td>
                      {e.stare_http == null ? '—' : e.stare_http < 400 ? <span className="insigna succes">reușit</span> : <span className="insigna pericol">refuzat ({e.stare_http})</span>}
                    </td>
                    <td className="num">
                      {e.date && (e.date.corp !== undefined || e.date.inainte !== undefined) && (
                        <button type="button" className="buton-link" onClick={() => setDetaliu(e)}>
                          Detalii
                        </button>
                      )}
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
          titlu={`${titluActiune(detaliu)} · ${formatDataOra(detaliu.la)}`}
          onInchide={() => setDetaliu(null)}
          lat
          subsol={
            <button type="button" className="buton" onClick={() => setDetaliu(null)}>
              Închide
            </button>
          }
        >
          <div className="randuri-form">
            <div className="slab mic">
              {cine(detaliu)} · {detaliu.adresa ?? 'adresă necunoscută'} · {detaliu.cale}
            </div>
            {detaliu.date?.inainte !== undefined && (
              <div>
                <strong>Înainte</strong>
                <pre className="payload">{JSON.stringify(detaliu.date.inainte, null, 2)}</pre>
              </div>
            )}
            {detaliu.date?.corp !== undefined && (
              <div>
                <strong>Trimis</strong>
                <pre className="payload">{JSON.stringify(detaliu.date.corp, null, 2)}</pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
