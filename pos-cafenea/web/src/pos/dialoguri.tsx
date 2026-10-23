import { useEffect, useState } from 'react';
import { COD_TERMINAL, ETICHETE_MOTIVE, LIMITE, MOTIVE_CASARE, formatLei, hashPin, type ModificatorCatalog, type MotivCasare, type ProdusCatalog } from '@cafenea/shared';
import { useFaraBlocare } from './blocare';
import { alegeEchipamente, creeazaEchipamente, demonstratiePermisa, urmareRetur, type RezultatCard } from './echipamente';
import { TastaturaPin } from './ecrane';
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

export function PlataCard({
  total,
  referinta,
  onAprobat,
  onInchide,
  onReferintaNoua,
}: {
  total: number;
  referinta: string;
  onAprobat: (card: RezultatCard) => Promise<void>;
  onInchide: () => void;
  /** Barista a văzut pe terminal că plata nesigură nu a trecut: următoarea încercare e o plată nouă. */
  onReferintaNoua: () => void;
}) {
  const { echipamente } = useAplicatie();
  if (echipamente.manual) return <PlataCardManuala total={total} onAprobat={onAprobat} onInchide={onInchide} />;
  return <PlataCardTerminal total={total} referinta={referinta} onAprobat={onAprobat} onInchide={onInchide} onReferintaNoua={onReferintaNoua} />;
}

