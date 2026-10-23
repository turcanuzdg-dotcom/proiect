import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogPOS, EvenimentPOS } from '@cafenea/shared';
import { cerereJson } from '../comun/http';
import { uuid } from '../comun/uuid';
import { actualizare } from './actualizare';
import { ContextAplicatie, type Aplicatie } from './context';
import { creeazaEchipamente, type Echipamente } from './echipamente';
import { Asociere, Autentificare, DeschidereTura } from './ecrane';
import { ceasGresit, Sincronizator, STARE_SYNC_INITIALA, type StareSync } from './sincronizare';
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
  const [sync, setSync] = useState<StareSync>(STARE_SYNC_INITIALA);
  const [toast, setToast] = useState<{ mesaj: string; pericol?: boolean } | null>(null);
  const [reasociere, setReasociere] = useState(false);
  const [actualizareGata, setActualizareGata] = useState(actualizare.disponibila);
  const sincronizator = useRef<Sincronizator | null>(null);
  const catalogRef = useRef<CatalogPOS | undefined>(undefined);
  catalogRef.current = catalog;
  const configRef = useRef<stocare.ConfigTableta | undefined>(undefined);
  configRef.current = config;
  const tokenTableta = useCallback(() => configRef.current?.token, []);

  const anunta = useCallback((mesaj: string, pericol = false) => {
    setToast({ mesaj, pericol });
    window.setTimeout(() => setToast((t) => (t?.mesaj === mesaj ? null : t)), pericol ? 6000 : 3000);
  }, []);

  const incarcaCatalog = useCallback(async (token: string) => {
    const c = await cerereJson<CatalogPOS & { terminal_prin_server?: boolean }>('/api/pos/catalog', { token, timeout: 15_000 });
    await stocare.scrie('catalog', c);
    setCatalog(c);
    // Tableta are un terminal fiscal legat în panou și nu s-a ales nimic aici: îl folosim din oficiu.
    if (c.terminal_prin_server && !(await stocare.citeste('echipamente'))) {
      await stocare.scrie('echipamente', { tip: 'server', url: '' });
      setEchipamente(creeazaEchipamente({ tip: 'server', url: '' }, tokenTableta));
    }
    return c;
  }, [tokenTableta]);

  const reincarcaEchipamente = useCallback(async () => {
    setEchipamente(creeazaEchipamente(await stocare.citeste('echipamente'), tokenTableta));
  }, [tokenTableta]);

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

  // Versiunea nouă se aplică doar pe ecranul de PIN, când nu e nimic în lucru.
  useEffect(() => actualizare.aboneaza(() => setActualizareGata(true)), []);
  useEffect(() => {
    if (actualizareGata && faza.tip === 'gata' && !barista) actualizare.aplica();
  }, [actualizareGata, faza, barista]);

  const asociata = async (cfg: stocare.ConfigTableta) => {
    // Re-asocierea păstrează coada de evenimente netrimise: pleacă cu tokenul nou.
    await stocare.scrie('config', cfg);
    setConfig(cfg);
    setReasociere(false);
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
  else if (reasociere) ecran = <Asociere onAsociata={asociata} reasociere onRenunta={() => setReasociere(false)} />;
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
        // Cu ceasul greșit, ora deschiderii (și a vânzărilor din tură) ar fi greșită: întâi se corectează ceasul.
        blocata={ceasGresit(sync) ? 'Ora tabletei diferă de cea a serverului. Corectați ceasul (vezi mesajul de sus), apoi deschideți tura.' : undefined}
        onSchimbaUtilizator={() => {
          void stocare.sterge('barista');
          setBarista(undefined);
        }}
        onDeschisa={async (fond) => {
          const t: stocare.TuraLocala = { id: uuid(), deschisa_la: new Date().toISOString(), fond_initial: fond, deschisa_de: barista.id };
          // Evenimentul și tura locală, în aceeași tranzacție.
          await stocare.inregistreaza(
            { id: uuid(), tip: 'tura_deschisa', la: t.deschisa_la, date: { tura_id: t.id, utilizator_id: barista.id, fond_initial: fond } },
            undefined,
            { deschideTura: t },
          );
          setTura(t);
          sincronizator.current?.acum();
          void stocare.curataComenziVechi();
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
      {ceasGresit(sync) && (
        <div className="banda-avertisment" role="alert">
          Ceasul tabletei este {sync.decalajCeas! > 0 ? 'în urma' : 'înaintea'} serverului cu {descrieDecalaj(Math.abs(sync.decalajCeas!))}. Deschideți
          Setări → Dată și oră pe tabletă și activați „Data și ora automate” (și fusul orar automat). Până atunci nu se
          poate deschide o tură nouă; vânzările unei ture deschise se păstrează, dar ora lor va fi greșită.
        </div>
      )}
      {sync.dezasociata && !reasociere && (
        <div className="banda-avertisment">
          Serverul nu mai recunoaște această tabletă (a fost dezactivată sau i s-a dat un cod nou). Vânzările se păstrează
          local și se trimit după re-asociere.
          <button className="buton-secundar" onClick={() => setReasociere(true)}>
            Asociază din nou
          </button>
        </div>
      )}
      {toast && <div className={`toast${toast.pericol ? ' pericol' : ''}`} role="status">{toast.mesaj}</div>}
    </>
  );
}

function descrieDecalaj(ms: number): string {
  const minute = Math.round(ms / 60_000);
  if (minute < 120) return `${minute} minute`;
  const ore = Math.round(minute / 60);
  return ore < 48 ? `${ore} ore` : `${Math.round(ore / 24)} zile`;
}
