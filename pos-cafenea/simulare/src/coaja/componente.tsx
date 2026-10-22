import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** Mărimea disponibilă a unui element, urmărită la redimensionare. */
function useMarime<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [marime, setMarime] = useState({ latime: 0, inaltime: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setMarime({ latime: e.contentRect.width, inaltime: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, marime] as const;
}

/**
 * Un aparat desenat la mărimea lui reală (în pixeli CSS) și micșorat cât să încapă.
 * `inaltime` lipsă = aparatul ia toată înălțimea disponibilă (panoul, într-o fereastră de browser).
 * Sub `scaraMinima` nu se mai micșorează: aplicația se întinde pe tot spațiul, ca pe un telefon.
 */
export function Scalat({ latime, inaltime, scaraMinima = 0.5, margine = 0, clasa, children }: { latime: number; inaltime?: number; scaraMinima?: number; margine?: number; clasa?: string; children: ReactNode }) {
  const [ref, marime] = useMarime<HTMLDivElement>();
  // `margine`: loc liber de jur împrejur, pentru umbra aparatului.
  const loc = { latime: Math.max(0, marime.latime - 2 * margine), inaltime: Math.max(0, marime.inaltime - 2 * margine) };
  const scara = loc.latime ? Math.min(1, loc.latime / latime, inaltime ? loc.inaltime / inaltime : 1) : 0;
  const fluid = scara > 0 && scara < scaraMinima;
  const h = inaltime ?? (scara ? loc.inaltime / scara : 0);
  // Aceeași structură în ambele moduri: un cadru mutat în altă parte a paginii s-ar reîncărca.
  const cutie = fluid ? { width: '100%', height: '100%' } : { width: latime * scara, height: h * scara, visibility: scara ? ('visible' as const) : ('hidden' as const) };
  const interior = fluid ? { width: '100%', height: '100%' } : { width: latime, height: h, transform: `scale(${scara})` };
  return (
    <div ref={ref} className={`scalat${fluid ? ' scalat-fluid' : ''} ${clasa ?? ''}`}>
      <div className="scalat-cutie" style={cutie}>
        <div className="scalat-interior" style={interior}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Scripturile aplicațiilor stau lângă cel al paginii (assets/), oricare ar fi adresa paginii.
const bazaScripturi = import.meta.url;

/** Cadru cu una dintre aplicațiile reale (tableta sau panoul), legată de serverul din pagină. */
export function Cadru({ aplicatie, titlu }: { aplicatie: 'pos' | 'admin'; titlu: string }) {
  const srcDoc = useMemo(() => {
    const script = new URL(`${aplicatie}.js`, bazaScripturi).href;
    return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titlu}</title></head><body><div id="app"></div><script type="module" src="${script}"></script></body></html>`;
  }, [aplicatie, titlu]);
  return <iframe className="cadru" title={titlu} srcDoc={srcDoc} />;
}
