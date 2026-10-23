import { useState, type ReactNode } from 'react';
import { formatLei } from '@cafenea/shared';
import { calculeazaScriptic } from '../../../server/src/servicii/ture';
import { PASI, type IdPas, type IntrareJurnal, type Simulare, type StareSimulare } from './simulare';

export type Vedere = 'tejghea' | 'birou' | 'ambele';

interface Pas {
  titlu: string;
  ce: ReactNode;
  deCe: ReactNode;
  actiune?: (p: PropsGhid) => ReactNode;
}

interface PropsGhid {
  sim: Simulare;
  stare: StareSimulare;
  arata: (v: Vedere) => void;
}

const CONTINUT: Record<IdPas, Pas> = {
  tura: {
    titlu: 'Deschide tura',
    ce: (
      <>
        Pe tabletă apasă pe <b>Ana Rusu</b> și tastează PIN-ul <b>1111</b>. Scrie cât numerar e în sertar (de exemplu 500) și apasă <b>Deschide tura</b>.
      </>
    ),
    deCe: 'Fiecare vânzare se leagă de barista și de tura ei, ca seara banii să poată fi verificați pe persoană.',
  },
  numerar: {
    titlu: 'Vinde o cafea cu numerar',
    ce: (
      <>
        Apasă <b>Cappuccino</b>, alege <b>Lapte de ovăz</b>, apoi <b>Adaugă</b>. Apasă <b>Numerar</b>, alege <b>100 lei</b> și <b>Încasează</b>. Tableta arată restul,
        iar terminalul din dreapta tipărește bonul fiscal.
      </>
    ),
    deCe: 'Din stoc se scad singure, după rețetă: 18 g cafea, 150 ml lapte de ovăz în locul laptelui obișnuit, un pahar, un capac și un plic de zahăr.',
  },
  card: {
    titlu: 'Încasează cu cardul',
    ce: (
      <>
        Adaugă un <b>Latte</b> și apasă <b>Card</b>. Suma apare singură pe terminal: apasă acolo <b>Apropie cardul</b>, ca un client care plătește.
      </>
    ),
    deCe: 'Barista nu tastează suma pe terminal, deci nu poate greși. Bonul fiscal, cu datele plății, iese pe același aparat.',
  },
  casare: {
    titlu: 'Casează o cafea',
    ce: (
      <>
        Pune un produs în coș, apasă <b>Casare (fără încasare)</b>, alege <b>Cafeaua personalului</b> și apoi <b>Scade din stoc</b>.
      </>
    ),
    deCe: 'Nu intră bani, dar ingredientele ies din stoc și cafeaua apare în raportul de pierderi, cu motivul ei.',
  },
  panou: {
    titlu: 'Uită-te în birou',
    ce: (
      <>
        Deschide <b>Biroul</b>. Pe <b>Panou</b> vezi vânzările de azi; la <b>Stocuri</b>, pentru Cafenea Centru, cafeaua și laptele au scăzut deja.
      </>
    ),
    deCe: 'Nimeni n-a apăsat „trimite”: tableta a trimis singură, iar panoul s-a reîmprospătat singur.',
    actiune: ({ arata }) => (
      <button className="buton-ghid" onClick={() => arata('birou')}>
        Deschide biroul
      </button>
    ),
  },
  offline: {
    titlu: 'Taie internetul tabletei',
    ce: (
      <>
        Oprește <b>Wi-Fi tabletă</b> (butonul de sus) și mai vinde două produse <b>cu numerar</b>. Tableta lucrează mai departe; biroul nu le vede încă.
      </>
    ),
    deCe: 'Cu terminalul prin POSLink, cardul și bonul fiscal trec prin internet. Fără internet se încasează numerar, iar bonul se tipărește din Meniu → Istoric comenzi după ce revine legătura.',
    actiune: ({ sim, stare }) =>
      stare.internet ? (
        <button className="buton-ghid" onClick={() => sim.seteazaInternet(false)}>
          Oprește Wi-Fi-ul tabletei
        </button>
      ) : null,
  },
  sincronizare: {
    titlu: 'Pornește internetul la loc',
    ce: <>Pornește Wi-Fi-ul. În câteva secunde vânzările făcute fără internet ajung în birou, cu ora lor reală.</>,
    deCe: 'Tableta păstrează operațiile cel puțin o zi întreagă și le trimite în ordine, o singură dată fiecare. Nu se pierde și nu se dublează nimic.',
    actiune: ({ sim, stare }) =>
      !stare.internet ? (
        <button className="buton-ghid" onClick={() => sim.seteazaInternet(true)}>
          Pornește Wi-Fi-ul tabletei
        </button>
      ) : null,
  },
  inchidere: {
    titlu: 'Închide tura',
    ce: (
      <>
        Pe tabletă: <b>Meniu → Închide tura</b> și confirmă cu PIN-ul. Scrie dozele de pe contorul râșniței, numerarul numărat, totalul de card și câte produse ai anulat sau casat. Încearcă
        să scrii intenționat cu 10 lei mai puțin la numerar.
      </>
    ),
    deCe: 'Barista nu vede cât „ar trebui” să fie: serverul compară singur și trimite adminului diferențele peste toleranță (la Ture, în birou).',
    actiune: (p) => <Fituica {...p} />,
  },
  rapoarte: {
    titlu: 'Rapoartele',
    ce: (
      <>
        În birou, la <b>Rapoarte</b>: compară două perioade, vezi consumul de materie primă pe fiecare cafenea (kg, l, buc) și pierderile.
      </>
    ),
    deCe: 'Istoricul de 120 de zile e generat, ca să ai ce compara (de exemplu Iced Coffee vara față de toamnă).',
    actiune: ({ arata }) => (
      <button className="buton-ghid" onClick={() => arata('birou')}>
        Deschide biroul
      </button>
    ),
  },
};

