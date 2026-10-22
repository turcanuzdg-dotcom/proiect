import { useState, type FormEvent } from 'react';
import { procent } from '@cafenea/shared';
import { Modal } from '../../comun/Modal';
import { formatCantitate, formatLei, formatNumar } from '../../comun/format';
import type { PropsPagina } from '../App';
import { api, mesajEroare } from '../api';
import { CapPagina, Rand, Stare, Taburi } from '../componente';
import { useAdmin, useDate } from '../context';
import { ETICHETE_TIP_ARTICOL, type Articol, type Categorie, type Modificator, type Produs } from '../tipuri';

type Tab = 'produse' | 'modificatori' | 'articole' | 'categorii';
const TABURI: { cheie: Tab; titlu: string }[] = [
  { cheie: 'produse', titlu: 'Produse și rețete' },
  { cheie: 'modificatori', titlu: 'Modificatori' },
  { cheie: 'articole', titlu: 'Articole (materie primă)' },
  { cheie: 'categorii', titlu: 'Categorii' },
];

const numar = (s: string) => Number(String(s).replace(',', '.'));

export function PaginaRetetar({ sub, navigheaza }: PropsPagina) {
  const tab = (TABURI.find((t) => t.cheie === sub[0])?.cheie ?? 'produse') as Tab;
  const articole = useDate(() => api.get<Articol[]>('/api/articole'), []);
  const categorii = useDate(() => api.get<Categorie[]>('/api/categorii'), []);
  const modificatori = useDate(() => api.get<Modificator[]>('/api/modificatori'), []);
  const comune = {
    articole: articole.date ?? [],
    categorii: categorii.date ?? [],
    modificatori: modificatori.date ?? [],
    reincarcaArticole: articole.reincarca,
    reincarcaCategorii: categorii.reincarca,
    reincarcaModificatori: modificatori.reincarca,
  };
  return (
    <>
      <CapPagina
        titlu="Rețetar"
        subtitlu="Ce se vinde și ce ingrediente scade fiecare produs din stoc. Modificările ajung pe tablete la următoarea sincronizare."
      />
      <Taburi taburi={TABURI} activ={tab} onChange={(k) => navigheaza(`retetar/${k}`)} />
      {tab === 'produse' && <TabProduse {...comune} />}
      {tab === 'modificatori' && <TabModificatori {...comune} />}
      {tab === 'articole' && <TabArticole {...comune} />}
      {tab === 'categorii' && <TabCategorii {...comune} />}
    </>
  );
}

interface Comune {
  articole: Articol[];
  categorii: Categorie[];
  modificatori: Modificator[];
  reincarcaArticole: () => void;
  reincarcaCategorii: () => void;
  reincarcaModificatori: () => void;
}

// ---------------- Produse ----------------

