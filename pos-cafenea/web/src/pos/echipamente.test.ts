// Terminalul prin server: ce răspunsuri ale serverului sunt nesigure (se verifică din nou) și care nu.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COD_TERMINAL } from '@cafenea/shared';
import { creeazaEchipamente, urmareRetur } from './echipamente';

afterEach(() => vi.unstubAllGlobals());

/** Serverul răspunde la orice cerere cu `status` și `corp`; `null` = fără conexiune. */
function server(status: number | null, corp: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (status === null) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(corp), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
}

const terminal = () => creeazaEchipamente({ tip: 'server', url: '' }, () => 'token');
const ref = '00000000-0000-4000-8000-000000000001';

describe('plata prin server', () => {
  it('o plată aprobată deja pentru altă sumă nu e nesigură: tableta primește suma aprobată', async () => {
    server(409, { eroare: 'Plata pentru această comandă a fost deja aprobată, pentru 45.00 lei', cod: COD_TERMINAL.plataDejaAprobata, suma_aprobata: 45 });
    const r = await terminal().platesteCard(52, ref);
    expect(r).toMatchObject({ aprobat: false, cod: COD_TERMINAL.plataDejaAprobata, suma_anterioara: 45 });
    expect(r.nesigur).toBeUndefined();
  });

  it('o configurare lipsă (fără terminal, POSLink neconfigurat) e eroare, nu plată nesigură', async () => {
    for (const status of [409, 503]) {
      server(status, { eroare: 'Tableta nu are un terminal asociat', cod: COD_TERMINAL.configurare });
      const r = await terminal().platesteCard(45, ref);
      expect(r).toMatchObject({ aprobat: false, cod: COD_TERMINAL.configurare });
      expect(r.nesigur).toBeUndefined();
    }
  });

  it('fără răspuns, 5xx sau „plata e în curs”: nesigur (reîncercarea verifică, nu încasează din nou)', async () => {
    for (const [status, corp] of [
      [null, {}],
      [502, { eroare: 'POSLink căzut' }],
      [409, { eroare: 'Plata este în curs pe terminal', cod: COD_TERMINAL.operatieInCurs }],
      [409, { eroare: 'Plata este în curs pe terminal' }],
    ] as const) {
      server(status, corp);
      expect(await terminal().platesteCard(45, ref)).toMatchObject({ aprobat: false, nesigur: true });
    }
  });
});

describe('returul prin server', () => {
  it('fără plată înregistrată sau pe alt terminal: returul din meniul terminalului', async () => {
    server(409, { eroare: 'Returul pe card se face din meniul terminalului', cod: COD_TERMINAL.returDinMeniu });
    expect(urmareRetur(await terminal().returCard(45, {}, ref))).toBe('din_meniu');
    server(409, { eroare: 'Plata s-a încasat pe terminalul PAX-1; returul se face de acolo', cod: COD_TERMINAL.returAltTerminal, terminal: 'PAX-1' });
    const r = await terminal().returCard(45, {}, ref);
    expect(r).toMatchObject({ cod: COD_TERMINAL.returAltTerminal, terminal: 'PAX-1' });
    expect(urmareRetur(r)).toBe('din_meniu');
  });

  it('aprobat, nesigur (fără răspuns) și refuzat', async () => {
    server(200, { aprobat: true, rrn: 'R' });
    expect(urmareRetur(await terminal().returCard(45, {}, ref))).toBe('inregistreaza');
    server(null);
    expect(urmareRetur(await terminal().returCard(45, {}, ref))).toBe('nesigur');
    server(200, { aprobat: false, mesaj: 'Refuzat de bancă' });
    expect(urmareRetur(await terminal().returCard(45, {}, ref))).toBe('refuzat');
  });

  it('un retur în curs pe terminal (de pe altă tabletă) e nesigur, nu trimite barista la meniul terminalului', async () => {
    server(409, { eroare: 'Returul este în curs pe terminal', cod: COD_TERMINAL.operatieInCurs });
    const r = await terminal().returCard(45, {}, ref);
    expect(r).toMatchObject({ aprobat: false, nesigur: true });
    expect(urmareRetur(r)).toBe('nesigur');
  });

  it('o configurare lipsă (fără terminal, POSLink neconfigurat) e refuz, nu retur nesigur', async () => {
    for (const status of [409, 503]) {
      server(status, { eroare: 'POSLink nu este configurat pe server', cod: COD_TERMINAL.configurare });
      const r = await terminal().returCard(45, {}, ref);
      expect(r).toMatchObject({ aprobat: false, cod: COD_TERMINAL.configurare });
      expect(r.nesigur).toBeUndefined();
      expect(urmareRetur(r)).toBe('refuzat');
    }
  });

  it('un retur parțial (409 fără cod) rămâne refuzat', async () => {
    server(409, { eroare: 'Returul pe card se face integral (45.00 lei)' });
    expect(urmareRetur(await terminal().returCard(20, {}, ref))).toBe('refuzat');
  });
});
