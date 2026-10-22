// Pagina simulării: pornește serverul în browser, apoi arată tableta, terminalul și biroul.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { pornesteServer, type Progres } from '../server/pornire';
import { Cadru, Scalat } from './componente';
import { Ghid, Jurnal, type Vedere } from './Ghid';
import { Simulare } from './simulare';
import { TerminalPAX } from './TerminalPAX';

const radacina = createRoot(document.getElementById('simulare')!);

function Incarcare({ progres, eroare }: { progres: Progres; eroare?: string }) {
  return (
    <div className="incarcare">
      <div className="incarcare-card">
        <h1>Cafeneaua, în browser</h1>
        <p>
          Aici rulează programul adevărat: serverul cu baza de date, aplicația de pe tabletă și panoul de administrare. Prima pornire descarcă în jur de 20 MB; nu se
          instalează nimic.
        </p>
        {eroare ? (
          <div className="incarcare-eroare" role="alert">
            <strong>Simularea nu a putut porni.</strong>
            <span>{eroare}</span>
            <span>Încearcă într-un Chrome, Edge sau Safari actualizat, pe calculator.</span>
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

function Coaja({ sim }: { sim: Simulare }) {
  const stare = useSyncExternalStore(sim.aboneaza, sim.citeste);
  const [vedere, setVedere] = useState<Vedere>(() => (window.innerWidth >= 1800 ? 'ambele' : 'tejghea'));
  const [ghidDeschis, setGhidDeschis] = useState(() => window.innerWidth >= 1100);
  const [vazuteInBirou, setVazuteInBirou] = useState(0);
  const noutatiBirou = stare.jurnal.filter((j) => j.actor === 'server' || j.actor === 'botanica').length;
  if (vedere !== 'tejghea' && vazuteInBirou !== noutatiBirou) setVazuteInBirou(noutatiBirou);
  const necitite = vedere === 'tejghea' ? noutatiBirou - vazuteInBirou : 0;

  useEffect(() => {
    if (vedere !== 'tejghea') sim.biroulLaVedere();
  }, [vedere, sim, stare.facute]);

  // Când terminalul așteaptă cardul, tejgheaua trebuie să fie la vedere.
  useEffect(
    () =>
      sim.server.terminal.aboneaza(() => {
        if (sim.server.terminal.citeste().ecran.tip === 'plata') setVedere((v) => (v === 'birou' ? 'tejghea' : v));
      }),
    [sim],
  );

  const vederi: [Vedere, string][] = [
    ['tejghea', 'Tejghea'],
    ['birou', 'Birou'],
    ['ambele', 'Amândouă'],
  ];
  return (
    <div className="coaja">
      <header className="bara">
        <div className="marca">
          <span className="marca-nume">Cafeneaua, simulată</span>
          <span className="marca-sub">tabletă · terminal · birou</span>
        </div>
        <nav className="vederi" aria-label="Ce se vede">
          {vederi.map(([v, eticheta]) => (
            <button key={v} className="vedere" aria-pressed={vedere === v} onClick={() => setVedere(v)}>
              {eticheta}
              {v === 'birou' && necitite > 0 && <span className="insigna">{necitite}</span>}
            </button>
          ))}
        </nav>
        <div className="comenzi">
          <button className={`comutator${stare.internet ? '' : ' comutator-oprit'}`} aria-pressed={stare.internet} onClick={() => sim.seteazaInternet(!stare.internet)}>
            <span className="led" aria-hidden="true" />
            Wi-Fi tabletă: {stare.internet ? 'pornit' : 'oprit'}
            {!stare.internet && stare.inTableta > 0 && <span className="insigna">{stare.inTableta} în tabletă</span>}
          </button>
          <label className="bifa">
            <input id="botanica" type="checkbox" checked={stare.botanica} onChange={(e) => sim.seteazaBotanica(e.target.checked)} />
            Botanica vinde în fundal
          </label>
          <button className="buton-ghid buton-ghid-slab" onClick={() => setGhidDeschis(!ghidDeschis)} aria-expanded={ghidDeschis}>
            {ghidDeschis ? 'Ascunde ghidul' : 'Ghidul'}
          </button>
          <button className="buton-ghid buton-ghid-slab" onClick={() => location.reload()}>
            Ia de la capăt
          </button>
        </div>
      </header>
      <main className={`scena${ghidDeschis ? '' : ' fara-ghid'}`}>
        {ghidDeschis && (
          <aside className="lateral">
            <Ghid sim={sim} stare={stare} arata={setVedere} />
            <Jurnal intrari={stare.jurnal} />
          </aside>
        )}
        <div className={`spatiu spatiu-${vedere}`}>
          <section className="zona zona-tejghea" aria-label="Tejgheaua: tableta și terminalul">
            <div className="loc-tableta">
              <Scalat latime={1068} inaltime={764} margine={14} clasa="aparat-tableta">
                <div className="tableta">
                  <Cadru aplicatie="pos" titlu="Tableta de la tejghea" />
                </div>
              </Scalat>
            </div>
            <div className="loc-pax">
              <TerminalPAX terminal={sim.server.terminal} />
            </div>
          </section>
          <section className="zona zona-birou" aria-label="Biroul: panoul de administrare">
            <Scalat latime={1180} scaraMinima={0.55} margine={4} clasa="aparat-birou">
              <div className="fereastra">
                <div className="fereastra-bara" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <span>Panoul de administrare · rețeaua de cafenele</span>
                </div>
                <Cadru aplicatie="admin" titlu="Panoul de administrare" />
              </div>
            </Scalat>
          </section>
        </div>
      </main>
    </div>
  );
}

async function porneste() {
  let progres: Progres = { faza: 'Pornește…', procent: 0 };
  radacina.render(<Incarcare progres={progres} />);
  try {
    if (typeof WebAssembly === 'undefined') throw new Error('Browserul nu are WebAssembly, de care are nevoie baza de date.');
    const server = await pornesteServer((p) => {
      progres = p;
      radacina.render(<Incarcare progres={p} />);
    });
    const sim = new Simulare(server);
    (window as unknown as { __sim: unknown }).__sim = sim.punte();
    await sim.porneste();
    radacina.render(<Coaja sim={sim} />);
  } catch (e) {
    console.error(e);
    radacina.render(<Incarcare progres={progres} eroare={(e as Error).message || String(e)} />);
  }
}

void porneste();