function TabProduse(c: Comune) {
  const r = useDate(() => api.get<Produs[]>('/api/produse'), []);
  const [editat, setEditat] = useState<Produs | 'nou' | null>(null);
  const [categorie, setCategorie] = useState('');
  const numeArt = (id: number) => c.articole.find((a) => a.id === id);
  return (
    <>
      <Rand>
        <label className="camp camp-filtru">
          <span>Categoria</span>
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            <option value="">Toate</option>
            {c.categorii.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nume}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="buton" style={{ marginLeft: 'auto' }} onClick={() => setEditat('nou')}>
          + Produs nou
        </button>
      </Rand>
      <Stare {...r} gol={(d) => d.length === 0} mesajGol="Niciun produs.">
        {(produse) => (
          <div className="tabel-container">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Produs</th>
                  <th>Rețeta (la o porție)</th>
                  <th className="num">Preț</th>
                  <th className="num">Cost rețetă</th>
                  <th className="num">Marjă</th>
                  <th className="num">Doze</th>
                </tr>
              </thead>
              <tbody>
                {produse
                  .filter((p) => !categorie || String(p.categorie_id) === categorie)
                  .map((p) => {
                    const marja = procent(p.pret - p.cost_reteta, p.pret);
                    return (
                      <tr key={p.id} className={`clic${p.activ ? '' : ' anulata'}`} onClick={() => setEditat(p)}>
                        <td>
                          <strong>{p.nume}</strong>
                          <div className="slab mic">
                            {c.categorii.find((x) => x.id === p.categorie_id)?.nume ?? 'Fără categorie'}
                            {!p.activ && ' · inactiv'}
                            {p.modificatori.length > 0 && ` · ${p.modificatori.length} modificatori`}
                          </div>
                        </td>
                        <td className="mic">
                          {p.reteta
                            .map((l) => {
                              const a = numeArt(l.articol_id);
                              return a ? `${a.nume} ${formatCantitate(l.cantitate, a.um)}` : `#${l.articol_id}`;
                            })
                            .join(' · ')}
                        </td>
                        <td className="num">{formatLei(p.pret)}</td>
                        <td className="num">{formatLei(p.cost_reteta)}</td>
                        <td className="num">{marja == null ? '—' : `${formatNumar(marja)}%`}</td>
                        <td className="num">{formatNumar(p.doze_cafea)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Stare>
      {editat && (
        <FormularProdus
          produs={editat === 'nou' ? null : editat}
          {...c}
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

interface LinieForm {
  cheie: number;
  articol_id: string;
  cantitate: string;
}
let contor = 0;
const linie = (articol_id = '', cantitate = ''): LinieForm => ({ cheie: ++contor, articol_id, cantitate });

function EditorLinii(props: { linii: LinieForm[]; setLinii: (f: (l: LinieForm[]) => LinieForm[]) => void; articole: Articol[]; semn?: boolean; eticheta: string }) {
  const schimba = (cheie: number, camp: 'articol_id' | 'cantitate', v: string) => props.setLinii((ls) => ls.map((l) => (l.cheie === cheie ? { ...l, [camp]: v } : l)));
  return (
    <div className="editor-linii">
      <span className="slab mic" style={{ fontWeight: 600 }}>
        {props.eticheta}
      </span>
      {props.linii.map((l) => {
        const a = props.articole.find((x) => String(x.id) === l.articol_id);
        return (
          <div key={l.cheie} className="linie-editor trei">
            <select aria-label="Ingredient" value={l.articol_id} onChange={(e) => schimba(l.cheie, 'articol_id', e.target.value)}>
              <option value="">Alegeți…</option>
              {props.articole
                .filter((x) => x.activ || String(x.id) === l.articol_id)
                .map((x) => (
                  <option key={x.id} value={x.id} disabled={props.linii.some((o) => o !== l && o.articol_id === String(x.id))}>
                    {x.nume} ({x.um})
                  </option>
                ))}
            </select>
            <span className="cu-um">
              <input aria-label="Cantitate" inputMode="decimal" placeholder={props.semn ? 'de ex. 9 sau -1' : ''} value={l.cantitate} onChange={(e) => schimba(l.cheie, 'cantitate', e.target.value)} />
              <span className="um">{a?.um ?? ''}</span>
            </span>
            <button type="button" className="buton-icon" aria-label="Șterge" onClick={() => props.setLinii((ls) => ls.filter((x) => x.cheie !== l.cheie))}>
              ×
            </button>
          </div>
        );
      })}
      <div>
        <button type="button" className="buton-secundar" onClick={() => props.setLinii((ls) => [...ls, linie()])}>
          + Ingredient
        </button>
      </div>
    </div>
  );
}

function FormularProdus(props: Comune & { produs: Produs | null; onInchide: () => void; onSalvat: () => void }) {
  const { arata } = useAdmin();
  const p = props.produs;
  const [nume, setNume] = useState(p?.nume ?? '');
  const [categorie, setCategorie] = useState(p?.categorie_id ? String(p.categorie_id) : '');
  const [pret, setPret] = useState(p ? String(p.pret) : '');
  const [doze, setDoze] = useState(p ? String(p.doze_cafea) : '0');
  const [ordine, setOrdine] = useState(p ? String(p.ordine) : '0');
  const [activ, setActiv] = useState(p?.activ ?? true);
  const [cotaTva, setCotaTva] = useState(p?.cota_tva ?? '');
  const [linii, setLinii] = useState<LinieForm[]>(p ? p.reteta.map((l) => linie(String(l.articol_id), String(l.cantitate))) : [linie()]);
  const [mods, setMods] = useState<number[]>(p?.modificatori ?? []);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);

  const cost = linii.reduce((s, l) => s + (numar(l.cantitate) || 0) * (props.articole.find((a) => String(a.id) === l.articol_id)?.cost_mediu ?? 0), 0);

  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    setEroare(null);
    const reteta = linii.filter((l) => l.articol_id).map((l) => ({ articol_id: Number(l.articol_id), cantitate: numar(l.cantitate) }));
    if (!reteta.length) return setEroare('Rețeta are nevoie de cel puțin un ingredient (pentru marfă la bucată: articolul însuși, 1 buc).');
    if (reteta.some((l) => !(l.cantitate > 0))) return setEroare('Fiecare ingredient are nevoie de o cantitate pozitivă');
    if (!(numar(pret) >= 0) || pret === '') return setEroare('Prețul lipsește');
    setLucreaza(true);
    try {
      const corp = {
        nume: nume.trim(),
        categorie_id: categorie ? Number(categorie) : null,
        pret: numar(pret),
        doze_cafea: numar(doze) || 0,
        ordine: Math.round(numar(ordine) || 0),
        activ,
        cota_tva: cotaTva.trim().toUpperCase() || null,
        reteta,
        modificatori: mods,
      };
      if (p) await api.put(`/api/produse/${p.id}`, corp);
      else await api.post('/api/produse', corp);
      arata(`Produsul „${corp.nume}” a fost salvat`);
      props.onSalvat();
    } catch (err) {
      setEroare(mesajEroare(err));
    } finally {
      setLucreaza(false);
    }
  };

  return (
    <Modal
      titlu={p ? `Produs: ${p.nume}` : 'Produs nou'}
      onInchide={props.onInchide}
      lat
      subsol={
        <>
          <span className="slab" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            Cost rețetă: <strong>{formatLei(cost)}</strong>
            {numar(pret) > 0 && <> · marjă {formatNumar(procent(numar(pret) - cost, numar(pret)) ?? 0)}%</>}
          </span>
          <button type="button" className="buton-secundar" onClick={props.onInchide}>
            Renunță
          </button>
          <button type="submit" form="formular-produs" className="buton" disabled={lucreaza}>
            Salvează
          </button>
        </>
      }
    >
      <form id="formular-produs" className="randuri-form" onSubmit={salveaza}>
        {eroare && <div className="alerta pericol">{eroare}</div>}
        <div className="doua-coloane">
          <label className="camp">
            <span>Nume</span>
            <input value={nume} onChange={(e) => setNume(e.target.value)} required />
          </label>
          <label className="camp">
            <span>Categoria</span>
            <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              <option value="">Fără categorie</option>
              {props.categorii.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nume}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="trei-coloane">
          <label className="camp">
            <span>Preț de vânzare (lei)</span>
            <input inputMode="decimal" value={pret} onChange={(e) => setPret(e.target.value)} required />
          </label>
          <label className="camp">
            <span>Doze de cafea (contorul râșniței)</span>
            <input inputMode="decimal" value={doze} onChange={(e) => setDoze(e.target.value)} />
          </label>
          <label className="camp">
            <span>Ordinea pe ecranul de vânzare</span>
            <input inputMode="numeric" value={ordine} onChange={(e) => setOrdine(e.target.value)} />
          </label>
        </div>
        <label className="camp" style={{ maxWidth: 320 }}>
          <span>Cota TVA pe bonul fiscal (litera de pe casa fiscală; gol = cea implicită)</span>
          <input value={cotaTva} onChange={(e) => setCotaTva(e.target.value.toUpperCase().slice(0, 1))} placeholder="de ex. A" maxLength={1} />
        </label>
        <label className="bifa">
          <input type="checkbox" checked={activ} onChange={(e) => setActiv(e.target.checked)} /> Activ (apare pe tabletă)
        </label>
        <EditorLinii linii={linii} setLinii={setLinii} articole={props.articole} eticheta="Rețeta: ce se scade din stoc la o porție" />
        <div className="editor-linii">
          <span className="slab mic" style={{ fontWeight: 600 }}>
            Modificatori permiși (opțiuni pe care barista le poate bifa)
          </span>
          {props.modificatori.length === 0 ? (
            <span className="slab mic">Nu există modificatori definiți.</span>
          ) : (
            <div className="grila-bife">
              {props.modificatori.map((m) => (
                <label key={m.id} className="bifa">
                  <input type="checkbox" checked={mods.includes(m.id)} onChange={(e) => setMods((x) => (e.target.checked ? [...x, m.id] : x.filter((y) => y !== m.id)))} />
                  {m.nume} {m.pret ? <span className="slab mic">+{formatLei(m.pret)}</span> : null}
                  {!m.activ && <span className="insigna">inactiv</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Modificatori ----------------

function TabModificatori(c: Comune) {
  const [editat, setEditat] = useState<Modificator | 'nou' | null>(null);
  const art = (id: number | null) => c.articole.find((a) => a.id === id);
  return (
    <>
      <Rand>
        <p className="slab mic" style={{ maxWidth: 640 }}>
          Un modificator poate înlocui un ingredient în aceeași cantitate (laptele cu lapte de ovăz) și/sau poate adăuga ori scădea ingrediente (extra shot +9 g cafea, fără zahăr −1 plic).
        </p>
        <button type="button" className="buton" style={{ marginLeft: 'auto' }} onClick={() => setEditat('nou')}>
          + Modificator nou
        </button>
      </Rand>
      {c.modificatori.length === 0 ? (
        <div className="gol card">Niciun modificator.</div>
      ) : (
        <div className="tabel-container">
          <table className="tabel">
            <thead>
              <tr>
                <th>Modificator</th>
                <th>Efect asupra stocului</th>
                <th className="num">Preț</th>
                <th className="num">Doze</th>
              </tr>
            </thead>
            <tbody>
              {c.modificatori.map((m) => (
                <tr key={m.id} className={`clic${m.activ ? '' : ' anulata'}`} onClick={() => setEditat(m)}>
                  <td>
                    <strong>{m.nume}</strong>
                    {!m.activ && <span className="slab mic"> · inactiv</span>}
                  </td>
                  <td className="mic">
                    {m.inlocuieste_articol_id != null && (
                      <div>
                        Înlocuiește {art(m.inlocuieste_articol_id)?.nume ?? '?'} cu {art(m.inlocuitor_articol_id)?.nume ?? '?'}
                      </div>
                    )}
                    {m.adauga.map((l) => {
                      const a = art(l.articol_id);
                      return (
                        <div key={l.articol_id}>
                          {l.cantitate > 0 ? 'Adaugă' : 'Scade'} {a ? formatCantitate(Math.abs(l.cantitate), a.um) : Math.abs(l.cantitate)} {a?.nume ?? `#${l.articol_id}`}
                        </div>
                      );
                    })}
                  </td>
                  <td className="num">{m.pret ? formatLei(m.pret) : 'gratuit'}</td>
                  <td className="num">{m.doze_cafea ? `+${formatNumar(m.doze_cafea)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editat && (
        <FormularModificator
          mod={editat === 'nou' ? null : editat}
          articole={c.articole}
          onInchide={() => setEditat(null)}
          onSalvat={() => {
            setEditat(null);
            c.reincarcaModificatori();
          }}
        />
      )}
    </>
  );
}

function FormularModificator(props: { mod: Modificator | null; articole: Articol[]; onInchide: () => void; onSalvat: () => void }) {
  const { arata } = useAdmin();
  const m = props.mod;
  const [nume, setNume] = useState(m?.nume ?? '');
  const [pret, setPret] = useState(m ? String(m.pret) : '0');
  const [doze, setDoze] = useState(m ? String(m.doze_cafea) : '0');
  const [activ, setActiv] = useState(m?.activ ?? true);
  const [inlocuieste, setInlocuieste] = useState(m?.inlocuieste_articol_id ? String(m.inlocuieste_articol_id) : '');
  const [inlocuitor, setInlocuitor] = useState(m?.inlocuitor_articol_id ? String(m.inlocuitor_articol_id) : '');
  const [linii, setLinii] = useState<LinieForm[]>(m ? m.adauga.map((l) => linie(String(l.articol_id), String(l.cantitate))) : []);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);

  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    setEroare(null);
    if (!!inlocuieste !== !!inlocuitor) return setEroare('Pentru înlocuire alegeți ambele articole (ce se înlocuiește și cu ce)');
    const adauga = linii.filter((l) => l.articol_id).map((l) => ({ articol_id: Number(l.articol_id), cantitate: numar(l.cantitate) }));
    if (adauga.some((l) => !Number.isFinite(l.cantitate) || l.cantitate === 0)) return setEroare('Cantitățile trebuie să fie diferite de zero (negative pentru a scădea)');
    setLucreaza(true);
    try {
      const corp = {
        nume: nume.trim(),
        pret: numar(pret) || 0,
        doze_cafea: numar(doze) || 0,
        inlocuieste_articol_id: inlocuieste ? Number(inlocuieste) : null,
        inlocuitor_articol_id: inlocuitor ? Number(inlocuitor) : null,
        adauga,
        activ,
      };
      if (m) await api.put(`/api/modificatori/${m.id}`, corp);
      else await api.post('/api/modificatori', corp);
      arata(`Modificatorul „${corp.nume}” a fost salvat`);
      props.onSalvat();
    } catch (err) {
      setEroare(mesajEroare(err));
    } finally {
      setLucreaza(false);
    }
  };

  const optiuni = props.articole.filter((a) => a.activ || [inlocuieste, inlocuitor].includes(String(a.id)));
  return (
    <Modal
      titlu={m ? `Modificator: ${m.nume}` : 'Modificator nou'}
      onInchide={props.onInchide}
      lat
      subsol={
        <>
          <button type="button" className="buton-secundar" onClick={props.onInchide}>
            Renunță
          </button>
          <button type="submit" form="formular-modificator" className="buton" disabled={lucreaza}>
            Salvează
          </button>
        </>
      }
    >
      <form id="formular-modificator" className="randuri-form" onSubmit={salveaza}>
        {eroare && <div className="alerta pericol">{eroare}</div>}
        <div className="trei-coloane">
          <label className="camp">
            <span>Nume</span>
            <input value={nume} onChange={(e) => setNume(e.target.value)} required />
          </label>
          <label className="camp">
            <span>Preț suplimentar (lei)</span>
            <input inputMode="decimal" value={pret} onChange={(e) => setPret(e.target.value)} />
          </label>
          <label className="camp">
            <span>Doze de cafea în plus</span>
            <input inputMode="decimal" value={doze} onChange={(e) => setDoze(e.target.value)} />
          </label>
        </div>
        <label className="bifa">
          <input type="checkbox" checked={activ} onChange={(e) => setActiv(e.target.checked)} /> Activ
        </label>
        <div className="doua-coloane">
          <label className="camp">
            <span>Înlocuiește ingredientul (opțional)</span>
            <select value={inlocuieste} onChange={(e) => setInlocuieste(e.target.value)}>
              <option value="">— nimic —</option>
              {optiuni.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nume}
                </option>
              ))}
            </select>
          </label>
          <label className="camp">
            <span>…cu ingredientul</span>
            <select value={inlocuitor} onChange={(e) => setInlocuitor(e.target.value)}>
              <option value="">— nimic —</option>
              {optiuni.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nume}
                </option>
              ))}
            </select>
          </label>
        </div>
        <EditorLinii linii={linii} setLinii={setLinii} articole={props.articole} semn eticheta="Adaugă (+) sau scade (−) ingrediente la fiecare porție" />
      </form>
    </Modal>
  );
}

// ---------------- Articole ----------------

function TabArticole(c: Comune) {
  const [editat, setEditat] = useState<Articol | 'nou' | null>(null);
  return (
    <>
      <Rand>
        <p className="slab mic" style={{ maxWidth: 640 }}>
          Unitatea de măsură e cea în care se scrie rețeta: grame, mililitri sau bucăți. Costul mediu se calculează din recepții.
        </p>
        <button type="button" className="buton" style={{ marginLeft: 'auto' }} onClick={() => setEditat('nou')}>
          + Articol nou
        </button>
      </Rand>
      <div className="tabel-container">
        <table className="tabel">
          <thead>
            <tr>
              <th>Articol</th>
              <th>Tip</th>
              <th>UM</th>
              <th className="num">Cost mediu</th>
              <th className="num">Prag minim (alertă)</th>
            </tr>
          </thead>
          <tbody>
            {c.articole.map((a) => (
              <tr key={a.id} className={`clic${a.activ ? '' : ' anulata'}`} onClick={() => setEditat(a)}>
                <td>
                  {a.nume}
                  {!a.activ && <span className="slab mic"> · inactiv</span>}
                </td>
                <td>{ETICHETE_TIP_ARTICOL[a.tip]}</td>
                <td>{a.um}</td>
                <td className="num">
                  {formatNumar(a.cost_mediu)} lei/{a.um}
                </td>
                <td className="num">{a.prag_minim ? formatCantitate(a.prag_minim, a.um) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editat && (
        <FormularArticol
          articol={editat === 'nou' ? null : editat}
          onInchide={() => setEditat(null)}
          onSalvat={() => {
            setEditat(null);
            c.reincarcaArticole();
          }}
        />
      )}
    </>
  );
}

function FormularArticol(props: { articol: Articol | null; onInchide: () => void; onSalvat: () => void }) {
  const { arata } = useAdmin();
  const a = props.articol;
  const [nume, setNume] = useState(a?.nume ?? '');
  const [um, setUm] = useState<Articol['um']>(a?.um ?? 'g');
  const [tip, setTip] = useState<Articol['tip']>(a?.tip ?? 'materie_prima');
  const [prag, setPrag] = useState(a ? String(a.prag_minim) : '0');
  const [activ, setActiv] = useState(a?.activ ?? true);
  const [eroare, setEroare] = useState<string | null>(null);

  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const corp = { nume: nume.trim(), um, tip, prag_minim: numar(prag) || 0, activ };
      if (a) await api.put(`/api/articole/${a.id}`, corp);
      else await api.post('/api/articole', corp);
      arata(`Articolul „${corp.nume}” a fost salvat`);
      props.onSalvat();
    } catch (err) {
      setEroare(mesajEroare(err));
    }
  };

  return (
    <Modal
      titlu={a ? `Articol: ${a.nume}` : 'Articol nou'}
      onInchide={props.onInchide}
      subsol={
        <>
          <button type="button" className="buton-secundar" onClick={props.onInchide}>
            Renunță
          </button>
          <button type="submit" form="formular-articol" className="buton">
            Salvează
          </button>
        </>
      }
    >
      <form id="formular-articol" className="randuri-form" onSubmit={salveaza}>
        {eroare && <div className="alerta pericol">{eroare}</div>}
        <label className="camp">
          <span>Nume</span>
          <input value={nume} onChange={(e) => setNume(e.target.value)} required />
        </label>
        <div className="doua-coloane">
          <label className="camp">
            <span>Unitatea de măsură</span>
            <select value={um} onChange={(e) => setUm(e.target.value as Articol['um'])}>
              <option value="g">grame (g)</option>
              <option value="ml">mililitri (ml)</option>
              <option value="buc">bucăți (buc)</option>
            </select>
          </label>
          <label className="camp">
            <span>Tip</span>
            <select value={tip} onChange={(e) => setTip(e.target.value as Articol['tip'])}>
              {Object.entries(ETICHETE_TIP_ARTICOL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="camp">
          <span>Prag minim în cafenea ({um}) — sub el apare alertă pe panou</span>
          <input inputMode="decimal" value={prag} onChange={(e) => setPrag(e.target.value)} />
        </label>
        <label className="bifa">
          <input type="checkbox" checked={activ} onChange={(e) => setActiv(e.target.checked)} /> Activ
        </label>
        {a && a.um !== um && <div className="alerta avertisment">Schimbarea unității nu convertește stocul și rețetele existente.</div>}
      </form>
    </Modal>
  );
}

// ---------------- Categorii ----------------

function TabCategorii(c: Comune) {
  const { arata } = useAdmin();
  const [nume, setNume] = useState('');
  const [editari, setEditari] = useState<Record<number, { nume: string; ordine: string }>>({});

  const adauga = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/categorii', { nume: nume.trim(), ordine: c.categorii.length });
      setNume('');
      c.reincarcaCategorii();
      arata('Categoria a fost adăugată');
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };
  const salveaza = async (id: number) => {
    const x = editari[id];
    try {
      await api.put(`/api/categorii/${id}`, { nume: x.nume.trim(), ordine: Math.round(numar(x.ordine) || 0) });
      setEditari((v) => {
        const { [id]: _, ...rest } = v;
        return rest;
      });
      c.reincarcaCategorii();
      arata('Categoria a fost salvată');
    } catch (err) {
      arata(mesajEroare(err), 'pericol');
    }
  };

  return (
    <>
      <form className="bara-filtre" onSubmit={adauga}>
        <label className="camp camp-filtru">
          <span>Categorie nouă</span>
          <input value={nume} onChange={(e) => setNume(e.target.value)} required placeholder="de ex. Deserturi" />
        </label>
        <button type="submit" className="buton">
          Adaugă
        </button>
      </form>
      <div className="tabel-container">
        <table className="tabel">
          <thead>
            <tr>
              <th>Categoria</th>
              <th className="num">Ordine pe tabletă</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.categorii.map((x) => {
              const e = editari[x.id];
              return (
                <tr key={x.id}>
                  <td>{e ? <input value={e.nume} onChange={(ev) => setEditari((v) => ({ ...v, [x.id]: { ...e, nume: ev.target.value } }))} aria-label="Nume categorie" /> : x.nume}</td>
                  <td className="num">
                    {e ? <input className="input-mic" value={e.ordine} onChange={(ev) => setEditari((v) => ({ ...v, [x.id]: { ...e, ordine: ev.target.value } }))} aria-label="Ordine" /> : x.ordine}
                  </td>
                  <td className="num">
                    {e ? (
                      <>
                        <button type="button" className="buton-link" onClick={() => salveaza(x.id)}>
                          Salvează
                        </button>
                        <button
                          type="button"
                          className="buton-link"
                          onClick={() =>
                            setEditari((v) => {
                              const { [x.id]: _, ...rest } = v;
                              return rest;
                            })
                          }
                        >
                          Renunță
                        </button>
                      </>
                    ) : (
                      <button type="button" className="buton-link" onClick={() => setEditari((v) => ({ ...v, [x.id]: { nume: x.nume, ordine: String(x.ordine) } }))}>
                        Modifică
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
