import { useMemo, useState } from 'react';
import {
  formatLei,
  totalComanda,
  totalLinie,
  type LinieComanda,
  type MetodaPlata,
  type ModificatorCatalog,
  type MotivCasare,
  type ProdusCatalog,
} from '@cafenea/shared';
import { formatOra } from '../comun/format';
import { uuid } from '../comun/uuid';
import { useAplicatie } from './context';
import { AlegeModificatori, Casare, InchidereTura, Istoric, PlataCard, PlataMarunta, PlataNumerar, Setari } from './dialoguri';
import { Inventar } from './Inventar';
import * as stocare from './stocare';

export interface LinieCos {
  cheie: string;
  produs: ProdusCatalog;
  modificatori: ModificatorCatalog[];
  cantitate: number;
}

const cheieLinie = (p: ProdusCatalog, mods: ModificatorCatalog[]) => `${p.id}:${mods.map((m) => m.id).sort((a, b) => a - b).join(',')}`;

export const inLinieComanda = (l: LinieCos): LinieComanda => ({
  produs_id: l.produs.id,
  cantitate: l.cantitate,
  pret_unitar: l.produs.pret,
  modificatori: l.modificatori.map((m) => ({ id: m.id, pret: m.pret })),
});

type Dialog =
  | null
  | { tip: 'modificatori'; produs: ProdusCatalog }
  | { tip: 'numerar' | 'card' | 'casare' | 'istoric' | 'plata_marunta' | 'inchidere' | 'inventar' | 'setari' | 'meniu' };