/** Valorile corecte la închidere, ca utilizatorul simulării să poată greși intenționat. Barista nu le vede. */
function Fituica({ sim }: PropsGhid) {
  const [valori, setValori] = useState<{ doze: number; numerar: number; card: number; anulari: number; casari: number } | null>(null);
  const [mesaj, setMesaj] = useState('');
  const calculeaza = async () => {
    const { db, centru } = sim.server;
    const [t] = await db.query<{ id: string }>('SELECT id FROM ture WHERE locatie_id = $1 AND inchisa_la IS NULL ORDER BY deschisa_la DESC LIMIT 1', [centru.dispozitiv.locatie_id]);
    if (!t) return setMesaj('Nu e nicio tură deschisă la Cafenea Centru (sau tableta n-a trimis-o încă).');
    const s = await calculeazaScriptic(db, t.id, centru.dispozitiv.locatie_id, new Date().toISOString());
    setValori({ doze: s.scriptic_doze, numerar: s.scriptic_numerar, card: s.scriptic_card, anulari: s.scriptic_anulari, casari: s.scriptic_casari });
    setMesaj('');
  };
  return (
    <div className="fituica">
      <button className="buton-ghid buton-ghid-slab" onClick={() => void calculeaza()}>
        {valori ? 'Recalculează' : 'Arată cât ar trebui să iasă'}
      </button>
      {mesaj && <p className="mic">{mesaj}</p>}
      {valori && (
        <dl>
          <dt>Doze</dt>
          <dd>{valori.doze}</dd>
          <dt>Numerar</dt>
          <dd>{formatLei(valori.numerar)}</dd>
          <dt>Card</dt>
          <dd>{formatLei(valori.card)}</dd>
          <dt>Anulate</dt>
          <dd>{valori.anulari}</dd>
          <dt>Casate</dt>
          <dd>{valori.casari}</dd>
        </dl>
      )}
      {valori && <p className="mic">Doar în simulare. Pe tableta reală barista nu vede aceste cifre.</p>}
    </div>
  );
}

export function Ghid(p: PropsGhid) {
  const curent = PASI.find((id) => p.stare.facute[id] === undefined);
  const [deschis, setDeschis] = useState<IdPas | null>(null);
  const facute = PASI.filter((id) => p.stare.facute[id] !== undefined).length;
  return (
    <section className="ghid" aria-label="Pașii simulării">
      <div className="ghid-cap">
        <h2>Încearcă pe rând</h2>
        <span className="ghid-scor">
          {facute} din {PASI.length}
        </span>
      </div>
      <ol className="pasi">
        {PASI.map((id, i) => {
          const pas = CONTINUT[id];
          const facut = p.stare.facute[id] !== undefined;
          const extins = id === curent || id === deschis;
          return (
            <li key={id} className={`pas${facut ? ' pas-facut' : ''}${id === curent ? ' pas-curent' : ''}`}>
              <button className="pas-titlu" aria-expanded={extins} onClick={() => setDeschis(deschis === id ? null : id)}>
                <span className="pas-nr" aria-hidden="true">
                  {facut ? '✓' : i + 1}
                </span>
                <span>{pas.titlu}</span>
              </button>
              {facut && p.stare.facute[id] && <p className="pas-nota">{p.stare.facute[id]}</p>}
              {extins && (
                <div className="pas-corp">
                  <p>{pas.ce}</p>
                  <p className="pas-dece">{pas.deCe}</p>
                  {pas.actiune?.(p)}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!curent && <p className="ghid-final">Ai parcurs tot fluxul. Mai poți încerca: inventarierea pe tabletă, o recepție de marfă în depozit, un transfer între cafenele sau o anulare cu retur pe card.</p>}
    </section>
  );
}

const ETICHETE_ACTOR: Record<IntrareJurnal['actor'], string> = {
  tableta: 'Tableta',
  terminal: 'Terminal',
  server: 'Server',
  panou: 'Birou',
  botanica: 'Botanica',
  simulare: 'Simulare',
};

export function Jurnal({ intrari }: { intrari: IntrareJurnal[] }) {
  return (
    <section className="jurnal" aria-label="Ce se întâmplă">
      <h2>Ce se întâmplă</h2>
      <ol aria-live="polite">
        {intrari.map((j) => (
          <li key={j.id} className={j.ton ? `jurnal-${j.ton}` : undefined}>
            <span className={`actor actor-${j.actor}`}>{ETICHETE_ACTOR[j.actor]}</span>
            <span className="jurnal-text">{j.text}</span>
            <time>{j.ora}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
