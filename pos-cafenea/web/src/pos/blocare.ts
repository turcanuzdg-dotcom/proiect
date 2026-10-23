import { useEffect } from 'react';
import type { StareBlocarePin } from './stocare';

// Atribuirea vânzărilor pe bariste: tableta revine singură la ecranul de PIN după câteva minute fără
// atingere, iar PIN-urile încercate la nimereală se opresc după câteva greșeli.

/** Câte PIN-uri greșite la rând se primesc înainte de prima pauză. */
export const ESECURI_PANA_LA_BLOCARE = 5;
/** Prima pauză (ms); fiecare pauză următoare e dublă. */
export const PRIMA_BLOCARE = 30_000;
/** Pauza nu crește la nesfârșit (o tabletă uitată nu rămâne blocată o zi). */
export const BLOCARE_MAXIMA = 30 * 60_000;

export const FARA_ESECURI: StareBlocarePin = { esecuri: 0, blocari: 0, blocat_pana: 0 };

/** Un PIN greșit: după ESECURI_PANA_LA_BLOCARE, o pauză de 30 s, apoi 60 s, 120 s… */
export function dupaEsec(s: StareBlocarePin, acum: number): StareBlocarePin {
  const esecuri = s.esecuri + 1;
  if (esecuri < ESECURI_PANA_LA_BLOCARE) return { ...s, esecuri };
  const durata = Math.min(PRIMA_BLOCARE * 2 ** s.blocari, BLOCARE_MAXIMA);
  return { esecuri: 0, blocari: s.blocari + 1, blocat_pana: acum + durata };
}

/** Câte milisecunde mai durează pauza (0 = se poate introduce PIN-ul). */
export const ramasBlocat = (s: StareBlocarePin, acum: number) => Math.max(0, s.blocat_pana - acum);

/**
 * Blocarea automată: tableta revine la PIN după `minute` fără atingere, dar niciodată cât timp o plată
 * cu cardul, un retur sau închiderea turei sunt deschise (dialoguri care țin „ocupat”). Ecranul de PIN
 * acoperă vânzarea, nu o închide: coșul început rămâne după PIN.
 */
export function trebuieBlocata(ultimaAtingere: number, acum: number, minute: number | undefined, ocupata: boolean): boolean {
  if (ocupata || !minute || minute <= 0) return false;
  return acum - ultimaAtingere >= minute * 60_000;
}

let ocupate = 0;
/** Cât timp există dialoguri care nu trebuie întrerupte de blocarea automată. */
export const tabletaOcupata = () => ocupate > 0;

/** Ține tableta trează cât timp componenta e afișată (și `activ` e adevărat). */
export function useFaraBlocare(activ = true) {
  useEffect(() => {
    if (!activ) return;
    ocupate += 1;
    return () => {
      ocupate -= 1;
    };
  }, [activ]);
}

let inLucru = 0;
/** Un coș început (sau alt lucru nesalvat) sub ecranul de PIN: o versiune nouă nu reîncarcă pagina peste el. */
export const lucruNesalvat = () => inLucru > 0;

/** Marchează lucru nesalvat cât timp componenta e afișată și `activ` e adevărat. */
export function useLucruNesalvat(activ: boolean) {
  useEffect(() => {
    if (!activ) return;
    inLucru += 1;
    return () => {
      inLucru -= 1;
    };
  }, [activ]);
}
