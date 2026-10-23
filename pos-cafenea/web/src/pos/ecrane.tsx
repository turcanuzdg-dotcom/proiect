import { useEffect, useState } from 'react';
import { hashPin, LIMITE, type CatalogPOS } from '@cafenea/shared';
import { cerereJson } from '../comun/http';
import { formatOra } from '../comun/format';
import { dupaEsec, FARA_ESECURI, ramasBlocat } from './blocare';
import type { StareSync } from './sincronizare';
import * as stocare from './stocare';
import type { BaristaActiv, ConfigTableta, StareBlocarePin } from './stocare';

export function Asociere({ onAsociata, reasociere = false, onRenunta }: { onAsociata: (c: ConfigTableta) => void; reasociere?: boolean; onRenunta?: () => void }) {
  const [cod, setCod] = useState('');
  const [eroare, setEroare] = useState('');
  const [lucreaza, setLucreaza] = useState(false);

  const trimite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLucreaza(true);
    setEroare('');
    try {
      const r = await cerereJson<ConfigTableta>('/api/pos/asociere', { body: { cod } });
      onAsociata({ token: r.token, dispozitiv: r.dispozitiv });
    } catch (err) {
      setEroare((err as Error).message);
    } finally {
      setLucreaza(false);
    }
  };

  return (
    <div className="ecran-centrat">
      <form className="card cutie-ingusta randuri-form" onSubmit={trimite}>
        <h1>{reasociere ? 'Asociați din nou tableta' : 'Asociați tableta'}</h1>
        <p className="slab">
          {reasociere
            ? 'În panoul de administrare, la Setări → Tablete, cereți un cod nou pentru această tabletă. Vânzările netrimise rămân salvate și pleacă după asociere.'
            : 'În panoul de administrare, la Setări → Tablete, creați o tabletă pentru această cafenea și introduceți aici codul primit.'}
        </p>
        <label className="camp">
          <span>Cod de asociere</span>
          <input
            className="intrare-mare"
            value={cod}
            onChange={(e) => setCod(e.target.value.toUpperCase())}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
          />
        </label>
        {eroare && <div className="alerta pericol">{eroare}</div>}
        <button className="buton buton-mare" disabled={cod.length < 6 || lucreaza}>
          {lucreaza ? 'Se verifică…' : 'Asociază'}
        </button>
        {onRenunta && (
          <button type="button" className="buton-link" onClick={onRenunta}>
            Înapoi
          </button>
        )}
      </form>
    </div>
  );
}

const TASTE = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * Tastatura de PIN cu pauze după greșeli: după 5 PIN-uri greșite la rând, 30 s fără încercări, apoi
 * 60 s, 120 s… Numărătoarea stă în memoria tabletei, deci o reîncărcare a paginii nu o golește.
 * `verifica` compară local (merge și offline); `cheie` schimbată (altă baristă) golește PIN-ul tastat.
 */
