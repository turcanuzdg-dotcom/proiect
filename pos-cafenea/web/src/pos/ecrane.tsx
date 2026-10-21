import { useEffect, useState } from 'react';
import { hashPin, type CatalogPOS } from '@cafenea/shared';
import { cerereJson } from '../comun/http';
import { formatOra } from '../comun/format';
import type { StareSync } from './sincronizare';
import type { BaristaActiv, ConfigTableta } from './stocare';

export function Asociere({ onAsociata }: { onAsociata: (c: ConfigTableta) => void }) {
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
        <h1>Asociați tableta</h1>
        <p className="slab">
          În panoul de administrare, la Setări → Tablete, creați o tabletă pentru această cafenea și introduceți aici codul
          primit.
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
      </form>
    </div>
  );
}

const TASTE = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/** Barista își alege numele și introduce PIN-ul; verificarea se face local, deci merge și offline. */
export function Autentificare(props: {
  catalog: CatalogPOS;
  locatie: string;
  sync: StareSync;
  onIntrat: (b: BaristaActiv) => void;
}) {
  const [ales, setAles] = useState<CatalogPOS['baristi'][number] | null>(props.catalog.baristi.length === 1 ? props.catalog.baristi[0] : null);
  const [pin, setPin] = useState('');
  const [gresit, setGresit] = useState(false);

  const { onIntrat } = props;
  useEffect(() => {
    if (!ales || pin.length < 4) return;
    if (hashPin(pin, ales.sare) === ales.pin_hash) {
      onIntrat({ id: ales.id, nume: ales.nume });
    } else if (pin.length >= 6) {
      setGresit(true);
      setPin('');
    }
    // Verificăm doar când se schimbă PIN-ul sau barista aleasă.
  }, [pin, ales]);

  const apasa = (t: string) => {
    setGresit(false);
    if (t === '⌫') setPin((p) => p.slice(0, -1));
    else if (t && pin.length < 6) setPin((p) => p + t);
  };

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
              <button
                key={b.id}
                className={ales?.id === b.id ? 'buton' : 'buton-secundar'}
                onClick={() => {
                  setAles(b);
                  setPin('');
                  setGresit(false);
                }}
              >
                {b.nume}
              </button>
            ))}
            {props.catalog.baristi.length === 0 && (
              <p className="alerta avertisment">Nu există niciun barista cu PIN pentru această locație. Adăugați-l din panou.</p>
            )}
          </div>
        </div>
        {ales && (
          <div className="pin">
            <div className={`pin-puncte${gresit ? ' gresit' : ''}`} aria-label="PIN">
              {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
                <span key={i} className={i < pin.length ? 'plin' : ''} />
              ))}
            </div>
            {gresit && <p className="minus mic">PIN greșit</p>}
            <div className="tastatura">
              {TASTE.map((t, i) =>
                t ? (
                  <button key={i} className="tasta" onClick={() => apasa(t)} aria-label={t === '⌫' ? 'Șterge' : t}>
                    {t}
                  </button>
                ) : (
                  <span key={i} />
                ),
              )}
            </div>
          </div>
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
  onDeschisa: (fond: number) => void;
  onSchimbaUtilizator: () => void;
}) {
  const [fond, setFond] = useState('');
  const valoare = Number(fond.replace(',', '.'));
  const valid = fond !== '' && Number.isFinite(valoare) && valoare >= 0;
  return (
    <div className="ecran-centrat">
      <form
        className="card cutie-ingusta randuri-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) props.onDeschisa(Math.round(valoare * 100) / 100);
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
        <button className="buton buton-mare" disabled={!valid}>
          Deschide tura
        </button>
        <button type="button" className="buton-link" onClick={props.onSchimbaUtilizator}>
          Nu sunteți {props.barista.nume}? Schimbați utilizatorul
        </button>
      </form>
    </div>
  );
}
