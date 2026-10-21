import { useEffect, useState, type ComponentType } from 'react';
import { api, candSesiuneaExpira, citesteToken, salveazaToken } from './api';
import { FurnizorAdmin, useAdmin } from './context';
import { Autentificare } from './pagini/Autentificare';
import { PaginaBani } from './pagini/Bani';
import { PaginaComenzi } from './pagini/Comenzi';
import { PaginaInventarieri } from './pagini/Inventarieri';
import { PaginaPanou } from './pagini/Panou';
import { PaginaRapoarte } from './pagini/Rapoarte';
import { PaginaReceptii } from './pagini/Receptii';
import { PaginaRetetar } from './pagini/Retetar';
import { PaginaSetari } from './pagini/Setari';
import { PaginaStocuri } from './pagini/Stocuri';
import { PaginaTransferuri } from './pagini/Transferuri';
import { PaginaTure } from './pagini/Ture';

export interface PropsPagina {
  /** Segmentele de după numele paginii în adresă (#/rapoarte/comparatie → ['comparatie']). */
  sub: string[];
  navigheaza: (cale: string) => void;
}

const PAGINI: { cheie: string; titlu: string; grup: string; Componenta: ComponentType<PropsPagina> }[] = [
  { cheie: 'panou', titlu: 'Panou', grup: 'Azi', Componenta: PaginaPanou },
  { cheie: 'comenzi', titlu: 'Vânzări', grup: 'Azi', Componenta: PaginaComenzi },
  { cheie: 'ture', titlu: 'Ture și închideri', grup: 'Azi', Componenta: PaginaTure },
  { cheie: 'stocuri', titlu: 'Stocuri', grup: 'Gestiune', Componenta: PaginaStocuri },
  { cheie: 'receptii', titlu: 'Recepții', grup: 'Gestiune', Componenta: PaginaReceptii },
  { cheie: 'transferuri', titlu: 'Transferuri', grup: 'Gestiune', Componenta: PaginaTransferuri },
  { cheie: 'inventarieri', titlu: 'Inventarieri', grup: 'Gestiune', Componenta: PaginaInventarieri },
  { cheie: 'bani', titlu: 'Bani', grup: 'Gestiune', Componenta: PaginaBani },
  { cheie: 'retetar', titlu: 'Rețetar', grup: 'Configurare', Componenta: PaginaRetetar },
  { cheie: 'rapoarte', titlu: 'Rapoarte', grup: 'Analiză', Componenta: PaginaRapoarte },
  { cheie: 'setari', titlu: 'Setări', grup: 'Configurare', Componenta: PaginaSetari },
];

function citesteRuta(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function App() {
  const [token, setToken] = useState(citesteToken());
  const [utilizator, setUtilizator] = useState<{ nume: string } | null>(null);

  useEffect(() => {
    candSesiuneaExpira(() => setToken(null));
  }, []);

  useEffect(() => {
    if (!token) return;
    api.get('/api/auth/eu').then(setUtilizator).catch(() => {});
  }, [token]);

  if (!token) {
    return (
      <Autentificare
        onIntrare={(t, u) => {
          salveazaToken(t);
          setUtilizator(u);
          setToken(t);
        }}
      />
    );
  }

  return (
    <FurnizorAdmin key={token}>
      <Cadru
        utilizator={utilizator?.nume ?? ''}
        onIesire={async () => {
          await api.post('/api/auth/logout').catch(() => {});
          salveazaToken(null);
          setToken(null);
        }}
      />
    </FurnizorAdmin>
  );
}

function Cadru({ utilizator, onIesire }: { utilizator: string; onIesire: () => void }) {
  const [ruta, setRuta] = useState(citesteRuta);
  const { live } = useAdmin();

  useEffect(() => {
    const laSchimbare = () => setRuta(citesteRuta());
    window.addEventListener('hashchange', laSchimbare);
    return () => window.removeEventListener('hashchange', laSchimbare);
  }, []);

  const pagina = PAGINI.find((p) => p.cheie === ruta[0]) ?? PAGINI[0];
  const navigheaza = (cale: string) => {
    window.location.hash = `#/${cale}`;
  };
  useEffect(() => {
    document.title = `${pagina.titlu} · Administrare cafenea`;
  }, [pagina]);

  const grupuri = [...new Set(PAGINI.map((p) => p.grup))];
  return (
    <div className="cadru">
      <aside className="meniu">
        <div className="marca">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Cafenea</span>
          <span className={live ? 'indicator-live activ' : 'indicator-live'} title={live ? 'Actualizare în timp real' : 'Fără legătură în timp real'}>
            {live ? 'live' : 'offline'}
          </span>
        </div>
        <nav>
          {grupuri.map((g) => (
            <div key={g} className="meniu-grup">
              <span className="meniu-grup-titlu">{g}</span>
              {PAGINI.filter((p) => p.grup === g).map((p) => (
                <a key={p.cheie} href={`#/${p.cheie}`} className={p === pagina ? 'activ' : undefined} aria-current={p === pagina ? 'page' : undefined}>
                  {p.titlu}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="meniu-jos">
          <span className="slab mic">{utilizator}</span>
          <button type="button" className="buton-link mic" onClick={onIesire}>
            Ieșire
          </button>
        </div>
      </aside>
      <main className="continut">
        <pagina.Componenta key={pagina.cheie} sub={ruta.slice(1)} navigheaza={navigheaza} />
      </main>
    </div>
  );
}
