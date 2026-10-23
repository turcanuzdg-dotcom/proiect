import { useState, type FormEvent } from 'react';
import { rotunjeste } from '@cafenea/shared';
import { Modal } from '../../comun/Modal';
import { formatCantitate, formatData, formatDataOra, formatLei, formatNumar, ziLocala } from '../../comun/format';
import { uuid } from '../../comun/uuid';
import type { PropsPagina } from '../App';
import { api, mesajEroare } from '../api';
import { CapPagina, FiltruLocatie, Rand, Stare } from '../componente';
import { useAdmin, useDate } from '../context';
import type { Articol } from '../tipuri';

interface Receptie {
  id: number;
  locatie: string;
  furnizor: string;
  nr_factura: string;
  data: string;
  total: number;
  creata_de_nume: string | null;
  creata_la: string;
  nr_linii: number;
}

export function PaginaReceptii(_: PropsPagina) {
  const [locatie, setLocatie] = useState<number | null>(null);
  const [formular, setFormular] = useState(false);
  const [detaliu, setDetaliu] = useState<number | null>(null);
  const r = useDate(() => api.get<Receptie[]>('/api/receptii', { locatie_id: locatie }), [locatie], { locatie });

  return (
    <>
      <CapPagina
        titlu="Recepții"
        subtitlu="Facturile de achiziție de la furnizori. Intrarea crește stocul gestiunii și recalculează costul mediu al articolelor."
        actiuni={
          <button type="button" className="buton" onClick={() => setFormular(true)}>
            + Factură nouă
          </button>
        }
      />
      <Rand>
        <FiltruLocatie valoare={locatie} onChange={setLocatie} eticheta="Gestiunea" />
      </Rand>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Nicio recepție înregistrată.">
        {(lista) => (
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Data facturii</th>
                  <th>Furnizor</th>
                  <th>Nr. factură</th>
                  <th>Gestiunea</th>
                  <th className="num">Linii</th>
                  <th className="num">Total</th>
                  <th>Introdusă</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((x) => (
                  <tr key={x.id} className="clic" onClick={() => setDetaliu(x.id)}>
                    <td>{formatData(x.data)}</td>
                    <td>{x.furnizor}</td>
                    <td>{x.nr_factura}</td>
                    <td>{x.locatie}</td>
                    <td className="num">{x.nr_linii}</td>
                    <td className="num">{formatLei(x.total)}</td>
                    <td className="slab mic">
                      {formatDataOra(x.creata_la)} {x.creata_de_nume ? `· ${x.creata_de_nume}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stare>
      {formular && (
        <FormularReceptie
          onInchide={() => setFormular(false)}
          onSalvat={() => {
            setFormular(false);
            r.reincarca();
          }}
        />
      )}
      {detaliu != null && <DetaliuReceptie id={detaliu} onInchide={() => setDetaliu(null)} />}
    </>
  );
}

interface LinieForm {
  cheie: number;
  articol_id: string;
  cantitate: string;
  cost_unitar: string;
}

let contorLinii = 0;
const linieNoua = (): LinieForm => ({ cheie: ++contorLinii, articol_id: '', cantitate: '', cost_unitar: '' });
const numar = (s: string) => Number(s.replace(',', '.'));

function FormularReceptie({ onInchide, onSalvat }: { onInchide: () => void; onSalvat: () => void }) {
  const { locatii, arata } = useAdmin();
  const articole = useDate(() => api.get<Articol[]>('/api/articole'), []);
  const depozit = locatii.find((l) => l.tip === 'depozit' && l.activ);
  const [locatie, setLocatie] = useState<number | null>(depozit?.id ?? null);
  const [furnizor, setFurnizor] = useState('');
  const [nr, setNr] = useState('');
  const [data, setData] = useState(ziLocala());
  const [linii, setLinii] = useState<LinieForm[]>([linieNoua()]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  // Cheia de idempotență, generată la deschiderea formularului: dacă răspunsul se pierde și se apasă
  // din nou „Salvează”, serverul întoarce recepția deja creată, fără să dubleze stocul.
  const [cheie] = useState(uuid);

  const lista = (articole.date ?? []).filter((a) => a.activ);
  const art = (id: string) => lista.find((a) => String(a.id) === id);
  const total = rotunjeste(linii.reduce((s, l) => s + (numar(l.cantitate) || 0) * (numar(l.cost_unitar) || 0), 0));
  const schimba = (cheie: number, camp: keyof LinieForm, v: string) => setLinii((ls) => ls.map((l) => (l.cheie === cheie ? { ...l, [camp]: v } : l)));

  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    setEroare(null);
    const valide = linii.filter((l) => l.articol_id);
    if (!locatie) return setEroare('Alegeți gestiunea');
    if (!valide.length) return setEroare('Adăugați cel puțin o linie');
    for (const l of valide) {
      if (!(numar(l.cantitate) > 0)) return setEroare(`Cantitate lipsă pentru ${art(l.articol_id)?.nume}`);
      if (!(numar(l.cost_unitar) >= 0) || l.cost_unitar === '') return setEroare(`Preț lipsă pentru ${art(l.articol_id)?.nume}`);
    }
    setLucreaza(true);
    try {
      const r = await api.post<{ id: number; total: number; repetata: boolean }>('/api/receptii', {
        locatie_id: locatie,
        furnizor,
        nr_factura: nr,
        data,
        linii: valide.map((l) => ({ articol_id: Number(l.articol_id), cantitate: numar(l.cantitate), cost_unitar: numar(l.cost_unitar) })),
        cheie,
      });
      arata(r.repetata ? `Recepția fusese deja înregistrată la salvarea anterioară (${formatLei(r.total)})` : `Recepția a fost înregistrată (${formatLei(r.total)})`);
      onSalvat();
    } catch (err) {
      setEroare(mesajEroare(err));
    } finally {
      setLucreaza(false);
    }
  };

  return (
    <Modal
      titlu="Factură nouă de la furnizor"
      onInchide={onInchide}
      lat
      subsol={
        <>
          <span className="slab" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            Total factură: <strong>{formatLei(total)}</strong>
          </span>
          <button type="button" className="buton-secundar" onClick={onInchide}>
            Renunță
          </button>
          <button type="submit" form="formular-receptie" className="buton" disabled={lucreaza}>
            Înregistrează recepția
          </button>
        </>
      }
    >
      <form id="formular-receptie" className="randuri-form" onSubmit={salveaza}>
        {eroare && <div className="alerta pericol">{eroare}</div>}
        <div className="doua-coloane">
          <FiltruLocatie valoare={locatie} onChange={setLocatie} faraToate eticheta="Gestiunea care primește marfa" />
          <label className="camp">
            <span>Data facturii</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </label>
          <label className="camp">
            <span>Furnizor</span>
            <input value={furnizor} onChange={(e) => setFurnizor(e.target.value)} required placeholder="de ex. Lapte Moldova SRL" />
          </label>
          <label className="camp">
            <span>Nr. factură</span>
            <input value={nr} onChange={(e) => setNr(e.target.value)} required />
          </label>
        </div>
        <div className="editor-linii">
          <div className="linie-editor slab mic" aria-hidden="true">
            <span>Articol</span>
            <span>Cantitate</span>
            <span>Preț unitar (lei)</span>
            <span />
          </div>
          {linii.map((l) => {
            const a = art(l.articol_id);
            const valoare = (numar(l.cantitate) || 0) * (numar(l.cost_unitar) || 0);
            return (
              <div key={l.cheie} className="linie-editor">
                <select aria-label="Articol" value={l.articol_id} onChange={(e) => schimba(l.cheie, 'articol_id', e.target.value)}>
                  <option value="">Alegeți articolul…</option>
                  {lista.map((x) => (
                    <option key={x.id} value={x.id} disabled={linii.some((o) => o !== l && o.articol_id === String(x.id))}>
                      {x.nume} ({x.um})
                    </option>
                  ))}
                </select>
                <span className="cu-um">
                  <input aria-label="Cantitate" inputMode="decimal" value={l.cantitate} onChange={(e) => schimba(l.cheie, 'cantitate', e.target.value)} />
                  <span className="um">{a?.um ?? ''}</span>
                </span>
                <span className="cu-um">
                  <input aria-label="Preț unitar" inputMode="decimal" value={l.cost_unitar} onChange={(e) => schimba(l.cheie, 'cost_unitar', e.target.value)} />
                  <span className="um" title="Valoarea liniei">
                    {valoare ? formatLei(valoare) : a ? `lei/${a.um}` : ''}
                  </span>
                </span>
                <button type="button" className="buton-icon" aria-label="Șterge linia" onClick={() => setLinii((ls) => (ls.length > 1 ? ls.filter((x) => x.cheie !== l.cheie) : [linieNoua()]))}>
                  ×
                </button>
              </div>
            );
          })}
          <div>
            <button type="button" className="buton-secundar" onClick={() => setLinii((ls) => [...ls, linieNoua()])}>
              + Linie
            </button>
          </div>
          <p className="slab mic">Cantitățile se introduc în unitatea articolului (g, ml sau buc). De ex. 10 kg cafea = 10000 g, iar prețul = lei pe gram (0,42).</p>
        </div>
      </form>
    </Modal>
  );
}

function DetaliuReceptie({ id, onInchide }: { id: number; onInchide: () => void }) {
  const r = useDate(
    () =>
      api.get<Receptie & { linii: { articol_id: number; nume: string; um: string; cantitate: number; cost_unitar: number }[] }>(`/api/receptii/${id}`),
    [id],
  );
  return (
    <Modal titlu={r.date ? `Factura ${r.date.nr_factura} · ${r.date.furnizor}` : 'Recepție'} onInchide={onInchide} lat>
      <Stare {...r}>
        {(x) => (
          <div className="randuri-form">
            <p className="slab">
              {formatData(x.data)} · {x.locatie}
            </p>
            <div className="tabel-container">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Articol</th>
                    <th className="num">Cantitate</th>
                    <th className="num">Preț unitar</th>
                    <th className="num">Valoare</th>
                  </tr>
                </thead>
                <tbody>
                  {x.linii.map((l) => (
                    <tr key={l.articol_id}>
                      <td>{l.nume}</td>
                      <td className="num">{formatCantitate(l.cantitate, l.um)}</td>
                      <td className="num">
                        {formatNumar(l.cost_unitar)} lei/{l.um}
                      </td>
                      <td className="num">{formatLei(l.cantitate * l.cost_unitar)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total</td>
                    <td className="num">{formatLei(x.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Stare>
    </Modal>
  );
}
