import { useEffect, useState } from 'react';
import { ETICHETE_MOTIVE, LIMITE, MOTIVE_CASARE, formatLei, type ModificatorCatalog, type MotivCasare, type ProdusCatalog } from '@cafenea/shared';
import { creeazaEchipamente, type RezultatCard } from './echipamente';
import { formatDataOra, formatOra } from '../comun/format';
import { Modal } from '../comun/Modal';
import { useAplicatie } from './context';
import type { BonFiscal } from './echipamente';
import * as stocare from './stocare';
import type { LinieCos } from './Vanzare';

const numar = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) ? v : NaN;
};

// ---- Produs cu opțiuni ----

export function AlegeModificatori(props: {
  produs: ProdusCatalog;
  modificatori: ModificatorCatalog[];
  onAdauga: (m: ModificatorCatalog[], cantitate: number) => void;
  onInchide: () => void;
}) {
  const [alese, setAlese] = useState<number[]>([]);
  const [cantitate, setCantitate] = useState(1);
  const pret = props.produs.pret + props.modificatori.filter((m) => alese.includes(m.id)).reduce((s, m) => s + m.pret, 0);
  return (
    <Modal
      titlu={props.produs.nume}
      onInchide={props.onInchide}
      subsol={
        <>
          <div className="pas-cantitate mare">
            <button onClick={() => setCantitate((c) => Math.max(1, c - 1))} aria-label="Mai puțin">−</button>
            <span>{cantitate}</span>
            <button onClick={() => setCantitate((c) => c + 1)} aria-label="Mai mult">+</button>
          </div>
          <button className="buton buton-mare" onClick={() => props.onAdauga(props.modificatori.filter((m) => alese.includes(m.id)), cantitate)}>
            Adaugă · {formatLei(pret * cantitate)}
          </button>
        </>
      }
    >
      <div className="lista-optiuni">
        {props.modificatori.map((m) => {
          const bifat = alese.includes(m.id);
          return (
            <button
              key={m.id}
              className={`optiune${bifat ? ' bifata' : ''}`}
              aria-pressed={bifat}
              onClick={() => setAlese((a) => (bifat ? a.filter((x) => x !== m.id) : [...a, m.id]))}
            >
              <span>{m.nume}</span>
              <span className="slab">{m.pret > 0 ? `+ ${formatLei(m.pret)}` : 'gratuit'}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ---- Plăți ----

export function PlataNumerar({ total, onConfirma, onInchide }: { total: number; onConfirma: (primit: number) => Promise<void>; onInchide: () => void }) {
  const [primit, setPrimit] = useState('');
  const [lucreaza, setLucreaza] = useState(false);
  const valoare = primit === '' ? total : numar(primit);
  const rest = Math.round((valoare - total) * 100) / 100;
  const valid = Number.isFinite(valoare) && rest >= 0 && valoare <= LIMITE.bani;
  const bancnote = [50, 100, 200, 500, 1000].filter((b) => b > total).slice(0, 4);
  return (
    <Modal
      titlu="Plată în numerar"
      onInchide={onInchide}
      subsol={
        <button
          className="buton buton-mare lat"
          disabled={!valid || lucreaza}
          onClick={async () => {
            setLucreaza(true);
            await onConfirma(valoare);
          }}
        >
          Încasează {formatLei(total)}
        </button>
      }
    >
      <div className="randuri-form">
        <div className="suma-mare">
          <span className="slab">De plată</span>
          <strong>{formatLei(total)}</strong>
        </div>
        <label className="camp">
          <span>Primit de la client</span>
          <input className="intrare-mare" inputMode="decimal" placeholder={String(total)} value={primit} onChange={(e) => setPrimit(e.target.value)} autoFocus />
        </label>
        <div className="bancnote">
          <button className="buton-secundar" onClick={() => setPrimit(String(total))}>Suma exactă</button>
          {bancnote.map((b) => (
            <button key={b} className="buton-secundar" onClick={() => setPrimit(String(b))}>
              {b} lei
            </button>
          ))}
        </div>
        <div className={`suma-mare rest${valid ? '' : ' insuficient'}`}>
          <span className="slab">{valid ? 'Rest de dat' : valoare > LIMITE.bani ? 'Suma primită e prea mare' : 'Suma primită e mai mică decât totalul'}</span>
          <strong>{valid ? formatLei(rest) : '—'}</strong>
        </div>
      </div>
    </Modal>
  );
}

export function PlataCard({ total, referinta, onAprobat, onInchide }: { total: number; referinta: string; onAprobat: (card: RezultatCard) => Promise<void>; onInchide: () => void }) {
  const { echipamente } = useAplicatie();
  const [stare, setStare] = useState<{ tip: 'asteapta' } | { tip: 'refuzat'; mesaj: string }>({ tip: 'asteapta' });
  const [incercare, setIncercare] = useState(0);

  useEffect(() => {
    let anulat = false;
    setStare({ tip: 'asteapta' });
    echipamente
      .platesteCard(total, referinta)
      .then(async (r) => {
        if (anulat) return;
        if (r.aprobat) await onAprobat(r);
        else setStare({ tip: 'refuzat', mesaj: r.mesaj ?? 'Plata a fost refuzată' });
      })
      .catch((e: Error) => !anulat && setStare({ tip: 'refuzat', mesaj: `Terminalul nu răspunde: ${e.message}` }));
    return () => {
      anulat = true;
    };
    // O singură trimitere la terminal pentru fiecare încercare.
  }, [incercare]);

  return (
    <Modal
      titlu="Plată cu cardul"
      onInchide={stare.tip === 'refuzat' ? onInchide : undefined}
      subsol={
        stare.tip === 'refuzat' && (
          <>
            <button className="buton-secundar" onClick={onInchide}>Înapoi la comandă</button>
            <button className="buton" onClick={() => setIncercare((i) => i + 1)}>Încearcă din nou</button>
          </>
        )
      }
    >
      <div className="randuri-form centrat">
        <div className="suma-mare">
          <span className="slab">Suma trimisă la terminal</span>
          <strong>{formatLei(total)}</strong>
        </div>
        {stare.tip === 'asteapta' ? (
          <>
            <div className="rotita" aria-hidden />
            <p>Clientul apropie sau introduce cardul în terminal…</p>
            <p className="slab mic">{echipamente.descriere}</p>
          </>
        ) : (
          <div className="alerta pericol">{stare.mesaj}</div>
        )}
      </div>
    </Modal>
  );
}

export function Casare({ cos, onConfirma, onInchide }: { cos: LinieCos[]; onConfirma: (m: MotivCasare, nota?: string) => Promise<void>; onInchide: () => void }) {
  const [motiv, setMotiv] = useState<MotivCasare | null>(null);
  const [nota, setNota] = useState('');
  const [lucreaza, setLucreaza] = useState(false);
  return (
    <Modal
      titlu="Casare fără încasare"
      onInchide={onInchide}
      subsol={
        <button
          className="buton buton-mare lat"
          disabled={!motiv || lucreaza || (motiv === 'altele' && !nota.trim())}
          onClick={async () => {
            setLucreaza(true);
            await onConfirma(motiv!, nota.trim() || undefined);
          }}
        >
          Scade din stoc
        </button>
      }
    >
      <div className="randuri-form">
        <p className="slab">
          Ingredientele pentru {cos.reduce((s, l) => s + l.cantitate, 0)} produse se scad din stoc, fără bani în casă și fără bon fiscal.
        </p>
        <div className="lista-optiuni">
          {MOTIVE_CASARE.map((m) => (
            <button key={m} className={`optiune${motiv === m ? ' bifata' : ''}`} aria-pressed={motiv === m} onClick={() => setMotiv(m)}>
              {ETICHETE_MOTIVE[m]}
            </button>
          ))}
        </div>
        <label className="camp">
          <span>Notă {motiv === 'altele' ? '(obligatorie)' : '(opțională)'}</span>
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="de ex. degustare pentru clientul X" />
        </label>
      </div>
    </Modal>
  );
}

// ---- Istoric, retipărire, anulare ----

const bonDin = (c: stocare.ComandaLocala): BonFiscal => ({
  referinta: c.comanda_id,
  nr: c.nr,
  total: c.total,
  metoda: c.metoda === 'card' ? 'card' : 'numerar',
  primit: c.primit,
  rest: c.rest,
  card: c.metoda === 'card' ? { autorizare: c.card_autorizare, rrn: c.card_rrn, operation_id: c.card_operation_id } : null,
  linii: c.linii.map((l) => ({ produs_id: l.produs_id, nume: l.nume + l.modificatori.map((m) => ` + ${m.nume}`).join(''), cantitate: l.cantitate, pret_unitar: l.total / l.cantitate, total: l.total })),
});

export function Istoric({ onInchide }: { onInchide: () => void }) {
  const app = useAplicatie();
  const [comenzi, setComenzi] = useState<stocare.ComandaLocala[] | null>(null);
  const [selectata, setSelectata] = useState<stocare.ComandaLocala | null>(null);
  const [anulare, setAnulare] = useState(false);
  const [ocupat, setOcupat] = useState(false);
  const reincarca = () => stocare.comenziTura(app.tura.id).then(setComenzi);
  useEffect(() => {
    void reincarca();
  }, []);

  if (selectata && anulare)
    return (
      <Anulare
        comanda={selectata}
        onInapoi={() => setAnulare(false)}
        onGata={async () => {
          setAnulare(false);
          setSelectata(null);
          await reincarca();
        }}
      />
    );

  // Tipărirea fiscală se face o singură dată; după aceea se poate da doar o copie nefiscală.
  const tipareste = async (c: stocare.ComandaLocala) => {
    if (ocupat) return;
    setOcupat(true);
    const fiscal = !c.bon_tiparit;
    const r = await (fiscal ? app.echipamente.tiparesteBon(bonDin(c)) : app.echipamente.tiparesteDuplicat(bonDin(c))).catch((e: Error) => ({ ok: false, mesaj: e.message }));
    if (r.ok) {
      if (fiscal) await stocare.marcheazaBonTiparit(c.comanda_id);
      app.anunta(fiscal ? 'Bonul fiscal a fost tipărit' : 'Copia bonului a fost tipărită');
      const curenta = await stocare.citesteComanda(c.comanda_id);
      if (curenta) setSelectata(curenta);
      await reincarca();
    } else app.anunta(`Imprimanta: ${r.mesaj ?? 'eroare'}`, true);
    setOcupat(false);
  };

  const incepeAnularea = async (c: stocare.ComandaLocala) => {
    const curenta = await stocare.citesteComanda(c.comanda_id);
    if (!curenta || curenta.stare !== 'finalizata') {
      app.anunta('Comanda a fost deja anulată', true);
      if (curenta) setSelectata(curenta);
      await reincarca();
      return;
    }
    setSelectata(curenta);
    setAnulare(true);
  };

  if (selectata)
    return (
      <Modal
        titlu={`Bon #${selectata.nr} · ${formatOra(selectata.la)}`}
        onInchide={ocupat ? undefined : () => setSelectata(null)}
        subsol={
          selectata.stare === 'finalizata' && (
            <>
              {selectata.metoda !== 'casare' && (!selectata.bon_tiparit || app.echipamente.poateDuplica) && (
                <button className="buton-secundar" disabled={ocupat} onClick={() => tipareste(selectata)}>
                  {selectata.bon_tiparit ? 'Copie bon (nefiscală)' : 'Tipărește bonul fiscal'}
                </button>
              )}
              <button className="buton-pericol" disabled={ocupat} onClick={() => incepeAnularea(selectata)}>
                {selectata.metoda === 'casare' ? 'Anulează casarea' : 'Anulează / retur'}
              </button>
            </>
          )
        }
      >
        <DetaliiComanda c={selectata} />
      </Modal>
    );

  return (
    <Modal titlu="Comenzile turei" onInchide={onInchide} lat>
      {!comenzi ? (
        <p className="gol">Se încarcă…</p>
      ) : comenzi.length === 0 ? (
        <p className="gol">Nicio comandă în tura aceasta</p>
      ) : (
        <div className="tabel-container">
          <table className="tabel">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Ora</th>
                <th>Produse</th>
                <th>Plată</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {comenzi.map((c) => (
                <tr key={c.comanda_id} className={`clic${c.stare === 'anulata' ? ' anulata' : ''}`} onClick={() => setSelectata(c)}>
                  <td>#{c.nr}</td>
                  <td>{formatOra(c.la)}</td>
                  <td>{c.linii.map((l) => `${l.cantitate}× ${l.nume}`).join(', ')}</td>
                  <td>
                    <EticheteComanda c={c} />
                  </td>
                  <td className="num">{c.metoda === 'casare' ? '—' : formatLei(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function EticheteComanda({ c }: { c: stocare.ComandaLocala }) {
  return (
    <span className="etichete">
      {c.metoda === 'numerar' && <span className="insigna">Numerar</span>}
      {c.metoda === 'card' && <span className="insigna info">Card</span>}
      {c.metoda === 'casare' && <span className="insigna avertisment">Casare: {c.motiv_casare ? ETICHETE_MOTIVE[c.motiv_casare] : ''}</span>}
      {c.stare === 'anulata' && <span className="insigna pericol">Anulată</span>}
      {c.metoda !== 'casare' && !c.bon_tiparit && c.stare === 'finalizata' && <span className="insigna pericol">Bon netipărit</span>}
    </span>
  );
}

function DetaliiComanda({ c }: { c: stocare.ComandaLocala }) {
  return (
    <div className="randuri-form">
      <EticheteComanda c={c} />
      <ul className="linii-bon">
        {c.linii.map((l, i) => (
          <li key={i}>
            <span>
              {l.cantitate}× {l.nume}
              {l.modificatori.length > 0 && <span className="slab mic"> ({l.modificatori.map((m) => m.nume).join(', ')})</span>}
            </span>
            <span className="num">{formatLei(l.total)}</span>
          </li>
        ))}
      </ul>
      <div className="suma-mare">
        <span className="slab">Total</span>
        <strong>{formatLei(c.total)}</strong>
      </div>
      {c.primit != null && (
        <p className="slab">
          Primit {formatLei(c.primit)} · rest {formatLei(c.rest ?? 0)}
        </p>
      )}
      {c.card_autorizare && <p className="slab">Cod autorizare card: {c.card_autorizare}</p>}
      <p className="slab mic">
        {c.barista.nume} · {formatDataOra(c.la)}
      </p>
      {c.stare === 'anulata' && (
        <div className="alerta avertisment">
          Anulată la {formatOra(c.anulata_la)}: {c.motiv_anulare}. {c.stoc_restituit ? 'Ingredientele au revenit în stoc.' : 'Ingredientele s-au pierdut.'}
        </div>
      )}
    </div>
  );
}

const MOTIVE_ANULARE = ['Greșeală la comandă', 'Clientul a renunțat', 'Produs nereușit', 'Altele'];

function Anulare({ comanda, onInapoi, onGata }: { comanda: stocare.ComandaLocala; onInapoi: () => void; onGata: () => void }) {
  const app = useAplicatie();
  const [motiv, setMotiv] = useState('');
  const [detalii, setDetalii] = useState('');
  const [preparat, setPreparat] = useState<boolean | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const [eroare, setEroare] = useState('');
  const textMotiv = motiv === 'Altele' ? detalii.trim() : [motiv, detalii.trim()].filter(Boolean).join(': ');
  const valid = !!textMotiv && preparat !== null;

  const confirma = async () => {
    if (lucreaza) return;
    setLucreaza(true);
    setEroare('');
    const curenta = await stocare.citesteComanda(comanda.comanda_id);
    if (!curenta || curenta.stare !== 'finalizata') {
      app.anunta('Comanda a fost deja anulată', true);
      onGata();
      return;
    }
    // Pe card, banii se dau înapoi prin terminal înainte de a înregistra anularea.
    if (comanda.metoda === 'card') {
      const r = await app.echipamente
        .returCard(comanda.total, { autorizare: comanda.card_autorizare, rrn: comanda.card_rrn, operation_id: comanda.card_operation_id }, comanda.comanda_id)
        .catch((e: Error) => ({ aprobat: false, mesaj: e.message }));
      if (!r.aprobat) {
        setEroare(`Returul pe card nu a reușit: ${r.mesaj ?? 'terminalul a refuzat'}`);
        setLucreaza(false);
        return;
      }
    }
    // Anularea se înregistrează imediat după restituire, înainte de tipărire: o imprimantă
    // care nu răspunde nu poate lăsa un retur bancar făcut fără urmă în sistem.
    const ev = app.eveniment('comanda_anulata', {
      comanda_id: comanda.comanda_id,
      tura_id: app.tura.id,
      utilizator_id: app.barista.id,
      motiv: textMotiv,
      restituie_stoc: !preparat,
    });
    await app.inregistreaza(ev, { ...curenta, stare: 'anulata', anulata_la: ev.la, motiv_anulare: textMotiv, stoc_restituit: !preparat });
    // Bon de retur doar pentru un bon fiscal emis; altfel n-ar avea ce storna.
    if (comanda.metoda !== 'casare' && curenta.bon_tiparit) {
      const r = await app.echipamente.tiparesteRetur(bonDin(comanda)).catch((e: Error) => ({ ok: false, mesaj: e.message }));
      if (!r.ok) app.anunta(`Anulat, dar bonul de retur nu s-a tipărit: ${r.mesaj ?? ''}`, true);
    }
    app.anunta(comanda.metoda === 'numerar' ? `Anulat. Dați clientului ${formatLei(comanda.total)}` : 'Comanda a fost anulată');
    onGata();
  };

  return (
    <Modal
      titlu={`Anulare bon #${comanda.nr}`}
      onInchide={lucreaza ? undefined : onInapoi}
      subsol={
        <>
          <button className="buton-secundar" disabled={lucreaza} onClick={onInapoi}>Înapoi</button>
          <button className="buton-pericol" disabled={!valid || lucreaza} onClick={confirma}>
            {lucreaza ? 'Se procesează…' : comanda.metoda === 'casare' ? 'Anulează casarea' : `Anulează și restituie ${formatLei(comanda.total)}`}
          </button>
        </>
      }
    >
      <div className="randuri-form">
        <div className="lista-optiuni">
          {MOTIVE_ANULARE.map((m) => (
            <button key={m} className={`optiune${motiv === m ? ' bifata' : ''}`} aria-pressed={motiv === m} onClick={() => setMotiv(m)}>
              {m}
            </button>
          ))}
        </div>
        <label className="camp">
          <span>Detalii {motiv === 'Altele' ? '(obligatorii)' : '(opționale)'}</span>
          <input value={detalii} onChange={(e) => setDetalii(e.target.value)} maxLength={200} />
        </label>
        <div className="camp">
          <span>Produsul a fost preparat?</span>
          <div className="doua-coloane">
            <button className={`optiune${preparat === false ? ' bifata' : ''}`} onClick={() => setPreparat(false)}>
              Nu — ingredientele revin în stoc
            </button>
            <button className={`optiune${preparat === true ? ' bifata' : ''}`} onClick={() => setPreparat(true)}>
              Da — ingredientele se pierd
            </button>
          </div>
        </div>
        {comanda.metoda === 'card' && <p className="slab mic">Suma se returnează pe card prin terminal.</p>}
        {eroare && <div className="alerta pericol">{eroare}</div>}
      </div>
    </Modal>
  );
}

// ---- Plată mărunță ----

export function PlataMarunta({ onInchide }: { onInchide: () => void }) {
  const app = useAplicatie();
  const [suma, setSuma] = useState('');
  const [descriere, setDescriere] = useState('');
  const [lucreaza, setLucreaza] = useState(false);
  const v = numar(suma);
  const valid = v > 0 && v <= LIMITE.bani && descriere.trim().length > 1;
  return (
    <Modal
      titlu="Plată mărunță din casă"
      onInchide={lucreaza ? undefined : onInchide}
      subsol={
        <button
          className="buton buton-mare lat"
          disabled={!valid || lucreaza}
          onClick={async () => {
            if (lucreaza) return;
            setLucreaza(true);
            await app.inregistreaza(app.eveniment('plata_marunta', { tura_id: app.tura.id, utilizator_id: app.barista.id, suma: Math.round(v * 100) / 100, descriere: descriere.trim() }));
            app.anunta(`Plată de ${formatLei(v)} înregistrată`);
            onInchide();
          }}
        >
          Înregistrează plata
        </button>
      }
    >
      <div className="randuri-form">
        <label className="camp">
          <span>Suma scoasă din sertar (lei)</span>
          <input className="intrare-mare" inputMode="decimal" value={suma} onChange={(e) => setSuma(e.target.value)} autoFocus />
        </label>
        <label className="camp">
          <span>Pentru ce</span>
          <input value={descriere} onChange={(e) => setDescriere(e.target.value)} maxLength={LIMITE.text} placeholder="de ex. detergent, șervețele" />
        </label>
        <p className="slab mic">Păstrați bonul de la magazin pentru administrator.</p>
      </div>
    </Modal>
  );
}

// ---- Închiderea turei (raportul baristei la predarea casei) ----

export function InchidereTura({ onInchide }: { onInchide: () => void }) {
  const app = useAplicatie();
  const [v, setV] = useState({ doze: '', numerar: '', card: '', anulari: '0', casari: '0', observatii: '' });
  const [confirmare, setConfirmare] = useState(false);
  const [lucreaza, setLucreaza] = useState(false);
  const [gata, setGata] = useState<string | null>(null);
  const camp = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }) });
  const valori = { doze: numar(v.doze), numerar: numar(v.numerar), card: numar(v.card), anulari: numar(v.anulari), casari: numar(v.casari) };
  const valid =
    Object.values(valori).every((x) => Number.isFinite(x) && x >= 0) &&
    Number.isInteger(valori.anulari) && Number.isInteger(valori.casari) &&
    valori.doze <= LIMITE.doze && valori.numerar <= LIMITE.bani && valori.card <= LIMITE.bani &&
    valori.anulari <= LIMITE.bucati && valori.casari <= LIMITE.bucati;

  if (gata)
    return (
      <Modal titlu="Tura a fost închisă" subsol={<button className="buton buton-mare lat" onClick={app.inchideTura}>Gata</button>}>
        <div className="randuri-form">
          <div className="alerta succes">Raportul a fost salvat și se trimite administratorului{app.sync.online ? '' : ' când revine internetul'}.</div>
          {gata !== 'ok' && <div className="alerta avertisment">{gata}</div>}
        </div>
      </Modal>
    );

  const inchide = async () => {
    if (lucreaza) return;
    setLucreaza(true);
    // Evenimentul și ștergerea turei locale se fac împreună: de aici încolo tableta nu mai
    // poate vinde pe tura închisă, chiar dacă e oprită înainte de „Gata”.
    await app.inregistreaza(
      app.eveniment('tura_inchisa', {
        tura_id: app.tura.id,
        utilizator_id: app.barista.id,
        doze: valori.doze,
        numerar: Math.round(valori.numerar * 100) / 100,
        card: Math.round(valori.card * 100) / 100,
        anulari: valori.anulari,
        casari: valori.casari,
        observatii: v.observatii.trim() || null,
      }),
      undefined,
      { inchideTura: true },
    );
    const z = await app.echipamente.raportZ().catch((e: Error) => ({ ok: false, mesaj: e.message }));
    setGata(z.ok ? 'ok' : `Raportul Z al casei de marcat nu s-a tipărit: ${z.mesaj ?? ''}. Tipăriți-l manual.`);
  };

  return (
    <Modal
      titlu="Închiderea turei"
      onInchide={lucreaza ? undefined : onInchide}
      lat
      subsol={
        confirmare ? (
          <>
            <span className="slab">Datele nu mai pot fi modificate după închidere.</span>
            <button className="buton-secundar" disabled={lucreaza} onClick={() => setConfirmare(false)}>Corectez</button>
            <button className="buton" disabled={lucreaza} onClick={inchide}>
              {lucreaza ? 'Se închide…' : 'Confirm și închid tura'}
            </button>
          </>
        ) : (
          <button className="buton buton-mare" disabled={!valid} onClick={() => setConfirmare(true)}>
            Închide tura
          </button>
        )
      }
    >
      <div className="randuri-form">
        <p className="slab">Introduceți ce ați numărat efectiv. Sistemul compară cu evidența și trimite diferențele administratorului.</p>
        <div className="doua-coloane">
          <label className="camp">
            <span>Doze de cafea (contorul râșniței)</span>
            <input inputMode="decimal" {...camp('doze')} disabled={confirmare} />
          </label>
          <label className="camp">
            <span>Numerar numărat în sertar (lei)</span>
            <input inputMode="decimal" {...camp('numerar')} disabled={confirmare} />
          </label>
          <label className="camp">
            <span>Total card din raportul terminalului (lei)</span>
            <input inputMode="decimal" {...camp('card')} disabled={confirmare} />
          </label>
          <label className="camp">
            <span>Produse anulate / returnate (buc)</span>
            <input inputMode="numeric" {...camp('anulari')} disabled={confirmare} />
          </label>
          <label className="camp">
            <span>Produse casate / decontate (buc)</span>
            <input inputMode="numeric" {...camp('casari')} disabled={confirmare} />
          </label>
        </div>
        <label className="camp">
          <span>Observații (opțional)</span>
          <textarea {...camp('observatii')} disabled={confirmare} maxLength={1000} />
        </label>
      </div>
    </Modal>
  );
}

// ---- Echipamente și tabletă ----

export function Setari({ onInchide }: { onInchide: () => void }) {
  const app = useAplicatie();
  const [cfg, setCfg] = useState<stocare.ConfigEchipamente>({ tip: 'simulator', url: 'http://127.0.0.1:8099' });
  const [test, setTest] = useState('');
  useEffect(() => {
    void stocare.citeste('echipamente').then((c) => c && setCfg(c));
  }, []);
  return (
    <Modal
      titlu="Echipamente și tabletă"
      onInchide={onInchide}
      subsol={
        <>
          <button
            className="buton-secundar"
            onClick={async () => {
              await stocare.scrie('echipamente', cfg);
              await app.reincarcaEchipamente();
              setTest('Se verifică…');
              try {
                // Instanța nouă, nu cea din contextul de dinainte de salvare.
                const s = await creeazaEchipamente(cfg, () => app.config.token).verifica();
                setTest(`Terminal: ${s.terminal} · Imprimantă: ${s.imprimanta}`);
              } catch (e) {
                setTest(`Nu răspunde: ${(e as Error).message}`);
              }
            }}
          >
            Salvează și testează
          </button>
          <button
            className="buton"
            onClick={async () => {
              await stocare.scrie('echipamente', cfg);
              await app.reincarcaEchipamente();
              onInchide();
            }}
          >
            Salvează
          </button>
        </>
      }
    >
      <div className="randuri-form">
        <div className="camp">
          <span>Legătura cu terminalul de plată și imprimanta fiscală</span>
          <div className="lista-optiuni">
            <button className={`optiune${cfg.tip === 'server' ? ' bifata' : ''}`} onClick={() => setCfg({ ...cfg, tip: 'server' })}>
              Terminal fiscal prin server
            </button>
            <button className={`optiune${cfg.tip === 'punte' ? ' bifata' : ''}`} onClick={() => setCfg({ ...cfg, tip: 'punte' })}>
              Punte locală
            </button>
            <button className={`optiune${cfg.tip === 'simulator' ? ' bifata' : ''}`} onClick={() => setCfg({ ...cfg, tip: 'simulator' })}>
              Simulator (fără echipamente)
            </button>
          </div>
          {cfg.tip === 'server' && (
            <p className="slab mic">
              Terminalul bancar în regim fiscal (de ex. PAX A930 cu IS Fiscal) legat de această tabletă în panou, la Setări → Tablete. Plata cu
              cardul, bonul fiscal și raportul Z se fac pe el, prin POSLink. Are nevoie de internet.
            </p>
          )}
        </div>
        {cfg.tip === 'punte' ? (
          <div className="doua-coloane">
            <label className="camp">
              <span>Adresa punții</span>
              <input value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} />
            </label>
            <label className="camp">
              <span>Secretul punții (afișat la pornirea ei)</span>
              <input value={cfg.secret ?? ''} onChange={(e) => setCfg({ ...cfg, secret: e.target.value.trim() })} autoComplete="off" />
            </label>
          </div>
        ) : cfg.tip === 'simulator' ? (
          <label className="bifa">
            <input type="checkbox" checked={!!cfg.simuleazaRefuz} onChange={(e) => setCfg({ ...cfg, simuleazaRefuz: e.target.checked })} />
            Simulează refuzul plăților cu cardul (pentru instruire)
          </label>
        ) : null}
        {test && <div className="alerta">{test}</div>}
        <div className="card mic slab">
          Tableta: {app.config.dispozitiv.nume} · {app.catalog.locatie.nume}
          <br />
          Catalog versiunea {app.catalog.versiune}, descărcat {formatDataOra(app.catalog.generat_la)}
          <br />
          Evenimente nesincronizate: {app.sync.inAsteptare}
          {app.sync.respinse > 0 && ` · respinse de server: ${app.sync.respinse} (le vede administratorul)`}
        </div>
      </div>
    </Modal>
  );
}
