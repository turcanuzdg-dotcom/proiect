// Blocarea tabletei și alegerea echipamentelor: reguli pure, fără interfață.
import { describe, expect, it } from 'vitest';
import { BLOCARE_MAXIMA, dupaEsec, FARA_ESECURI, ramasBlocat, trebuieBlocata } from './blocare';
import { alegeEchipamente } from './echipamente';

describe('PIN-uri greșite', () => {
  it('după 5 greșeli, 30 s de pauză, apoi pauze duble', () => {
    let s = FARA_ESECURI;
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) s = dupaEsec(s, t);
    expect(ramasBlocat(s, t)).toBe(0);
    s = dupaEsec(s, t);
    expect(ramasBlocat(s, t)).toBe(30_000);
    for (let i = 0; i < 5; i++) s = dupaEsec(s, t + 30_000);
    expect(ramasBlocat(s, t + 30_000)).toBe(60_000);
    for (let n = 0; n < 10; n++) for (let i = 0; i < 5; i++) s = dupaEsec(s, t);
    expect(ramasBlocat(s, t)).toBe(BLOCARE_MAXIMA);
  });
});

describe('blocarea automată', () => {
  it('după minutele setate fără atingere, dar nu cât timp tableta e ocupată', () => {
    expect(trebuieBlocata(0, 4 * 60_000, 5, false)).toBe(false);
    expect(trebuieBlocata(0, 5 * 60_000, 5, false)).toBe(true);
    expect(trebuieBlocata(0, 60 * 60_000, 5, true)).toBe(false);
  });
});

describe('echipamentele tabletei', () => {
  it('terminalul legat în panou are întâietate față de alegerea salvată', () => {
    expect(alegeEchipamente({ terminal_prin_server: true }, { tip: 'simulator', url: '' }, true).tip).toBe('server');
  });
  it('Simulatorul și puntea doar în dezvoltare sau cu modul demonstrație; altfel terminal separat', () => {
    expect(alegeEchipamente({}, { tip: 'simulator', url: '' }, false).tip).toBe('manual');
    expect(alegeEchipamente({}, { tip: 'punte', url: 'http://x' }, false).tip).toBe('manual');
    expect(alegeEchipamente({ mod_demonstratie: true }, { tip: 'simulator', url: '' }, false).tip).toBe('simulator');
    expect(alegeEchipamente({}, { tip: 'simulator', url: '' }, true).tip).toBe('simulator');
    expect(alegeEchipamente({}, undefined, false).tip).toBe('manual');
    // O alegere „server” rămasă salvată, fără terminal legat acum: terminal separat.
    expect(alegeEchipamente({ terminal_prin_server: false }, { tip: 'server', url: '' }, true).tip).toBe('manual');
  });
});
