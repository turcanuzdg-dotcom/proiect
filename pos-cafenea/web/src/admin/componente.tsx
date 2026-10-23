import type { ReactNode } from 'react';
import { adaugaZile, formatLei, formatNumar, formatOra, inceputZi, ziLocala } from '../comun/format';
import { useAdmin } from './context';

export function CapPagina({ titlu, subtitlu, actiuni }: { titlu: string; subtitlu?: ReactNode; actiuni?: ReactNode }) {
  return (
    <div className="cap-pagina">
      <div>
        <h1>{titlu}</h1>
        {subtitlu && <p className="slab">{subtitlu}</p>}
      </div>
      {actiuni && <div className="actiuni">{actiuni}</div>}
    </div>
  );
}

/**
 * Pentru paginile care nu se reîncarcă singure (rapoartele): momentul datelor afișate și
 * reîmprospătarea la cerere. Un raport pe o lună nu se mai recalculează la fiecare vânzare.
 */
export function Actualizat({ actualizatLa, incarcare, reincarca }: { actualizatLa: Date | null; incarcare: boolean; reincarca: () => void }) {
  return (
    <div className="actualizat slab">
      <span>{actualizatLa ? `Actualizat la ${formatOra(actualizatLa)}` : 'Se încarcă…'}</span>
      <button type="button" className="buton-link" onClick={reincarca} disabled={incarcare}>
        {incarcare ? 'Se reîmprospătează…' : 'Reîmprospătează'}
      </button>
    </div>
  );
}

/** Starea unei încărcări: eroare, prima încărcare, gol sau conținutul (estompat la reîncărcare). */
export function Stare<T>(props: {
  date: T | null;
  eroare: string | null;
  incarcare: boolean;
  gol?: (d: T) => boolean;
  mesajGol?: string;
  children: (d: T) => ReactNode;
}) {
  if (props.eroare && props.date == null) return <div className="alerta pericol">{props.eroare}</div>;
  if (props.date == null) return <div className="gol">Se încarcă…</div>;
  return (
    <div className={props.incarcare ? 'stare reincarcare' : 'stare'}>
      {props.eroare && <div className="alerta pericol">{props.eroare}</div>}
      {props.gol?.(props.date) ? <div className="gol card">{props.mesajGol ?? 'Nimic de afișat.'}</div> : props.children(props.date)}
    </div>
  );
}

export function FiltruLocatie(props: {
  valoare: number | null;
  onChange: (id: number | null) => void;
  doarPuncte?: boolean;
  faraToate?: boolean;
  eticheta?: string;
}) {
  const { locatii } = useAdmin();
  const lista = locatii.filter((l) => l.activ && (!props.doarPuncte || l.tip === 'punct'));
  return (
    <label className="camp camp-filtru">
      <span>{props.eticheta ?? 'Locația'}</span>
      <select value={props.valoare ?? ''} onChange={(e) => props.onChange(e.target.value ? Number(e.target.value) : null)}>
        {!props.faraToate && <option value="">Toate locațiile</option>}
        {lista.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nume}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Taburi<K extends string>(props: { taburi: { cheie: K; titlu: string }[]; activ: K; onChange: (k: K) => void }) {
  return (
    <div className="taburi" role="tablist">
      {props.taburi.map((t) => (
        <button
          key={t.cheie}
          type="button"
          role="tab"
          aria-selected={t.cheie === props.activ}
          className={t.cheie === props.activ ? 'tab activ' : 'tab'}
          onClick={() => props.onChange(t.cheie)}
        >
          {t.titlu}
        </button>
      ))}
    </div>
  );
}

export interface IntervalZile {
  de: string;
  pana: string;
}

/** Intervalul ales (zile locale, inclusiv) → parametrii API (ISO, sfârșit exclusiv). */
export function parametriInterval(i: IntervalZile) {
  return { de: inceputZi(i.de), pana: inceputZi(adaugaZile(i.pana, 1)) };
}

export function presetari(): { titlu: string; interval: IntervalZile }[] {
  const azi = ziLocala();
  const d = new Date();
  const primaLunii = ziLocala(new Date(d.getFullYear(), d.getMonth(), 1));
  const primaLuniiTrecute = ziLocala(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const ultimaLuniiTrecute = adaugaZile(primaLunii, -1);
  return [
    { titlu: 'Azi', interval: { de: azi, pana: azi } },
    { titlu: 'Ieri', interval: { de: adaugaZile(azi, -1), pana: adaugaZile(azi, -1) } },
    { titlu: '7 zile', interval: { de: adaugaZile(azi, -6), pana: azi } },
    { titlu: '30 de zile', interval: { de: adaugaZile(azi, -29), pana: azi } },
    { titlu: 'Luna aceasta', interval: { de: primaLunii, pana: azi } },
    { titlu: 'Luna trecută', interval: { de: primaLuniiTrecute, pana: ultimaLuniiTrecute } },
  ];
}

export function AlegeInterval({ valoare, onChange, eticheta }: { valoare: IntervalZile; onChange: (i: IntervalZile) => void; eticheta?: string }) {
  const p = presetari();
  const activ = p.find((x) => x.interval.de === valoare.de && x.interval.pana === valoare.pana);
  return (
    <div className="alege-interval">
      {eticheta && <span className="eticheta-interval">{eticheta}</span>}
      <select
        aria-label="Perioada"
        value={activ?.titlu ?? ''}
        onChange={(e) => {
          const x = p.find((y) => y.titlu === e.target.value);
          if (x) onChange(x.interval);
        }}
      >
        {!activ && <option value="">Interval ales</option>}
        {p.map((x) => (
          <option key={x.titlu} value={x.titlu}>
            {x.titlu}
          </option>
        ))}
      </select>
      <input type="date" aria-label="De la" value={valoare.de} max={valoare.pana} onChange={(e) => e.target.value && onChange({ ...valoare, de: e.target.value })} />
      <span className="slab">–</span>
      <input type="date" aria-label="Până la" value={valoare.pana} min={valoare.de} onChange={(e) => e.target.value && onChange({ ...valoare, pana: e.target.value })} />
    </div>
  );
}

export function Kpi({ eticheta, valoare, nota }: { eticheta: string; valoare: ReactNode; nota?: ReactNode }) {
  return (
    <div className="kpi">
      <span className="kpi-eticheta">{eticheta}</span>
      <span className="kpi-valoare">{valoare}</span>
      {nota && <span className="kpi-nota">{nota}</span>}
    </div>
  );
}

/** O diferență Declarat − Scriptic: minus în roșu, plus în galben (tot o abatere), zero neutru. */
export function Dif({ valoare, lei, um }: { valoare: number | null | undefined; lei?: boolean; um?: string }) {
  if (valoare == null) return <span className="slab">—</span>;
  const v = Math.round(valoare * 1000) / 1000;
  if (v === 0) return <span className="slab">0</span>;
  const text = lei ? formatLei(v) : `${formatNumar(v)}${um ? ` ${um}` : ''}`;
  return <span className={v < 0 ? 'dif-minus' : 'dif-plus'}>{v > 0 ? '+' : ''}{text}</span>;
}

export function Rand({ children }: { children: ReactNode }) {
  return <div className="bara-filtre">{children}</div>;
}
