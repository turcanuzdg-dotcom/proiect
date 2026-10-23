import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, citesteToken, mesajEroare } from './api';
import { Limitator, priveste, type Notificare, type OptiuniLive } from './reincarcare';
import type { Locatie } from './tipuri';

interface ContextAdmin {
  /** Primește notificările live de pe server; întoarce dezabonarea. */
  aboneaza: (fn: (n: Notificare) => void) => () => void;
  live: boolean;
  locatii: Locatie[];
  reincarcaLocatii: () => void;
  arata: (mesaj: string, tip?: 'ok' | 'pericol') => void;
}

const Ctx = createContext<ContextAdmin>(null as unknown as ContextAdmin);
export const useAdmin = () => useContext(Ctx);

export function FurnizorAdmin({ children }: { children: ReactNode }) {
  const ascultatori = useRef(new Set<(n: Notificare) => void>());
  const aboneaza = useCallback((fn: (n: Notificare) => void) => {
    ascultatori.current.add(fn);
    return () => void ascultatori.current.delete(fn);
  }, []);
  const [live, setLive] = useState(false);
  const [locatii, setLocatii] = useState<Locatie[]>([]);
  const [toast, setToast] = useState<{ mesaj: string; tip: 'ok' | 'pericol' } | null>(null);
  const timerToast = useRef<number>(0);

  const arata = useCallback((mesaj: string, tip: 'ok' | 'pericol' = 'ok') => {
    setToast({ mesaj, tip });
    window.clearTimeout(timerToast.current);
    timerToast.current = window.setTimeout(() => setToast(null), tip === 'pericol' ? 6000 : 3000);
  }, []);

  const reincarcaLocatii = useCallback(() => {
    api.get<Locatie[]>('/api/locatii').then(setLocatii).catch((e) => arata(mesajEroare(e), 'pericol'));
  }, [arata]);

  useEffect(reincarcaLocatii, [reincarcaLocatii]);

  // Notificări în timp real, trimise mai departe paginilor (useDate le limitează reîncărcările).
  // Tokenul de sesiune nu intră în URL: se cere un bilet scurt, iar la cădere se cere altul.
  useEffect(() => {
    if (!citesteToken() || typeof EventSource === 'undefined') return;
    let sursa: EventSource | null = null;
    let reconectare = 0;
    let oprit = false;
    const conecteaza = async () => {
      try {
        const { bilet } = await api.post<{ bilet: string }>('/api/flux/bilet');
        if (oprit) return;
        sursa = new EventSource(`/api/flux?bilet=${encodeURIComponent(bilet)}`);
        sursa.onopen = () => setLive(true);
        sursa.onmessage = (e) => {
          let n: Notificare;
          try {
            n = JSON.parse(e.data) as Notificare;
          } catch {
            return;
          }
          for (const fn of [...ascultatori.current]) fn(n);
        };
        sursa.onerror = () => {
          setLive(false);
          sursa?.close();
          reconectare = window.setTimeout(conecteaza, 5000);
        };
      } catch {
        setLive(false);
        reconectare = window.setTimeout(conecteaza, 10_000);
      }
    };
    void conecteaza();
    return () => {
      oprit = true;
      window.clearTimeout(reconectare);
      sursa?.close();
    };
  }, []);

  return (
    <Ctx.Provider value={{ aboneaza, live, locatii, reincarcaLocatii, arata }}>
      {children}
      {toast && (
        <div className={`toast${toast.tip === 'pericol' ? ' pericol' : ''}`} role="status">
          {toast.mesaj}
        </div>
      )}
    </Ctx.Provider>
  );
}

/**
 * Încarcă date și le reîncarcă la schimbarea dependențelor, la cerere și la notificările live.
 * La reîncărcare păstrează datele vechi (fără „pâlpâire”), marcate cu `incarcare`.
 * Notificările live reîncarcă pagina cel mult o dată la `minimMs` (implicit 10 s), doar cât fila
 * e vizibilă și doar pentru locația afișată (vezi Limitator); `live: false` le ignoră (rapoartele:
 * „actualizat la HH:MM” și butonul Reîmprospătează).
 */
export function useDate<T>(incarca: () => Promise<T>, deps: unknown[], optiuni: OptiuniLive = {}) {
  const { aboneaza } = useAdmin();
  const [date, setDate] = useState<T | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [incarcare, setIncarcare] = useState(true);
  const [actualizatLa, setActualizatLa] = useState<Date | null>(null);
  const [cerere, setCerere] = useState(0);
  const opt = useRef(optiuni);
  opt.current = optiuni;
  const limitator = useRef<Limitator | null>(null);
  limitator.current ??= new Limitator(() => setCerere((c) => c + 1), optiuni.minimMs);

  useEffect(() => {
    const l = limitator.current!;
    const dezaboneaza = aboneaza((n) => {
      if (priveste(n, opt.current)) l.semnal();
    });
    const laVizibilitate = () => {
      if (document.visibilityState === 'visible') l.vizibil();
    };
    document.addEventListener('visibilitychange', laVizibilitate);
    return () => {
      dezaboneaza();
      document.removeEventListener('visibilitychange', laVizibilitate);
      l.opreste();
    };
  }, [aboneaza]);

  useEffect(() => {
    let anulat = false;
    const l = limitator.current!;
    l.incepe();
    setIncarcare(true);
    incarca()
      .then((r) => {
        if (anulat) return;
        setDate(r);
        setEroare(null);
        setActualizatLa(new Date());
      })
      .catch((e) => !anulat && setEroare(mesajEroare(e)))
      .finally(() => {
        l.incarcat();
        if (!anulat) setIncarcare(false);
      });
    return () => {
      anulat = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, cerere]);

  return { date, eroare, incarcare, actualizatLa, reincarca: () => setCerere((c) => c + 1) };
}