export function Vanzare() {
  const app = useAplicatie();
  const { catalog } = app;
  const [categorie, setCategorie] = useState<number | null>(catalog.categorii[0]?.id ?? null);
  const [cos, setCos] = useState<LinieCos[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [cauta, setCauta] = useState('');

  const modificatori = useMemo(() => new Map(catalog.modificatori.map((m) => [m.id, m])), [catalog]);
  const produse = useMemo(() => {
    const q = cauta.trim().toLocaleLowerCase('ro');
    if (q) return catalog.produse.filter((p) => p.nume.toLocaleLowerCase('ro').includes(q));
    return catalog.produse.filter((p) => categorie == null || p.categorie_id === categorie);
  }, [catalog, categorie, cauta]);

  const linii = cos.map(inLinieComanda);
  const total = totalComanda(linii);
  const nrProduse = cos.reduce((s, l) => s + l.cantitate, 0);

  const adauga = (produs: ProdusCatalog, mods: ModificatorCatalog[], cantitate = 1) => {
    const cheie = cheieLinie(produs, mods);
    setCos((c) => {
      const exista = c.find((l) => l.cheie === cheie);
      if (exista) return c.map((l) => (l.cheie === cheie ? { ...l, cantitate: l.cantitate + cantitate } : l));
      return [...c, { cheie, produs, modificatori: mods, cantitate }];
    });
  };

  const apasaProdus = (p: ProdusCatalog) => {
    const mods = p.modificatori.filter((id) => modificatori.has(id));
    if (mods.length) setDialog({ tip: 'modificatori', produs: p });
    else adauga(p, []);
  };

  const schimbaCantitate = (cheie: string, delta: number) =>
    setCos((c) => c.flatMap((l) => (l.cheie !== cheie ? [l] : l.cantitate + delta <= 0 ? [] : [{ ...l, cantitate: l.cantitate + delta }])));

  /** Salvează comanda local (cu coada offline) și tipărește bonul. */
  const finalizeaza = async (metoda: MetodaPlata, extra: { primit?: number; card_autorizare?: string; motiv_casare?: MotivCasare; nota?: string } = {}) => {
    const nr = await stocare.urmatorulNumar();
    const comandaId = uuid();
    const ev = app.eveniment('comanda', {
      comanda_id: comandaId,
      tura_id: app.tura.id,
      utilizator_id: app.barista.id,
      nr,
      metoda,
      motiv_casare: extra.motiv_casare ?? null,
      nota: extra.nota ?? null,
      linii,
      total,
      primit: extra.primit ?? null,
      card_autorizare: extra.card_autorizare ?? null,
    });
    const locala: stocare.ComandaLocala = {
      comanda_id: comandaId,
      tura_id: app.tura.id,
      nr,
      la: ev.la,
      metoda,
      motiv_casare: extra.motiv_casare ?? null,
      linii: cos.map((l) => ({
        produs_id: l.produs.id,
        nume: l.produs.nume,
        cantitate: l.cantitate,
        pret_unitar: l.produs.pret,
        modificatori: l.modificatori.map((m) => ({ id: m.id, nume: m.nume, pret: m.pret })),
        total: totalLinie(inLinieComanda(l)),
      })),
      total,
      primit: extra.primit ?? null,
      rest: extra.primit != null ? Math.round((extra.primit - total) * 100) / 100 : null,
      card_autorizare: extra.card_autorizare ?? null,
      barista: app.barista,
      stare: 'finalizata',
      bon_tiparit: false,
    };
    await app.inregistreaza(ev, locala);
    setCos([]);
    setDialog(null);

    if (metoda !== 'casare') {
      const r = await app.echipamente
        .tiparesteBon({
          referinta: comandaId, nr, total, metoda, primit: locala.primit, rest: locala.rest,
          linii: locala.linii.map((l) => ({ nume: l.nume + l.modificatori.map((m) => ` + ${m.nume}`).join(''), cantitate: l.cantitate, pret_unitar: l.total / l.cantitate, total: l.total })),
        })
        .catch((e: Error) => ({ ok: false, mesaj: e.message }));
      if (r.ok) await stocare.marcheazaBonTiparit(comandaId);
      else {
        const rest = metoda === 'numerar' && locala.rest != null ? `Rest: ${formatLei(locala.rest)}. ` : '';
        app.anunta(`${rest}Vânzarea e salvată, dar bonul NU s-a tipărit (${r.mesaj ?? 'imprimanta nu răspunde'}). Tipăriți-l din Istoric.`, true);
        return;
      }
    }
    if (metoda === 'numerar' && locala.rest != null) app.anunta(`Rest: ${formatLei(locala.rest)}`);
    else if (metoda === 'card') app.anunta('Plată cu cardul acceptată');
    else if (metoda === 'casare') app.anunta('Produsele au fost casate din stoc');
  };

  const filtruCategorii = (
    <nav className="categorii" aria-label="Categorii">
      {catalog.categorii.map((c) => (
        <button
          key={c.id}
          className={`categorie${categorie === c.id && !cauta ? ' activa' : ''}`}
          onClick={() => {
            setCategorie(c.id);
            setCauta('');
          }}
        >
          {c.nume}
        </button>
      ))}
      <button className={`categorie${categorie == null && !cauta ? ' activa' : ''}`} onClick={() => { setCategorie(null); setCauta(''); }}>
        Toate
      </button>
      <input className="cautare" type="search" placeholder="Caută…" value={cauta} onChange={(e) => setCauta(e.target.value)} aria-label="Caută produs" />
    </nav>
  );

  return (
    <div className="pos">
      <BaraSus onMeniu={() => setDialog({ tip: 'meniu' })} />
      <main className="zona-produse">
        {filtruCategorii}
        <div className="grila-produse">
          {produse.map((p) => (
            <button key={p.id} className="produs" onClick={() => apasaProdus(p)}>
              <span className="produs-nume">{p.nume}</span>
              <span className="produs-pret">{formatLei(p.pret)}</span>
              {p.modificatori.length > 0 && <span className="produs-optiuni">opțiuni</span>}
            </button>
          ))}
          {produse.length === 0 && <p className="gol">Niciun produs</p>}
        </div>
      </main>

      <aside className="cos" aria-label="Comanda curentă">
        <header className="cos-cap">
          <h2>Comanda</h2>
          {cos.length > 0 && (
            <button className="buton-link" onClick={() => setCos([])}>
              Golește
            </button>
          )}
        </header>
        <ul className="cos-linii">
          {cos.map((l) => (
            <li key={l.cheie} className="cos-linie">
              <div className="cos-linie-text">
                <strong>{l.produs.nume}</strong>
                {l.modificatori.length > 0 && <span className="slab mic">{l.modificatori.map((m) => m.nume).join(', ')}</span>}
              </div>
              <div className="pas-cantitate">
                <button onClick={() => schimbaCantitate(l.cheie, -1)} aria-label={`Scade ${l.produs.nume}`}>−</button>
                <span>{l.cantitate}</span>
                <button onClick={() => schimbaCantitate(l.cheie, 1)} aria-label={`Adaugă ${l.produs.nume}`}>+</button>
              </div>
              <span className="num">{formatLei(totalLinie(inLinieComanda(l)))}</span>
            </li>
          ))}
          {cos.length === 0 && <li className="gol">Atingeți un produs pentru a-l adăuga</li>}
        </ul>
        <footer className="cos-subsol">
          <div className="cos-total">
            <span>Total{nrProduse > 0 ? ` · ${nrProduse} buc` : ''}</span>
            <strong>{formatLei(total)}</strong>
          </div>
          <div className="butoane-plata">
            <button className="buton buton-plata" disabled={!cos.length} onClick={() => setDialog({ tip: 'numerar' })}>
              Numerar
            </button>
            <button className="buton buton-plata card" disabled={!cos.length} onClick={() => setDialog({ tip: 'card' })}>
              Card
            </button>
          </div>
          <button className="buton-secundar" disabled={!cos.length} onClick={() => setDialog({ tip: 'casare' })}>
            Casare (fără încasare)
          </button>
        </footer>
      </aside>

      {dialog?.tip === 'modificatori' && (
        <AlegeModificatori
          produs={dialog.produs}
          modificatori={dialog.produs.modificatori.map((id) => modificatori.get(id)!).filter(Boolean)}
          onAdauga={(mods, cant) => {
            adauga(dialog.produs, mods, cant);
            setDialog(null);
          }}
          onInchide={() => setDialog(null)}
        />
      )}
      {dialog?.tip === 'numerar' && <PlataNumerar total={total} onConfirma={(primit) => finalizeaza('numerar', { primit })} onInchide={() => setDialog(null)} />}
      {dialog?.tip === 'card' && (
        <PlataCard total={total} onAprobat={(autorizare) => finalizeaza('card', { card_autorizare: autorizare })} onInchide={() => setDialog(null)} />
      )}
      {dialog?.tip === 'casare' && (
        <Casare cos={cos} onConfirma={(motiv, nota) => finalizeaza('casare', { motiv_casare: motiv, nota })} onInchide={() => setDialog(null)} />
      )}
      {dialog?.tip === 'meniu' && <Meniu onAlege={(tip) => setDialog({ tip })} onInchide={() => setDialog(null)} />}
      {dialog?.tip === 'istoric' && <Istoric onInchide={() => setDialog(null)} />}
      {dialog?.tip === 'plata_marunta' && <PlataMarunta onInchide={() => setDialog(null)} />}
      {dialog?.tip === 'inchidere' && <InchidereTura onInchide={() => setDialog(null)} />}
      {dialog?.tip === 'inventar' && <Inventar onInchide={() => setDialog(null)} />}
      {dialog?.tip === 'setari' && <Setari onInchide={() => setDialog(null)} />}
    </div>
  );
}

function BaraSus({ onMeniu }: { onMeniu: () => void }) {
  const { catalog, barista, tura, sync } = useAplicatie();
  const stare = sync.online
    ? sync.inAsteptare > 0
      ? { cls: 'sincronizare', text: `Se trimit ${sync.inAsteptare}` }
      : { cls: 'online', text: 'Online' }
    : { cls: 'offline', text: sync.inAsteptare > 0 ? `Offline · ${sync.inAsteptare} de trimis` : 'Offline' };
  return (
    <header className="bara-sus">
      <div className="bara-titlu">
        <strong>{catalog.locatie.nume}</strong>
        <span className="slab mic">
          {barista.nume} · tura de la {formatOra(tura.deschisa_la)}
        </span>
      </div>
      <span
        className={`stare-sync ${stare.cls}`}
        title={sync.ultimaSincronizare ? `Ultima sincronizare: ${formatOra(sync.ultimaSincronizare)}` : 'Încă nesincronizat'}
      >
        <span className="punct" aria-hidden />
        {stare.text}
      </span>
      <button className="buton-secundar" onClick={onMeniu}>
        Meniu
      </button>
    </header>
  );
}

function Meniu({ onAlege, onInchide }: { onAlege: (t: 'istoric' | 'plata_marunta' | 'inchidere' | 'inventar' | 'setari') => void; onInchide: () => void }) {
  const app = useAplicatie();
  const optiuni = [
    { tip: 'istoric', titlu: 'Istoric comenzi', text: 'Bonurile turei, retipărire, anulare / retur' },
    { tip: 'plata_marunta', titlu: 'Plată mărunță din casă', text: 'Cumpărături mici plătite din sertar' },
    { tip: 'inventar', titlu: 'Inventariere', text: 'Stoc scriptic vs. faptic (cere internet)' },
    { tip: 'inchidere', titlu: 'Închide tura', text: 'Raportul de predare a casei' },
    { tip: 'setari', titlu: 'Echipamente și tabletă', text: 'Terminal POS, imprimantă fiscală' },
  ] as const;
  return (
    <div className="fundal-modal" onMouseDown={(e) => e.target === e.currentTarget && onInchide()}>
      <div className="modal meniu" role="dialog" aria-label="Meniu">
        <div className="modal-cap">
          <h2>Meniu</h2>
          <button className="buton-icon" onClick={onInchide} aria-label="Închide">×</button>
        </div>
        <div className="modal-corp lista-meniu">
          {optiuni.map((o) => (
            <button key={o.tip} className="optiune-meniu" onClick={() => onAlege(o.tip)}>
              <strong>{o.titlu}</strong>
              <span className="slab mic">{o.text}</span>
            </button>
          ))}
          <button className="optiune-meniu" onClick={app.blocheaza}>
            <strong>Schimbă utilizatorul</strong>
            <span className="slab mic">Tura rămâne deschisă</span>
          </button>
        </div>
      </div>
    </div>
  );
}
