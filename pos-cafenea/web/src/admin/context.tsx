import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, citesteToken, mesajEroare } from './api';
import type { Locatie } from './tipuri';

interface ContextAdmin {
  /** Crește la fiecare notificare de pe server; paginile își reîncarcă datele. */
  versiune: number;
  live: boolean;
  locatii: Locatie[];
  reincarcaLocatii: () => void;
  arata: (mesaj: string, tip?: 'ok' | 'pericol') => void;
}

const Ctx = createContext<ContextAdmin>(null as unknown as ContextAdmin);
export const useAdmin = () => useContext(Ctx);

export function FurnizorAdmin({ children }: { children: ReactNode }) {
  const [versiune, setVersiune] = useState(0);
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

  // Notificări în timp real; mai multe evenimente apropiate produc o singură reîncărcare.
  // Tokenul de sesiune nu intră în URL: se cere un bilet scurt, iar la cădere se cere altul.
  useEffect(() => {
    if (!citesteToken() || typeof EventSource === 'undefined') return;
    let sursa: EventSource | null = null;
    let timer = 0;
    let reconectare = 0;
    let oprit = false;
    const conecteaza = async () => {
      try {
        const { bilet } = await api.post<{ bilet: string }>('/api/flux/bilet');
        if (oprit) return;
        sursa = new EventSource(`/api/flux?bilet=${encodeURIComponent(bilet)}`);
        sursa.onopen = () => setLive(true);
        sursa.onmessage = () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => setVersiune((v) => v + 1), 500);
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
      window.clearTimeout(timer);
      window.clearTimeout(reconectare);
      sursa?.close();
    };
  }, []);

  return (
    <Ctx.Provider value={{ versiune, live, locatii, reincarcaLocatii, arata }}>
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
 * Încarcă date și le reîncarcă la schimbarea dependențelor sau la notificările live.
 * La reîncărcare păstrează datele vechi (fără „pâlpâire”), marcate cu `incarcare`.
 */
export function useDate<T>(incarca: () => Promise<T>, deps: unknown[]) {
  const { versiune } = useAdmin();
  const [date, setDate] = useState<T | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [incarcare, setIncarcare] = useState(true);
  const [manual, setManual] = useState(0);

  useEffect(() => {
    let anulat = false;
    setIncarcare(true);
    incarca()
      .then((r) => {
        if (anulat) return;
        setDate(r);
        setEroare(null);
      })
      .catch((e) => !anulat && setEroare(mesajEroare(e)))
      .finally(() => !anulat && setIncarcare(false));
    return () => {
      anulat = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versiune, manual]);

  return { date, eroare, incarcare, reincarca: () => setManual((m) => m + 1) };
}
