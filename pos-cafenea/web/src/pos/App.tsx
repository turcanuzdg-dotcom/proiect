import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogPOS, EvenimentPOS } from '@cafenea/shared';
import { cerereJson } from '../comun/http';
import { uuid } from '../comun/uuid';
import { ContextAplicatie, type Aplicatie } from './context';
import { creeazaEchipamente, type Echipamente } from './echipamente';
import { Asociere, Autentificare, DeschidereTura } from './ecrane';
import { Sincronizator, type StareSync } from './sincronizare';
import * as stocare from './stocare';
import { Vanzare } from './Vanzare';

type Faza =
  | { tip: 'incarcare' }
  | { tip: 'asociere' }
  | { tip: 'fara_catalog'; eroare: string }
  | { tip: 'gata' };

export function App() {
  const [faza, setFaza] = useState<Faza>({ tip: 'incarcare' });
  const [config, setConfig] = useState<stocare.ConfigTableta>();
  const [catalog, setCatalog] = useState<CatalogPOS>();
  const [barista, setBarista] = useState<stocare.BaristaActiv>();
  const [tura, setTura] = useState<stocare.TuraLocala>();
  const [echipamente, setEchipamente] = useState<Echipamente>(() => creeazaEchipamente(undefined));
  const [sync, setSync] = useState<StareSync>({ online: navigator.onLine, inAsteptare: 0, ultimaSincronizare: null, respinse: 0, dezasociata: false });
  const [toast, setToast] = useState<{ mesaj: string; pericol?: boolean } | null>(null);
  const sincronizator = useRef<Sincronizator | null>(null);
  const catalogRef = useRef<CatalogPOS | undefined>(undefined);
  catalogRef.current = catalog;

  const anunta = useCallback((mesaj: string, pericol = false) => {
    setToast({ mesaj, pericol });
    window.setTimeout(() => setToast((t) => (t?.mesaj === mesaj ? null : t)), pericol ? 6000 : 3000);
  }, []);

  const incarcaCatalog = useCallback(async (token: string) => {
    const c = await cerereJson<CatalogPOS>('/api/pos/catalog', { token, timeout: 15_000 });
    await stocare.scrie('catalog', c);
    setCatalog(c);
    return c;
  }, []);

  const reincarcaEchipamente = useCallback(async () => {
    setEchipamente(creeazaEchipamente(await stocare.citeste('echipamente')));
  }, []);

  // Pornire: totul se citește din memoria tabletei, deci merge și fără internet.
  useEffect(() => {
    void (async () => {
      void stocare.cerePersistenta();
      await reincarcaEchipamente();
      const cfg = await stocare.citeste('config');
      if (!cfg) return setFaza({ tip: 'asociere' });
      setConfig(cfg);
      setBarista(await stocare.citeste('barista'));
      setTura(await stocare.citeste('tura'));
      const c = await stocare.citeste('catalog');
      if (c) {
        setCatalog(c);
        setFaza({ tip: 'gata' });
      } else {
        try {
          await incarcaCatalog(cfg.token);
          setFaza({ tip: 'gata' });
        } catch (e) {
          setFaza({ tip: 'fara_catalog', eroare: (e as Error).message });
        }
      }
    })();
  }, [incarcaCatalog, reincarcaEchipamente]);

  // Sincronizarea rulează cât timp tableta e asociată.
  useEffect(() => {
    if (!config) return;
    const s = new Sincronizator(
      config.token,
      () => catalogRef.current?.versiune,
      () => void incarcaCatalog(config.token).catch(() => {}),
    );
    sincronizator.current = s;
    const dezabonare = s.aboneaza(setSync);
    s.porneste();
    return () => {
      dezabonare();
      s.opreste();
    };
  }, [config, incarcaCatalog]);

  const asociata = async (cfg: stocare.ConfigTableta) => {
    await stocare.scrie('config', cfg);
    setConfig(cfg);
    try {
      await incarcaCatalog(cfg.token);
      setFaza({ tip: 'gata' });
    } catch (e) {
      setFaza({ tip: 'fara_catalog', eroare: (e as Error).message });
    }
  };

  const aplicatie = useMemo<Aplicatie | null>(() => {
    if (!config || !catalog || !barista || !tura) return null;
    return {
      config, catalog, barista, tura, echipamente, sync, anunta, reincarcaEchipamente,
      async inregistreaza(ev: EvenimentPOS, comanda?: stocare.ComandaLocala, opt?: stocare.OptiuniInregistrare) {
        await stocare.inregistreaza(ev, comanda, opt);
        await sincronizator.current?.actualizeazaNumar();
        sincronizator.current?.acum();
      },
      eveniment(tip, date) {
        return { id: uuid(), tip, la: new Date().toISOString(), date } as any;
      },
      inchideTura() {
        void stocare.sterge('tura');
        void stocare.sterge('barista');
        setTura(undefined);
        setBarista(undefined);
      },
      blocheaza() {
        void stocare.sterge('barista');
        setBarista(undefined);
      },
    };
  }, [config, catalog, barista, tura, echipamente, sync, anunta, reincarcaEchipamente]);

  let ecran;
  if (faza.tip === 'incarcare') ecran = <div className="ecran-centrat slab">Se pornește…</div>;
  else if (faza.tip === 'asociere') ecran = <Asociere onAsociata={asociata} />;
  else if (faza.tip === 'fara_catalog')
    ecran = (
      <div className="ecran-centrat">
        <div className="card cutie-ingusta randuri-form">
          <h1>Lipsește catalogul</h1>
          <p className="slab">
            La prima pornire tableta are nevoie de internet ca să descarce meniul și prețurile. După aceea poate lucra și
            offline.
          </p>
          <div className="alerta pericol">{faza.eroare}</div>
          <button className="buton" onClick={() => config && asociata(config)}>
            Încearcă din nou
          </button>
        </div>
      </div>
    );
  else if (!barista || !catalog)
    ecran = (
      <Autentificare
        catalog={catalog!}
        locatie={catalog?.locatie.nume ?? ''}
        sync={sync}
        onIntrat={async (b) => {
          await stocare.scrie('barista', b);
          setBarista(b);
        }}
      />
    );
  else if (!tura)
    ecran = (
      <DeschidereTura
        barista={barista}
        locatie={catalog.locatie.nume}
        onSchimbaUtilizator={() => {
          void stocare.sterge('barista');
          setBarista(undefined);
        }}
        onDeschisa={async (fond) => {
          const t: stocare.TuraLocala = { id: uuid(), deschisa_la: new Date().toISOString(), fond_initial: fond, deschisa_de: barista.id };
          await stocare.curataComenziVechi();
          await stocare.inregistreaza({ id: uuid(), tip: 'tura_deschisa', la: t.deschisa_la, date: { tura_id: t.id, utilizator_id: barista.id, fond_initial: fond } });
          await stocare.scrie('tura', t);
          setTura(t);
          sincronizator.current?.acum();
        }}
      />
    );
  else if (aplicatie)
    ecran = (
      <ContextAplicatie.Provider value={aplicatie}>
        <Vanzare />
      </ContextAplicatie.Provider>
    );

  return (
    <>
      {ecran}
      {sync.dezasociata && (
        <div className="banda-avertisment">
          Serverul nu mai recunoaște această tabletă (a fost dezactivată sau re-asociată). Vânzările se păstrează local;
          cereți administratorului un cod nou.
        </div>
      )}
      {toast && <div className={`toast${toast.pericol ? ' pericol' : ''}`} role="status">{toast.mesaj}</div>}
    </>
  );
}