export function TastaturaPin({ verifica, onCorect, cheie }: { verifica: (pin: string) => boolean; onCorect: () => void; cheie?: unknown }) {
  const [pin, setPin] = useState('');
  const [gresit, setGresit] = useState(false);
  const [blocare, setBlocare] = useState<StareBlocarePin>(FARA_ESECURI);
  const [acum, setAcum] = useState(() => Date.now());
  const ramas = ramasBlocat(blocare, acum);

  useEffect(() => {
    void stocare.citeste('pin_blocare').then((b) => b && setBlocare(b));
  }, []);
  useEffect(() => {
    setPin('');
    setGresit(false);
  }, [cheie]);
  // Numărătoarea inversă a pauzei.
  useEffect(() => {
    if (ramas <= 0) return;
    const t = window.setTimeout(() => setAcum(Date.now()), Math.min(ramas, 1000));
    return () => window.clearTimeout(t);
  }, [ramas, acum]);

  useEffect(() => {
    if (pin.length < 4) return;
    if (verifica(pin)) {
      setPin('');
      if (blocare.esecuri || blocare.blocari) void stocare.scrie('pin_blocare', FARA_ESECURI);
      onCorect();
    } else if (pin.length >= 6) {
      const urmatoare = dupaEsec(blocare, Date.now());
      setBlocare(urmatoare);
      setAcum(Date.now());
      void stocare.scrie('pin_blocare', urmatoare);
      setGresit(true);
      setPin('');
    }
    // Verificăm doar când se schimbă PIN-ul.
  }, [pin]);

  const apasa = (t: string) => {
    if (ramasBlocat(blocare, Date.now()) > 0) return;
    setGresit(false);
    if (t === '⌫') setPin((p) => p.slice(0, -1));
    else if (t && pin.length < 6) setPin((p) => p + t);
  };

  return (
    <div className="pin">
      <div className={`pin-puncte${gresit ? ' gresit' : ''}`} aria-label="PIN">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? 'plin' : ''} />
        ))}
      </div>
      {ramas > 0 ? (
        <p className="minus mic" role="alert">
          Prea multe PIN-uri greșite. Încercați din nou peste {Math.ceil(ramas / 1000)} s.
        </p>
      ) : (
        gresit && <p className="minus mic">PIN greșit</p>
      )}
      <div className="tastatura">
        {TASTE.map((t, i) =>
          t ? (
            <button key={i} className="tasta" onClick={() => apasa(t)} aria-label={t === '⌫' ? 'Șterge' : t} disabled={ramas > 0}>
              {t}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}

/** Barista își alege numele și introduce PIN-ul; verificarea se face local, deci merge și offline. */
export function Autentificare(props: {
  catalog: CatalogPOS;
  locatie: string;
  sync: StareSync;
  onIntrat: (b: BaristaActiv) => void;
}) {
  const [ales, setAles] = useState<CatalogPOS['baristi'][number] | null>(props.catalog.baristi.length === 1 ? props.catalog.baristi[0] : null);

  return (
    <div className="ecran-centrat">
      <div className="card cutie-autentificare">
        <div className="randuri-form">
          <div>
            <h1>{props.locatie}</h1>
            <p className="slab">Cine lucrează acum?</p>
          </div>
          <div className="lista-baristi">
            {props.catalog.baristi.map((b) => (
              <button key={b.id} className={ales?.id === b.id ? 'buton' : 'buton-secundar'} onClick={() => setAles(b)}>
                {b.nume}
              </button>
            ))}
            {props.catalog.baristi.length === 0 && (
              <p className="alerta avertisment">Nu există niciun barista cu PIN pentru această locație. Adăugați-l din panou.</p>
            )}
          </div>
        </div>
        {ales && (
          <TastaturaPin
            cheie={ales.id}
            verifica={(pin) => hashPin(pin, ales.sare) === ales.pin_hash}
            onCorect={() => props.onIntrat({ id: ales.id, nume: ales.nume })}
          />
        )}
      </div>
      <p className="slab mic subsol-ecran">
        {props.sync.online ? 'Conectat la server' : 'Fără internet: se lucrează local'}
        {props.sync.ultimaSincronizare && ` · ultima sincronizare ${formatOra(props.sync.ultimaSincronizare)}`}
      </p>
    </div>
  );
}

export function DeschidereTura(props: {
  barista: BaristaActiv;
  locatie: string;
  /** Motivul pentru care tura nu se poate deschide acum (de ex. ceasul tabletei e greșit). */
  blocata?: string;
  onDeschisa: (fond: number) => Promise<void> | void;
  onSchimbaUtilizator: () => void;
}) {
  const [fond, setFond] = useState('');
  const [lucreaza, setLucreaza] = useState(false);
  const valoare = Number(fond.replace(',', '.'));
  const valid = fond !== '' && Number.isFinite(valoare) && valoare >= 0 && valoare <= LIMITE.bani;
  return (
    <div className="ecran-centrat">
      <form
        className="card cutie-ingusta randuri-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || lucreaza || props.blocata) return;
          setLucreaza(true);
          try {
            await props.onDeschisa(Math.round(valoare * 100) / 100);
          } finally {
            setLucreaza(false);
          }
        }}
      >
        <div>
          <h1>Deschiderea turei</h1>
          <p className="slab">
            {props.locatie} · {props.barista.nume}
          </p>
        </div>
        <label className="camp">
          <span>Numerarul din sertar la deschidere (lei)</span>
          <input className="intrare-mare" inputMode="decimal" value={fond} onChange={(e) => setFond(e.target.value)} autoFocus placeholder="0" />
        </label>
        <p className="slab mic">Numărați banii din sertar. Dacă suma diferă de cea lăsată la tura trecută, administratorul va fi anunțat.</p>
        {props.blocata && <div className="alerta pericol">{props.blocata}</div>}
        <button className="buton buton-mare" disabled={!valid || lucreaza || !!props.blocata}>
          {lucreaza ? 'Se deschide…' : 'Deschide tura'}
        </button>
        <button type="button" className="buton-link" onClick={props.onSchimbaUtilizator}>
          Nu sunteți {props.barista.nume}? Schimbați utilizatorul
        </button>
      </form>
    </div>
  );
}