function PlataCardTerminal({
  total,
  referinta,
  onAprobat,
  onInchide,
  onReferintaNoua,
}: {
  total: number;
  referinta: string;
  onAprobat: (card: RezultatCard) => Promise<void>;
  onInchide: () => void;
  onReferintaNoua: () => void;
}) {
  const { echipamente } = useAplicatie();
  const [stare, setStare] = useState<
    | { tip: 'asteapta' }
    | { tip: 'refuzat' | 'nesigur'; mesaj: string }
    // Comanda are deja o plată aprobată (sau încă nelămurită) pentru altă sumă: coșul s-a schimbat între timp.
    | { tip: 'alta_suma'; nelamurita: boolean; suma?: number; mesaj: string }
  >({ tip: 'asteapta' });
  const [incercare, setIncercare] = useState(0);
  // Cât timp dialogul e deschis, tableta nu se blochează singură: nici în așteptare, nici după un rezultat
  // nesigur, când barista se uită pe terminal sau pe chitanța băncii (blocarea ar pierde coșul și referința).
  useFaraBlocare();

  useEffect(() => {
    let anulat = false;
    setStare({ tip: 'asteapta' });
    echipamente
      .platesteCard(total, referinta)
      .then(async (r) => {
        if (anulat) return;
        if (r.aprobat) await onAprobat(r);
        else if (r.cod === COD_TERMINAL.plataDejaAprobata || r.cod === COD_TERMINAL.plataNelamurita)
          setStare({ tip: 'alta_suma', nelamurita: r.cod === COD_TERMINAL.plataNelamurita, suma: r.suma_anterioara, mesaj: r.mesaj ?? '' });
        else if (r.nesigur) setStare({ tip: 'nesigur', mesaj: r.mesaj ?? 'Nu se poate confirma plata' });
        else setStare({ tip: 'refuzat', mesaj: r.mesaj ?? 'Plata a fost refuzată' });
      })
      .catch((e: Error) => !anulat && setStare({ tip: 'nesigur', mesaj: `Terminalul nu răspunde: ${e.message}` }));
    return () => {
      anulat = true;
    };
    // O singură trimitere la terminal pentru fiecare încercare.
  }, [incercare]);

  return (
    <Modal
      titlu="Plată cu cardul"
      onInchide={stare.tip !== 'asteapta' ? onInchide : undefined}
      subsol={
        stare.tip !== 'asteapta' && (
          <>
            <button className="buton-secundar" onClick={onInchide}>Înapoi la comandă</button>
            {stare.tip !== 'alta_suma' && (
              <button className="buton" onClick={() => setIncercare((i) => i + 1)}>
                {stare.tip === 'nesigur' ? 'Verifică din nou' : 'Încearcă din nou'}
              </button>
            )}
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
            <p className="slab mic">
              {echipamente.descriere}. Poate dura până la 7 minute dacă terminalul răspunde greu; nu închideți aplicația. Nu se
              încasează de două ori: o reîncercare verifică plata aceasta.
            </p>
          </>
        ) : stare.tip === 'nesigur' ? (
          <>
            <div className="alerta avertisment" role="alert">
              <strong>Plata nu este confirmată.</strong> {stare.mesaj}. Vânzarea NU s-a înregistrat. Uitați-vă pe ecranul terminalului
              și pe chitanța băncii, apoi apăsați „Verifică din nou”: aceeași plată nu se trimite a doua oară.
            </div>
            <button
              className="buton-link"
              onClick={() => {
                if (!window.confirm('Terminalul arată că plata NU a trecut și clientul nu a plătit? Se va trimite o plată nouă.')) return;
                onReferintaNoua();
                setIncercare((i) => i + 1);
              }}
            >
              Terminalul arată că plata nu a trecut: trimite o plată nouă
            </button>
          </>
        ) : stare.tip === 'alta_suma' ? (
          stare.nelamurita ? (
            <>
              <div className="alerta avertisment" role="alert">
                <strong>Plata anterioară a acestei comenzi{stare.suma != null ? `, de ${formatLei(stare.suma)},` : ''} nu este lămurită.</strong> Coșul
                s-a schimbat între timp. Readuceți coșul la {stare.suma != null ? formatLei(stare.suma) : 'suma de atunci'} și verificați plata din nou.
              </div>
              <button
                className="buton-link"
                onClick={() => {
                  if (!window.confirm('Terminalul arată că plata anterioară NU a trecut și clientul nu a plătit? Se va trimite o plată nouă.')) return;
                  onReferintaNoua();
                  setIncercare((i) => i + 1);
                }}
              >
                Terminalul arată că plata anterioară nu a trecut: trimite o plată nouă
              </button>
            </>
          ) : (
            <div className="alerta pericol" role="alert">
              <strong>Clientul a plătit deja această comandă{stare.suma != null ? `: ${formatLei(stare.suma)}` : ''}.</strong> Terminalul a aprobat plata, dar
              răspunsul s-a pierdut și apoi coșul s-a schimbat. NU trimiteți o plată nouă. Readuceți coșul la{' '}
              {stare.suma != null ? formatLei(stare.suma) : 'suma aprobată'} și apăsați din nou „Card”: vânzarea se înregistrează cu plata aprobată. Ce
              s-a adăugat după aceea se vinde într-o comandă separată.
            </div>
          )
        ) : (
          <div className="alerta pericol">{stare.mesaj}</div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Terminal separat, fără legătură: barista introduce suma pe terminal și spune aici dacă plata a trecut.
 * Vânzarea apare la server ca „card neconfirmat de terminal”, ca adminul s-o compare cu raportul băncii.
 */
function PlataCardManuala({ total, onAprobat, onInchide }: { total: number; onAprobat: (card: RezultatCard) => Promise<void>; onInchide: () => void }) {
  const [cod, setCod] = useState('');
  const [lucreaza, setLucreaza] = useState(false);
  useFaraBlocare();
  return (
    <Modal
      titlu="Plată cu cardul"
      onInchide={lucreaza ? undefined : onInchide}
      subsol={
        <>
          <button className="buton-secundar" disabled={lucreaza} onClick={onInchide}>
            Plata nu a trecut
          </button>
          <button
            className="buton buton-mare"
            disabled={lucreaza}
            onClick={async () => {
              setLucreaza(true);
              await onAprobat({ aprobat: true, autorizare: cod.trim() || undefined });
            }}
          >
            Plata a trecut
          </button>
        </>
      }
    >
      <div className="randuri-form centrat">
        <div className="suma-mare">
          <span className="slab">Introduceți pe terminal suma</span>
          <strong>{formatLei(total)}</strong>
        </div>
        <p>Tableta nu e legată de terminal. Tastați suma pe terminal, așteptați chitanța băncii, apoi confirmați aici.</p>
        <label className="camp">
          <span>Cod de autorizare de pe chitanță (opțional)</span>
          <input value={cod} onChange={(e) => setCod(e.target.value.replace(/[^\w-]/g, '').slice(0, 12))} inputMode="numeric" autoComplete="off" />
        </label>
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
              {selectata.metoda !== 'casare' && !selectata.bon_pe_terminal && !app.echipamente.manual && (!selectata.bon_tiparit || app.echipamente.poateDuplica) && (
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
      {c.metoda !== 'casare' && c.bon_pe_terminal && <span className="insigna">Bon pe terminal</span>}
      {c.metoda !== 'casare' && !c.bon_tiparit && !c.bon_pe_terminal && c.stare === 'finalizata' && <span className="insigna pericol">Bon netipărit</span>}
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

export function Anulare({ comanda, onInapoi, onGata }: { comanda: stocare.ComandaLocala; onInapoi: () => void; onGata: () => void }) {
  const app = useAplicatie();
  const [motiv, setMotiv] = useState('');
  const [detalii, setDetalii] = useState('');
  const [preparat, setPreparat] = useState<boolean | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  // Returul prin terminal care nu s-a încheiat: de făcut din meniul terminalului (fără plată înregistrată
  // prin server sau încasată pe alt terminal), nesigur (de verificat) sau refuzat.
  const [retur, setRetur] = useState<{ tip: 'din_meniu' | 'nesigur' | 'refuzat'; mesaj: string } | null>(null);
  const textMotiv = motiv === 'Altele' ? detalii.trim() : [motiv, detalii.trim()].filter(Boolean).join(': ');
  const valid = !!textMotiv && preparat !== null;
  // Terminal separat sau comandă fără plată înregistrată prin server: returul pe card îl face barista din
  // meniul terminalului, tableta doar înregistrează anularea.
  const returManual = comanda.metoda === 'card' && (app.echipamente.manual || retur?.tip === 'din_meniu');
  // Un retur nesigur sau refuzat ține dialogul deschis cât barista verifică terminalul.
  useFaraBlocare(lucreaza || retur !== null);

  /** `returConfirmat`: barista a văzut pe terminal că returul nesigur s-a făcut; nu se mai trimite nimic. */
  const confirma = async (returConfirmat = false) => {
    if (lucreaza) return;
    setLucreaza(true);
    const curenta = await stocare.citesteComanda(comanda.comanda_id);
    if (!curenta || curenta.stare !== 'finalizata') {
      app.anunta('Comanda a fost deja anulată', true);
      onGata();
      return;
    }
    // Pe card, banii se dau înapoi prin terminal înainte de a înregistra anularea. Serverul restituie doar
    // în contul plății înregistrate a acestei comenzi (RRN și sumă din registrul lui), o singură dată.
    // Fără plată înregistrată (vânzare din pilotul manual sau de dinaintea registrului), serverul cere
    // returul din meniul terminalului: dialogul trece pe calea manuală, nu rămâne blocat.
    if (comanda.metoda === 'card' && !returManual && !returConfirmat) {
      const r: RezultatCard = await app.echipamente
        .returCard(comanda.total, { autorizare: comanda.card_autorizare, rrn: comanda.card_rrn, operation_id: comanda.card_operation_id }, comanda.comanda_id)
        .catch((e: Error) => ({ aprobat: false, nesigur: true, mesaj: e.message }));
      const urmare = urmareRetur(r);
      if (urmare !== 'inregistreaza') {
        setRetur({ tip: urmare, mesaj: r.mesaj ?? '' });
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
    if (comanda.metoda !== 'casare' && curenta.bon_tiparit && !curenta.bon_pe_terminal) {
      const r = await app.echipamente.tiparesteRetur(bonDin(comanda)).catch((e: Error) => ({ ok: false, mesaj: e.message }));
      if (!r.ok) app.anunta(`Anulat, dar bonul de retur nu s-a tipărit: ${r.mesaj ?? ''}`, true);
    }
    if (curenta.bon_pe_terminal && comanda.metoda !== 'casare') {
      app.anunta(`Anulat. Emiteți bonul de retur pe terminal${comanda.metoda === 'numerar' ? ` și dați clientului ${formatLei(comanda.total)}` : ''}.`, true);
    } else app.anunta(comanda.metoda === 'numerar' ? `Anulat. Dați clientului ${formatLei(comanda.total)}` : 'Comanda a fost anulată');
    onGata();
  };

  return (
    <Modal
      titlu={`Anulare bon #${comanda.nr}`}
      onInchide={lucreaza ? undefined : onInapoi}
      subsol={
        <>
          <button className="buton-secundar" disabled={lucreaza} onClick={onInapoi}>Înapoi</button>
          <button className="buton-pericol" disabled={!valid || lucreaza} onClick={() => void confirma()}>
            {lucreaza
              ? 'Se procesează…'
              : comanda.metoda === 'casare'
                ? 'Anulează casarea'
                : retur?.tip === 'din_meniu'
                  ? `Am restituit ${formatLei(comanda.total)} din terminal: anulează`
                  : retur?.tip === 'nesigur'
                    ? 'Verifică returul din nou'
                    : `Anulează și restituie ${formatLei(comanda.total)}`}
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
        {comanda.metoda === 'card' &&
          (returManual ? (
            <div className="alerta avertisment" role={retur ? 'alert' : undefined}>
              {retur?.tip === 'din_meniu' && retur.mesaj ? `${retur.mesaj}. ` : ''}Faceți întâi returul de {formatLei(comanda.total)} din meniul
              terminalului, apoi confirmați anularea aici.
            </div>
          ) : retur?.tip === 'nesigur' ? (
            <>
              <div className="alerta avertisment" role="alert">
                <strong>Returul nu se poate confirma.</strong> {retur.mesaj}. Uitați-vă pe ecranul terminalului și pe chitanță, apoi apăsați
                „Verifică returul din nou”: același retur nu se trimite a doua oară.
              </div>
              <div className="doua-coloane">
                <button
                  className="buton-secundar"
                  disabled={!valid || lucreaza}
                  onClick={() => {
                    if (!window.confirm(`Terminalul arată că returul de ${formatLei(comanda.total)} s-a făcut? Se înregistrează anularea, fără alt retur.`)) return;
                    void confirma(true);
                  }}
                >
                  Terminalul arată că returul s-a făcut
                </button>
                <button
                  className="buton-secundar"
                  disabled={lucreaza}
                  onClick={() => {
                    if (!window.confirm('Terminalul arată că returul NU s-a făcut? Îl veți face din meniul terminalului.')) return;
                    setRetur({ tip: 'din_meniu', mesaj: '' });
                  }}
                >
                  Returul nu s-a făcut: îl fac din meniul terminalului
                </button>
              </div>
            </>
          ) : retur?.tip === 'refuzat' ? (
            <>
              <div className="alerta pericol" role="alert">Returul pe card nu a reușit: {retur.mesaj || 'terminalul a refuzat'}</div>
              <button className="buton-link" disabled={lucreaza} onClick={() => setRetur({ tip: 'din_meniu', mesaj: '' })}>
                Fac returul din meniul terminalului
              </button>
            </>
          ) : (
            <p className="slab mic">Suma se returnează pe card prin terminal.</p>
          ))}
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
  // Închiderea turei e semnată de barista turei: PIN-ul se cere din nou (tableta poate fi lăsată deschisă).
  const eu = app.catalog.baristi.find((b) => b.id === app.barista.id);
  const [pinConfirmat, setPinConfirmat] = useState(!eu);
  useFaraBlocare();
  const camp = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }) });
  const valori = { doze: numar(v.doze), numerar: numar(v.numerar), card: numar(v.card), anulari: numar(v.anulari), casari: numar(v.casari) };
  const valid =
    Object.values(valori).every((x) => Number.isFinite(x) && x >= 0) &&
    Number.isInteger(valori.anulari) && Number.isInteger(valori.casari) &&
    valori.doze <= LIMITE.doze && valori.numerar <= LIMITE.bani && valori.card <= LIMITE.bani &&
    valori.anulari <= LIMITE.bucati && valori.casari <= LIMITE.bucati;

  if (!pinConfirmat && eu)
    return (
      <Modal titlu="Închiderea turei" onInchide={onInchide}>
        <div className="randuri-form centrat">
          <p>
            {eu.nume}, introduceți PIN-ul ca să închideți tura.
          </p>
          <TastaturaPin verifica={(pin) => hashPin(pin, eu.sare) === eu.pin_hash} onCorect={() => setPinConfirmat(true)} />
        </div>
      </Modal>
    );

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
    if (app.echipamente.manual) return setGata('Tipăriți acum raportul Z din meniul terminalului (închiderea zilei fiscale).');
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
  const prinServer = !!app.catalog.terminal_prin_server;
  const demo = demonstratiePermisa(app.catalog);
  const [cfg, setCfg] = useState<stocare.ConfigEchipamente>({ tip: 'manual', url: 'http://127.0.0.1:8099' });
  const [test, setTest] = useState('');
  const [retrimitere, setRetrimitere] = useState<{ lucreaza: boolean; mesaj?: string; inJurnal?: number }>({ lucreaza: false });
  useEffect(() => {
    // Ce se folosește de fapt (terminalul legat în panou are întâietate), nu doar ce s-a salvat.
    void stocare.citeste('echipamente').then((c) => setCfg({ url: 'http://127.0.0.1:8099', ...c, tip: alegeEchipamente(app.catalog, c).tip }));
    void stocare.numarInJurnal().then((n) => setRetrimitere((r) => ({ ...r, inJurnal: n })));
  }, []);

  const salveaza = async () => {
    await stocare.scrie('echipamente', cfg);
    await app.reincarcaEchipamente();
  };

  const retrimite = async () => {
    if (!window.confirm('Se trimit din nou la server toate operațiunile din ultimele 7 zile. Serverul le recunoaște pe cele pe care le are deja, deci nimic nu se dublează. Continuați?')) return;
    setRetrimitere((r) => ({ ...r, lucreaza: true, mesaj: undefined }));
    try {
      const r = await app.retrimiteJurnal();
      setRetrimitere((x) => ({
        ...x,
        lucreaza: false,
        mesaj: `Trimise din nou: ${r.trimise} operațiuni${r.respinse ? ` (${r.respinse} respinse; le vede administratorul la Erori sincronizare)` : ''}.`,
      }));
    } catch (e) {
      setRetrimitere((x) => ({ ...x, lucreaza: false, mesaj: `Nu s-a putut trimite: ${(e as Error).message}` }));
    }
  };

  return (
    <Modal
      titlu="Echipamente și tabletă"
      onInchide={onInchide}
      subsol={
        <>
          <button
            className="buton-secundar"
            onClick={async () => {
              if (!prinServer) await salveaza();
              setTest('Se verifică…');
              try {
                // Instanța nouă, nu cea din contextul de dinainte de salvare.
                const s = await creeazaEchipamente(alegeEchipamente(app.catalog, cfg), () => app.config.token).verifica();
                setTest(`Terminal: ${s.terminal} · Imprimantă: ${s.imprimanta}`);
              } catch (e) {
                setTest(`Nu răspunde: ${(e as Error).message}`);
              }
            }}
          >
            {prinServer ? 'Verifică terminalul' : 'Salvează și testează'}
          </button>
          <button
            className="buton"
            onClick={async () => {
              if (!prinServer) await salveaza();
              onInchide();
            }}
          >
            {prinServer ? 'Închide' : 'Salvează'}
          </button>
        </>
      }
    >
      <div className="randuri-form">
        <div className="camp">
          <span>Legătura cu terminalul de plată și imprimanta fiscală</span>
          {prinServer ? (
            <p className="slab mic">
              <strong>Terminal fiscal prin server (POSLink).</strong> Terminalul bancar în regim fiscal (de ex. PAX A930 cu IS Fiscal) e legat
              de această tabletă în panou, la Setări → Tablete; alegerea nu se poate schimba de pe tabletă. Plata cu cardul, bonul fiscal și
              raportul Z se fac pe el. Are nevoie de internet.
            </p>
          ) : (
            <>
              <div className="lista-optiuni">
                <button className={`optiune${cfg.tip === 'manual' ? ' bifata' : ''}`} onClick={() => setCfg({ ...cfg, tip: 'manual' })}>
                  Terminal separat (fără legătură)
                </button>
                {demo && (
                  <>
                    <button className={`optiune${cfg.tip === 'punte' ? ' bifata' : ''}`} onClick={() => setCfg({ ...cfg, tip: 'punte' })}>
                      Punte locală
                    </button>
                    <button className={`optiune${cfg.tip === 'simulator' ? ' bifata' : ''}`} onClick={() => setCfg({ ...cfg, tip: 'simulator' })}>
                      Simulator (fără echipamente)
                    </button>
                  </>
                )}
              </div>
              {cfg.tip === 'manual' && (
                <p className="slab mic">
                  Suma se introduce de mână pe terminal; după fiecare vânzare tableta amintește să emiteți bonul fiscal pe terminal. Când
                  administratorul leagă terminalul de tabletă în panou (Setări → Tablete), tableta îl folosește singură.
                </p>
              )}
              {demo && cfg.tip !== 'manual' && (
                <div className="alerta avertisment">Mod demonstrație: plățile nu sunt reale, iar bonurile fiscale nu se emit.</div>
              )}
            </>
          )}
        </div>
        {!prinServer && cfg.tip === 'punte' ? (
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
        ) : !prinServer && cfg.tip === 'simulator' ? (
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
        <div className="camp">
          <span>Refacerea datelor pe server</span>
          <p className="slab mic">
            Tableta păstrează operațiunile trimise în ultimele 7 zile{retrimitere.inJurnal != null ? ` (${retrimitere.inJurnal})` : ''}. Dacă
            serverul a fost restaurat dintr-o copie de siguranță, administratorul vă poate cere să le trimiteți din nou.
          </p>
          <div>
            <button className="buton-secundar" disabled={retrimitere.lucreaza || !app.sync.online} onClick={retrimite}>
              {retrimitere.lucreaza ? 'Se trimit…' : 'Retrimite evenimentele din ultimele 7 zile'}
            </button>
          </div>
          {!app.sync.online && <p className="slab mic">Are nevoie de conexiune la server.</p>}
          {retrimitere.mesaj && <div className="alerta">{retrimitere.mesaj}</div>}
        </div>
      </div>
    </Modal>
  );
}
