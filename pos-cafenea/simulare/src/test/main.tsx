// Previzualizarea pe tabletă: programul real, cu meniul de pornire Urban Coffee, care rulează direct
// în browser și păstrează ce se vinde. Tejgheaua (aplicația POS) și biroul (panoul) pe același aparat.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PunteSimulare, SursaCerere } from '../punte-tipuri';
import { pornesteServer, stergeDatePastrate, type Progres, type ServerSim } from '../server/pornire';
import { Cadru } from '../coaja/componente';

const PERSISTENTA = 'urban-coffee-test';
const radacina = createRoot(document.getElementById('simulare')!);

function Incarcare({ progres, eroare }: { progres: Progres; eroare?: string }) {
  return (
    <div className="incarcare">
      <div className="incarcare-card">
        <h1>Urban Coffee · previzualizare</h1>
        <p>Programul de casă rulează direct pe acest aparat. Prima deschidere descarcă în jur de 15 MB; apoi pornește mai repede.</p>
        {eroare ? (
          <div className="incarcare-eroare" role="alert">
            <strong>Previzualizarea nu a putut porni.</strong>
            <span>{eroare}</span>
            <span>Deschideți linkul în Chrome actualizat.</span>
          </div>
        ) : (
          <>
            <div className="bara-progres" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progres.procent * 100)}>
              <div style={{ width: `${Math.round(progres.procent * 100)}%` }} />
            </div>
            <p className="mic">{progres.faza}</p>
          </>
        )}
      </div>
    </div>
  );
}

function Previzualizare({ proaspat }: { proaspat: boolean }) {
  const [vedere, setVedere] = useState<SursaCerere>('pos');
  const [confirmare, setConfirmare] = useState(false);
  const sterge = async () => {
    await stergeDatePastrate(PERSISTENTA);
    await new Promise<void>((gata) => {
      const r = indexedDB.deleteDatabase('pos-cafenea');
      r.onsuccess = r.onerror = r.onblocked = () => gata();
    });
    location.reload();
  };
  return (
    <div className="test">
      <header className="bara test-bara">
        <div className="marca">
          <span className="marca-nume">Urban Coffee</span>
          <span className="marca-sub">previzualizare · date de test{proaspat ? ' · pornire nouă' : ''}</span>
        </div>
        <nav className="vederi" aria-label="Ce se vede">
          <button className="vedere" aria-pressed={vedere === 'pos'} onClick={() => setVedere('pos')}>
            Tejghea
          </button>
          <button className="vedere" aria-pressed={vedere === 'admin'} onClick={() => setVedere('admin')}>
            Birou
          </button>
        </nav>
        {confirmare ? (
          <div className="comenzi">
            <span className="mic">Se șterg toate vânzările de test.</span>
            <button className="buton-ghid" onClick={() => void sterge()}>
              Da, șterge
            </button>
            <button className="buton-ghid buton-ghid-slab" onClick={() => setConfirmare(false)}>
              Renunț
            </button>
          </div>
        ) : (
          <button className="buton-ghid buton-ghid-slab" onClick={() => setConfirmare(true)}>
            Șterge datele de test
          </button>
        )}
      </header>
      <main className="test-scena">
        <div className="test-cadru" hidden={vedere !== 'pos'}>
          <Cadru aplicatie="pos" titlu="Tableta de la tejghea" />
        </div>
        <div className="test-cadru" hidden={vedere !== 'admin'}>
          <Cadru aplicatie="admin" titlu="Panoul de administrare" />
        </div>
      </main>
    </div>
  );
}

function punte(server: ServerSim): PunteSimulare {
  const pornite = new Set<SursaCerere>();
  return {
    cerere: (c) => server.ruter.trateaza(c.metoda, c.url, { authorization: c.autorizare ?? undefined, 'content-type': 'application/json' }, c.corp),
    flux: (bilet, laMesaj) => server.flux(bilet, laMesaj),
    tableta: server.centru,
    tokenAdmin: server.tokenAdmin,
    // Memoria tabletei se golește doar când și baza a pornit de la zero; altfel coada și tura rămân.
    primaPornire: (sursa) => server.proaspat && !pornite.has(sursa) && !!pornite.add(sursa),
    pregatit: () => {},
  };
}

async function porneste() {
  let progres: Progres = { faza: 'Pornește…', procent: 0 };
  radacina.render(<Incarcare progres={progres} />);
  try {
    void navigator.storage?.persist?.();
    const server = await pornesteServer(
      (p) => {
        progres = p;
        radacina.render(<Incarcare progres={p} />);
      },
      { arhiva: 'date-test.txt', persistenta: PERSISTENTA, terminalSimulat: false },
    );
    (window as unknown as { __sim: unknown }).__sim = punte(server);
    radacina.render(<Previzualizare proaspat={server.proaspat} />);
  } catch (e) {
    console.error(e);
    radacina.render(<Incarcare progres={progres} eroare={(e as Error).message || String(e)} />);
  }
}

void porneste();
