import { describe, expect, it } from 'vitest';
import { GRUPARE_MS, Limitator, priveste, type Mediu } from './reincarcare';

/** Ceas și cronometre simulate: testul decide când trece timpul și dacă fila e ascunsă. */
function mediuSimulat() {
  let acum = 1_000_000;
  let ascuns = false;
  let timere: { la: number; fn: () => void; id: number }[] = [];
  let id = 0;
  const mediu: Mediu = {
    acum: () => acum,
    ascuns: () => ascuns,
    programeaza: (fn, ms) => {
      timere.push({ la: acum + ms, fn, id: ++id });
      return id;
    },
    anuleaza: (t) => {
      timere = timere.filter((x) => x.id !== t);
    },
  };
  const trece = (ms: number) => {
    const tinta = acum + ms;
    for (;;) {
      const urm = timere.filter((x) => x.la <= tinta).sort((a, b) => a.la - b.la)[0];
      if (!urm) break;
      timere = timere.filter((x) => x !== urm);
      acum = urm.la;
      urm.fn();
    }
    acum = tinta;
  };
  return { mediu, trece, ascunde: (v: boolean) => (ascuns = v) };
}

/** Un limitator legat de o „pagină” care se încarcă instantaneu (sau în `durata` ms). */
function pagina(minimMs = 10_000, durata = 0) {
  const m = mediuSimulat();
  const momente: number[] = [];
  const l: Limitator = new Limitator(
    () => {
      momente.push(m.mediu.acum());
      l.incepe();
      if (durata) m.mediu.programeaza(() => l.incarcat(), durata);
      else l.incarcat();
    },
    minimMs,
    m.mediu,
  );
  // Încărcarea inițială a paginii.
  l.incepe();
  l.incarcat();
  return { l, m, momente, start: m.mediu.acum() };
}

describe('limitarea reîncărcărilor live', () => {
  it('notificările venite împreună dau o singură reîncărcare, după minimul de la ultima încărcare', () => {
    const { l, m, momente, start } = pagina();
    m.trece(20_000);
    // O vânzare: comanda, stocul și banii, în aceeași clipă.
    l.semnal();
    l.semnal();
    l.semnal();
    m.trece(GRUPARE_MS);
    expect(momente).toEqual([start + 20_000 + GRUPARE_MS]);
  });

  it('un șir de vânzări reîncarcă cel mult o dată la 10 s, iar ultima nu se pierde', () => {
    const { l, m, momente, start } = pagina();
    // O vânzare pe secundă, timp de 35 s.
    for (let i = 0; i < 35; i++) {
      l.semnal();
      m.trece(1000);
    }
    m.trece(20_000);
    expect(momente.length).toBeGreaterThanOrEqual(3);
    expect(momente.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < momente.length; i++) expect(momente[i] - momente[i - 1]).toBeGreaterThanOrEqual(10_000);
    expect(momente[0]).toBe(start + 10_000);
    // Reîncărcarea de la capăt prinde ultima vânzare (la start + 34 s).
    expect(momente.at(-1)!).toBeGreaterThanOrEqual(start + 34_000);
  });

  it('cât fila e ascunsă nu se reîncarcă nimic; la revenire, o singură dată', () => {
    const { l, m, momente } = pagina();
    m.trece(60_000);
    m.ascunde(true);
    for (let i = 0; i < 20; i++) {
      l.semnal();
      m.trece(5_000);
    }
    expect(momente).toEqual([]);
    m.ascunde(false);
    l.vizibil();
    l.vizibil();
    m.trece(30_000);
    expect(momente.length).toBe(1);
    // Revenire fără nicio notificare între timp: nimic de reîncărcat.
    m.ascunde(true);
    m.trece(60_000);
    m.ascunde(false);
    l.vizibil();
    m.trece(30_000);
    expect(momente.length).toBe(1);
  });

  it('o reîncărcare programată pe când fila devine ascunsă se amână până la revenire', () => {
    const { l, m, momente } = pagina();
    m.trece(60_000);
    l.semnal();
    m.ascunde(true);
    m.trece(5_000);
    expect(momente).toEqual([]);
    m.ascunde(false);
    l.vizibil();
    m.trece(GRUPARE_MS);
    expect(momente.length).toBe(1);
  });

  it('nu pornește o reîncărcare cât una e în curs; o face o dată după ce se termină', () => {
    const { l, m, momente } = pagina(10_000, 15_000);
    m.trece(30_000);
    l.semnal();
    m.trece(GRUPARE_MS); // pornește prima, durează 15 s
    expect(momente.length).toBe(1);
    for (let i = 0; i < 14; i++) {
      m.trece(1000);
      l.semnal();
    }
    expect(momente.length).toBe(1);
    m.trece(60_000);
    expect(momente.length).toBe(2);
    expect(momente[1] - momente[0]).toBeGreaterThanOrEqual(15_000 + 10_000);
  });

  it('opreste anulează reîncărcarea programată (pagina s-a închis)', () => {
    const { l, m, momente } = pagina();
    m.trece(60_000);
    l.semnal();
    l.opreste();
    m.trece(60_000);
    expect(momente).toEqual([]);
  });
});

describe('ce notificări privesc o pagină', () => {
  it('filtrul de locație ignoră celelalte locații, dar nu notificările generale', () => {
    expect(priveste({ tip: 'comanda', locatie_id: 2 }, {})).toBe(true);
    expect(priveste({ tip: 'comanda', locatie_id: 2 }, { locatie: null })).toBe(true);
    expect(priveste({ tip: 'comanda', locatie_id: 2 }, { locatie: 2 })).toBe(true);
    expect(priveste({ tip: 'comanda', locatie_id: 3 }, { locatie: 2 })).toBe(false);
    expect(priveste({ tip: 'catalog' }, { locatie: 2 })).toBe(true);
    expect(priveste({ tip: 'tura', locatie_id: null }, { locatie: 2 })).toBe(true);
  });

  it('rapoartele (live: false) nu se reîncarcă la nicio notificare', () => {
    expect(priveste({ tip: 'comanda', locatie_id: 2 }, { live: false })).toBe(false);
    expect(priveste({ tip: 'catalog' }, { live: false, locatie: null })).toBe(false);
  });
});
