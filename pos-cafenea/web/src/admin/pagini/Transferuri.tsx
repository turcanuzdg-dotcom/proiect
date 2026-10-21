import { useState, type FormEvent } from 'react';
import { Modal } from '../../comun/Modal';
import { formatCantitate, formatDataOra } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api, mesajEroare } from '../api';
import { CapPagina, FiltruLocatie, Rand, Stare } from '../componente';
import { useAdmin, useDate } from '../context';

interface Transfer {
  id: number;
  din_locatie: string;
  in_locatie: string;
  observatii: string | null;
  creat_de_nume: string | null;
  creat_la: string;
  linii: { articol_id: number; nume: string; um: string; cantitate: number }[];
}

export function PaginaTransferuri(_: PropsPagina) {
  const [locatie, setLocatie] = useState<number | null>(null);
  const [formular, setFormular] = useState(false);
  const r = useDate(() => api.get<Transfer[]>('/api/transferuri', { locatie_id: locatie }), [locatie]);

  return (
    <>
      <CapPagina
        titlu="Transferuri"
        subtitlu="Marfa trimisă din Depozitul Central către cafenele (sau între ele). Ambele gestiuni se actualizează în aceeași operațiune."
        actiuni={
          <button type="button" className="buton" onClick={() => setFormular(true)}>
            + Transfer nou
          </button>
        }
      />
      <Rand>
        <FiltruLocatie valoare={locatie} onChange={setLocatie} eticheta="Gestiunea" />
      </Rand>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Niciun transfer.">
        {(lista) => (
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Din</th>
                  <th>În</th>
                  <th>Articole</th>
                  <th>Observații</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {formatDataOra(t.creat_la)}
                      <div className="slab mic">#{t.id}{t.creat_de_nume ? ` · ${t.creat_de_nume}` : ''}</div>
                    </td>
                    <td>{t.din_locatie}</td>
                    <td>{t.in_locatie}</td>
                    <td className="mic">{t.linii.map((l) => `${l.nume} ${formatCantitate(l.cantitate, l.um)}`).join(' · ')}</td>
                    <td className="slab">{t.observatii ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stare>
      {formular && (
        <FormularTransfer
          onInchide={() => setFormular(false)}
          onSalvat={() => {
            setFormular(false);
            r.reincarca();
          }}
        />
      )}
    </>
  );
}

interface LinieForm {
  cheie: number;
  articol_id: string;
  cantitate: string;
}
let contor = 0;
const linieNoua = (): LinieForm => ({ cheie: ++contor, articol_id: '', cantitate: '' });
const numar = (s: string) => Number(s.replace(',', '.'));

function FormularTransfer({ onInchide, onSalvat }: { onInchide: () => void; onSalvat: () => void }) {
  const { locatii, arata } = useAdmin();
  const depozit = locatii.find((l) => l.tip === 'depozit' && l.activ);
  const [din, setDin] = useState<number | null>(depozit?.id ?? null);
  const [inLoc, setInLoc] = useState<number | null>(locatii.find((l) => l.tip === 'punct' && l.activ)?.id ?? null);
  const [observatii, setObservatii] = useState('');
  const [linii, setLinii] = useState<LinieForm[]>([linieNoua()]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [avertismente, setAvertismente] = useState<string[] | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const stoc = useDate(
    () => (din ? api.get<{ articol_id: number; nume: string; um: string; stoc: number }[]>('/api/stoc', { locatie_id: din }) : Promise.resolve([])),
    [din],
  );
  const articole = stoc.date ?? [];
  const art = (id: string) => articole.find((a) => String(a.articol_id) === id);
  const schimba = (cheie: number, camp: keyof LinieForm, v: string) => setLinii((ls) => ls.map((l) => (l.cheie === cheie ? { ...l, [camp]: v } : l)));

  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    setEroare(null);
    const valide = linii.filter((l) => l.articol_id);
    if (!din || !inLoc) return setEroare('Alegeți sursa și destinația');
    if (din === inLoc) return setEroare('Sursa și destinația trebuie să fie diferite');
    if (!valide.length) return setEroare('Adăugați cel puțin o linie');
    if (valide.some((l) => !(numar(l.cantitate) > 0))) return setEroare('Fiecare linie are nevoie de o cantitate pozitivă');
    setLucreaza(true);
    try {
      const r = await api.post<{ id: number; avertismente: string[] }>('/api/transferuri', {
        din_locatie_id: din,
        in_locatie_id: inLoc,
        observatii: observatii || null,
        linii: valide.map((l) => ({ articol_id: Number(l.articol_id), cantitate: numar(l.cantitate) })),
      });
      if (r.avertismente.length) {
        setAvertismente(r.avertismente);
      } else {
        arata('Transferul a fost înregistrat');
        onSalvat();
      }
    } catch (err) {
      setEroare(mesajEroare(err));
    } finally {
      setLucreaza(false);
    }
  };

  if (avertismente) {
    return (
      <Modal
        titlu="Transfer înregistrat, cu avertismente"
        onInchide={onSalvat}
        subsol={
          <button type="button" className="buton" onClick={onSalvat}>
            Am înțeles
          </button>
        }
      >
        <div className="randuri-form">
          <div className="alerta avertisment">Sursa nu avea destul stoc scriptic pentru unele articole; stocul ei a devenit negativ. Verificați dacă lipsește o recepție.</div>
          <ul>
            {avertismente.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      titlu="Transfer nou"
      onInchide={onInchide}
      lat
      subsol={
        <>
          <button type="button" className="buton-secundar" onClick={onInchide}>
            Renunță
          </button>
          <button type="submit" form="formular-transfer" className="buton" disabled={lucreaza}>
            Înregistrează transferul
          </button>
        </>
      }
    >
      <form id="formular-transfer" className="randuri-form" onSubmit={salveaza}>
        {eroare && <div className="alerta pericol">{eroare}</div>}
        <div className="doua-coloane">
          <FiltruLocatie valoare={din} onChange={setDin} faraToate eticheta="Din gestiunea" />
          <FiltruLocatie valoare={inLoc} onChange={setInLoc} faraToate eticheta="În gestiunea" />
        </div>
        <div className="editor-linii">
          <div className="linie-editor trei slab mic" aria-hidden="true">
            <span>Articol (stoc disponibil în sursă)</span>
            <span>Cantitate</span>
            <span />
          </div>
          {linii.map((l) => {
            const a = art(l.articol_id);
            const prea = a && numar(l.cantitate) > a.stoc;
            return (
              <div key={l.cheie} className="linie-editor trei">
                <select aria-label="Articol" value={l.articol_id} onChange={(e) => schimba(l.cheie, 'articol_id', e.target.value)}>
                  <option value="">Alegeți articolul…</option>
                  {articole.map((x) => (
                    <option key={x.articol_id} value={x.articol_id} disabled={linii.some((o) => o !== l && o.articol_id === String(x.articol_id))}>
                      {x.nume} — {formatCantitate(x.stoc, x.um)}
                    </option>
                  ))}
                </select>
                <span className="cu-um">
                  <input aria-label="Cantitate" inputMode="decimal" value={l.cantitate} onChange={(e) => schimba(l.cheie, 'cantitate', e.target.value)} style={prea ? { borderColor: 'var(--avertisment)' } : undefined} />
                  <span className="um">{a?.um ?? ''}</span>
                </span>
                <button type="button" className="buton-icon" aria-label="Șterge linia" onClick={() => setLinii((ls) => (ls.length > 1 ? ls.filter((x) => x.cheie !== l.cheie) : [linieNoua()]))}>
                  ×
                </button>
                {prea && <span className="slab mic" style={{ gridColumn: '1 / -1', color: 'var(--avertisment)' }}>Mai mult decât stocul scriptic din sursă ({formatCantitate(a.stoc, a.um)}).</span>}
              </div>
            );
          })}
          <div>
            <button type="button" className="buton-secundar" onClick={() => setLinii((ls) => [...ls, linieNoua()])}>
              + Linie
            </button>
          </div>
        </div>
        <label className="camp">
          <span>Observații</span>
          <input value={observatii} onChange={(e) => setObservatii(e.target.value)} placeholder="opțional" />
        </label>
      </form>
    </Modal>
  );
}
