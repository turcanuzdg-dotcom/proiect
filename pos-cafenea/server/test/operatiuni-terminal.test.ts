// Registrul operațiunilor pe terminal: plata nu se încasează de două ori, „ultima tranzacție” nu aprobă
// plata altui client, returul se face doar în contul plății înregistrate, iar vânzările pe card fără
// plată aprobată se marchează pentru admin.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClientPOSLink, configPOSLink, LIMITA_RASPUNS_POSLINK } from '../src/servicii/poslink';
import { folosesteClientPOSLink } from '../src/servicii/terminal';
import { evComanda, evTuraDeschisa, pregateste } from './ajutor';

const APROBAT = { errorCode: 0, report: JSON.stringify({ rrn: '428541236789', authCode: '123456', operationId: 'op-1', amount: 45 }) };

const scenariu = {
  pay: APROBAT as any,
  payIntarziereMs: 0,
  ultima: { errorCode: 165 } as any,
  refund: { errorCode: 0, report: JSON.stringify({ rrn: 'R-1', authCode: '654321', operationId: 'op-r' }) } as any,
  bon: { errorCode: 0, report: JSON.stringify({ QR: 'qr', ReceiptID: 'r-1' }) } as any,
  /** Corp brut trimis în loc de JSON (pentru limita de mărime). */
  brut: null as string | null,
};
const apeluri: { cale: string; corp: any }[] = [];
const numar = (cale: string) => apeluri.filter((a) => a.cale.endsWith(cale)).length;

function corp(req: IncomingMessage) {
  return new Promise<any>((ok) => {
    let s = '';
    req.on('data', (b) => (s += b));
    req.on('end', () => ok(s ? JSON.parse(s) : {}));
  });
}

let fals: Server;
let urlFals = '';
let t: Awaited<ReturnType<typeof pregateste>>;

beforeAll(async () => {
  fals = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const body = req.method === 'POST' ? await corp(req) : Object.fromEntries(url.searchParams);
    apeluri.push({ cale: url.pathname, corp: body });
    const raspunde = (o: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(scenariu.brut ?? JSON.stringify(o));
    };
    switch (url.pathname) {
      case '/POSLink/Device/payment/Pay':
        if (scenariu.payIntarziereMs) await new Promise((r) => setTimeout(r, scenariu.payIntarziereMs));
        return raspunde(scenariu.pay);
      case '/POSLink/Device/payment/LastTransaction':
        return raspunde(scenariu.ultima);
      case '/POSLink/Device/payment/Refund':
        return raspunde(scenariu.refund);
      case '/POSLink/Device/Invoice/Pay':
        return raspunde(scenariu.bon);
      default:
        return raspunde({ errorCode: 0 });
    }
  });
  await new Promise<void>((r) => fals.listen(0, '127.0.0.1', r));
  urlFals = `http://127.0.0.1:${(fals.address() as AddressInfo).port}/POSLink`;
  folosesteClientPOSLink(new ClientPOSLink({ url: urlFals, cheie: 'cheie-test' }));
  t = await pregateste();
  const centru = (await t.admin.get('/api/dispozitive')).find((d: any) => d.nume === 'Tabletă Centru');
  await t.admin.put(`/api/dispozitive/${centru.id}/terminal`, { terminal_device_id: 'PAX-1' });
});
afterAll(async () => {
  folosesteClientPOSLink(null);
  await t.app.close();
  await t.db.close();
  await new Promise<void>((r) => fals.close(() => r()));
});
beforeEach(() => {
  apeluri.length = 0;
  Object.assign(scenariu, { pay: APROBAT, payIntarziereMs: 0, ultima: { errorCode: 165 }, brut: null });
});

const plata = (referinta: string, suma = 45) => t.tableta.post('/api/pos/terminal/plata', { suma, referinta });
const cerere = (url: string, payload: unknown) => t.app.inject({ method: 'POST', url, payload: payload as any, headers: { authorization: `Bearer ${t.tokenTableta}` } });
const randuri = (referinta: string) => t.db.query<any>('SELECT * FROM operatiuni_terminal WHERE referinta = $1 ORDER BY id', [referinta]);
const ultima = (o: Record<string, unknown>) => ({ errorCode: 0, report: JSON.stringify(o) });

describe('plata cu cardul, o singură dată pe comandă', () => {
  it('o plată aprobată se întoarce din registru la reîncercare, fără o nouă trimitere la terminal', async () => {
    const ref = randomUUID();
    expect(await plata(ref)).toMatchObject({ aprobat: true, rrn: '428541236789', autorizare: '123456' });
    expect(await plata(ref)).toMatchObject({ aprobat: true, rrn: '428541236789', autorizare: '123456' });
    expect(numar('/payment/Pay')).toBe(1);
    const r = await randuri(ref);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tip: 'plata', stare: 'aprobata', rrn: '428541236789', autorizare: '123456', operation_id: 'op-1', terminal_device_id: 'PAX-1' });
    expect(Number(r[0].suma)).toBe(45);
    // Aceeași comandă cu altă sumă: nu se încasează nimic în plus.
    const alta = await cerere('/api/pos/terminal/plata', { suma: 50, referinta: ref });
    expect(alta.statusCode).toBe(409);
  });

  it('două cereri simultane pentru aceeași comandă: o singură plată pe terminal; altă sumă primește 409', async () => {
    scenariu.payIntarziereMs = 300;
    const ref = randomUUID();
    const a = plata(ref);
    const b = plata(ref);
    await new Promise((r) => setTimeout(r, 50));
    const c = await cerere('/api/pos/terminal/plata', { suma: 99, referinta: ref });
    expect(c.statusCode).toBe(409);
    expect(c.json().eroare).toBe('Plata este în curs pe terminal');
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.aprobat && rb.aprobat).toBe(true);
    expect(numar('/payment/Pay')).toBe(1);
  });

  it('după un refuz definitiv se poate încerca din nou, și cu altă sumă (coșul s-a schimbat)', async () => {
    const ref = randomUUID();
    scenariu.pay = { errorCode: 51, errorMessage: 'Fonduri insuficiente' };
    expect((await plata(ref)).aprobat).toBe(false);
    scenariu.pay = APROBAT;
    expect((await plata(ref, 30)).aprobat).toBe(true);
    expect((await randuri(ref)).map((x) => [x.stare, Number(x.suma)])).toEqual([['refuzata', 45], ['aprobata', 30]]);
  });

  it('o referință folosită de altă tabletă nu se poate prelua', async () => {
    const ref = randomUUID();
    await plata(ref);
    const botanica = await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: t.demo.coduri_tablete.botanica } });
    const idBotanica = botanica.json().dispozitiv.id;
    await t.admin.put(`/api/dispozitive/${idBotanica}/terminal`, { terminal_device_id: 'PAX-2' });
    const r = await t.app.inject({ method: 'POST', url: '/api/pos/terminal/plata', payload: { suma: 45, referinta: ref }, headers: { authorization: `Bearer ${botanica.json().token}` } });
    expect(r.statusCode).toBe(409);
    expect(numar('/payment/Pay')).toBe(1);
  });
});

describe('răspuns pierdut: „ultima tranzacție” nu aprobă decât plata noastră', () => {
  it('aceeași sumă, dar altă referință (clientul de dinainte): nu e aprobare', async () => {
    const ref = randomUUID();
    scenariu.pay = { errorCode: 241 };
    scenariu.ultima = ultima({ documentNr: randomUUID(), status: 'Approved', amount: 45, rrn: 'VECHI', authCode: '1' });
    const r = await plata(ref);
    expect(r.aprobat).toBe(false);
    expect(r.nesigur).toBeUndefined();
  });

  it('fără referință în răspuns, cu referința dar fără aprobare explicită sau cu altă sumă: nesigur', async () => {
    for (const u of [
      { status: 'Approved', amount: 45, rrn: 'X', authCode: '1' },
      { documentNr: 'REF', amount: 45, rrn: 'X', authCode: '1' },
      { documentNr: 'REF', status: 'Approved', amount: 40, rrn: 'X', authCode: '1' },
      { documentNr: 'REF', status: 'Approved', amount: 45 },
    ]) {
      const ref = randomUUID();
      scenariu.pay = { errorCode: 241 };
      scenariu.ultima = ultima({ ...u, ...(u.documentNr ? { documentNr: ref } : {}) });
      const r = await plata(ref);
      expect(r).toMatchObject({ aprobat: false, nesigur: true });
      expect(r.mesaj).toMatch(/Nu se poate confirma plata/);
      expect((await randuri(ref))[0].stare).toBe('nesigura');
    }
  });

  it('plata noastră refuzată pe terminal e refuz, nu aprobare', async () => {
    const ref = randomUUID();
    scenariu.pay = { errorCode: 241 };
    scenariu.ultima = ultima({ documentNr: ref, status: 'Declined', amount: 45, rrn: 'X' });
    expect(await plata(ref)).toMatchObject({ aprobat: false, mesaj: 'Plata a fost refuzată pe terminal' });
  });

  it('un „succes” fără RRN și cod de autorizare e nesigur', async () => {
    const ref = randomUUID();
    scenariu.pay = { errorCode: 0, report: JSON.stringify({ operationId: 'op-x' }) };
    expect(await plata(ref)).toMatchObject({ aprobat: false, nesigur: true });
  });

  it('reîncercarea unei plăți nesigure verifică terminalul din nou, fără să retrimită suma', async () => {
    const ref = randomUUID();
    scenariu.pay = { errorCode: 241 };
    scenariu.ultima = { errorCode: 7 };
    expect((await plata(ref)).nesigur).toBe(true);
    // Tot neconcludent: nicio plată nouă.
    expect((await plata(ref)).nesigur).toBe(true);
    // Terminalul confirmă acum plata noastră.
    scenariu.ultima = ultima({ documentNr: ref, status: 'Approved', amount: 45, rrn: '555', authCode: '222' });
    expect(await plata(ref)).toMatchObject({ aprobat: true, recuperata: true, rrn: '555' });
    expect(numar('/payment/Pay')).toBe(1);
    expect((await randuri(ref)).map((x) => x.stare)).toEqual(['aprobata']);
    // O sumă schimbată cât timp plata e nelămurită nu pleacă la terminal.
    const ref2 = randomUUID();
    scenariu.ultima = { errorCode: 7 };
    await plata(ref2);
    expect((await cerere('/api/pos/terminal/plata', { suma: 10, referinta: ref2 })).statusCode).toBe(409);
  });

  it('un răspuns POSLink peste 1 MB nu se citește; plata rămâne nesigură', async () => {
    const ref = randomUUID();
    scenariu.brut = JSON.stringify({ errorCode: 0, umplutura: 'x'.repeat(LIMITA_RASPUNS_POSLINK + 10) });
    const r = await plata(ref);
    expect(r).toMatchObject({ aprobat: false, nesigur: true });
    expect(r.mesaj).toMatch(/prea mare/);
  });
});

describe('registrul nu se rescrie', () => {
  it('o operațiune încheiată nu se modifică și nicio operațiune nu se șterge', async () => {
    const ref = randomUUID();
    await plata(ref);
    await expect(t.db.query(`UPDATE operatiuni_terminal SET suma = 1 WHERE referinta = $1`, [ref])).rejects.toThrow(/nu se modifică/);
    await expect(t.db.query(`UPDATE operatiuni_terminal SET stare = 'refuzata' WHERE referinta = $1`, [ref])).rejects.toThrow(/nu se modifică/);
    await expect(t.db.query(`DELETE FROM operatiuni_terminal WHERE referinta = $1`, [ref])).rejects.toThrow(/nu se modifică/);
  });
});

describe('returul pe card', () => {
  it('doar în contul plății înregistrate, cu RRN-ul ei, o singură dată pe comandă', async () => {
    const ref = randomUUID();
    await plata(ref);
    apeluri.length = 0;
    const r = await t.tableta.post('/api/pos/terminal/retur', { referinta: ref, suma: 45, rrn: 'INVENTAT' });
    expect(r).toMatchObject({ aprobat: true, suma: 45 });
    expect(apeluri.find((a) => a.cale.endsWith('/Refund'))!.corp).toMatchObject({ rrn: '428541236789', operationId: 'op-1', amount: 45 });
    // Răspunsul s-a pierdut și tableta reîncearcă: primește returul înregistrat, banca nu restituie a doua oară.
    expect(await t.tableta.post('/api/pos/terminal/retur', { referinta: ref, suma: 45 })).toMatchObject({ aprobat: true });
    expect(numar('/Refund')).toBe(1);
    const retur = (await randuri(ref)).filter((x) => x.tip === 'retur');
    expect(retur).toHaveLength(1);
    expect(retur[0]).toMatchObject({ stare: 'aprobata', rrn: 'R-1' });
    expect(retur[0].document_nr).not.toBe(ref);
  });

  it('suma e plafonată la plată minus ce s-a restituit; fiecare încercare rămâne în registru', async () => {
    const ref = randomUUID();
    await plata(ref);
    expect((await cerere('/api/pos/terminal/retur', { referinta: ref, suma: 46 })).statusCode).toBe(409);
    scenariu.refund = { errorCode: 12, errorMessage: 'Refuzat de bancă' };
    expect((await t.tableta.post('/api/pos/terminal/retur', { referinta: ref, suma: 20 })).aprobat).toBe(false);
    scenariu.refund = { errorCode: 0, report: JSON.stringify({ rrn: 'R-2', authCode: '1', operationId: 'op-r2' }) };
    expect((await t.tableta.post('/api/pos/terminal/retur', { referinta: ref, suma: 20 })).aprobat).toBe(true);
    expect((await cerere('/api/pos/terminal/retur', { referinta: ref, suma: 30 })).statusCode).toBe(409);
    expect(await t.tableta.post('/api/pos/terminal/retur', { referinta: ref })).toMatchObject({ aprobat: true, suma: 25 });
    expect((await randuri(ref)).filter((x) => x.tip === 'retur').map((x) => [x.stare, Number(x.suma)])).toEqual([
      ['refuzata', 20],
      ['aprobata', 20],
      ['aprobata', 25],
    ]);
  });

  it('un retur cu răspuns pierdut se verifică pe terminal, nu se retrimite', async () => {
    const ref = randomUUID();
    await plata(ref);
    scenariu.refund = { errorCode: 241 };
    expect(await t.tableta.post('/api/pos/terminal/retur', { referinta: ref })).toMatchObject({ aprobat: false, nesigur: true });
    const doc = (await randuri(ref)).find((x) => x.tip === 'retur').document_nr;
    scenariu.ultima = ultima({ documentNr: doc, status: 'Approved', amount: 45, rrn: 'R-9', authCode: '9' });
    expect(await t.tableta.post('/api/pos/terminal/retur', { referinta: ref })).toMatchObject({ aprobat: true, rrn: 'R-9' });
    expect(numar('/Refund')).toBe(1);
    scenariu.refund = { errorCode: 0, report: JSON.stringify({ rrn: 'R-1', authCode: '654321', operationId: 'op-r' }) };
  });

  it('fără plată înregistrată (sau refuzată), returul se face din meniul terminalului', async () => {
    const ref = randomUUID();
    scenariu.pay = { errorCode: 51 };
    await plata(ref);
    for (const referinta of [ref, randomUUID()]) {
      const r = await cerere('/api/pos/terminal/retur', { referinta, suma: 45, rrn: '428541236789' });
      expect(r.statusCode).toBe(409);
      expect(r.json().eroare).toBe('Returul pe card se face din meniul terminalului');
    }
    expect(numar('/Refund')).toBe(0);
  });
});

describe('bonul fiscal', () => {
  const linii = [{ produs_id: null, nume: 'Latte', cantitate: 1, pret_unitar: 45 }];

  it('un total care nu e suma liniilor e respins', async () => {
    const r = await cerere('/api/pos/terminal/bon', { comanda_id: randomUUID(), numar: '1', linii, metoda: 'numerar', total: 0.5, primit: 50 });
    expect(r.statusCode).toBe(400);
    expect(numar('/Invoice/Pay')).toBe(0);
  });

  it('pe card, RRN-ul și codul de autorizare vin din plata înregistrată', async () => {
    const ref = randomUUID();
    await plata(ref);
    await t.tableta.post('/api/pos/terminal/bon', { comanda_id: ref, numar: '2', linii, metoda: 'card', total: 45, card: { rrn: 'INVENTAT', autorizare: '000000' } });
    expect(apeluri.find((a) => a.cale.endsWith('/Invoice/Pay'))!.corp.Receipt.Payments).toEqual([{ Code: '2', Amount: 45, RRN: '428541236789', BankResponse: '123456' }]);
  });

  it('doar codul 46 înseamnă „deja emis”; o altă eroare care pomenește Uid-ul lasă bonul netipărit', async () => {
    scenariu.bon = { errorCode: 30, errorMessage: 'Invalid Uid format' };
    const r = await t.tableta.post('/api/pos/terminal/bon', { comanda_id: randomUUID(), numar: '3', linii, metoda: 'numerar', total: 45, primit: 50 });
    expect(r).toMatchObject({ ok: false });
    expect(r.deja_emis).toBeUndefined();
    scenariu.bon = { errorCode: 0, report: JSON.stringify({ QR: 'qr', ReceiptID: 'r-1' }) };
  });
});

describe('vânzările pe card confirmate de terminal', () => {
  it('se marchează la sincronizare, apar în Comenzi, pe tură și pe Panou', async () => {
    const tura = randomUUID();
    const acum = new Date().toISOString();
    const linie = [{ produs_id: t.produs('Espresso').id, cantitate: 1, pret_unitar: t.produs('Espresso').pret, modificatori: [] }];
    const confirmata = evComanda(tura, t.barista, linie, 'card', { la: acum });
    const pret = confirmata.date.total;
    await plata(confirmata.date.comanda_id, pret);
    const inventata = evComanda(tura, t.barista, linie, 'card', { la: acum });
    const altaSuma = evComanda(tura, t.barista, linie, 'card', { la: acum });
    await plata(altaSuma.date.comanda_id, pret + 1);
    const numerar = evComanda(tura, t.barista, linie, 'numerar', { la: acum, primit: pret });
    const r = await t.tableta.sync([evTuraDeschisa(tura, t.barista, 500, acum), confirmata, inventata, altaSuma, numerar]);
    expect(r.cu_eroare).toEqual([]);

    const stari = await t.db.query<{ id: string; card_confirmat: boolean | null }>('SELECT id, card_confirmat FROM comenzi WHERE tura_id = $1', [tura]);
    const dupa = new Map(stari.map((x) => [x.id, x.card_confirmat]));
    expect(dupa.get(confirmata.date.comanda_id)).toBe(true);
    expect(dupa.get(inventata.date.comanda_id)).toBe(false);
    expect(dupa.get(altaSuma.date.comanda_id)).toBe(false);
    expect(dupa.get(numerar.date.comanda_id)).toBeNull();

    const comenzi = await t.admin.get(`/api/comenzi?tura_id=${tura}&card_neconfirmat=true`);
    expect(comenzi.map((c: any) => c.id).sort()).toEqual([inventata.date.comanda_id, altaSuma.date.comanda_id].sort());
    expect((await t.admin.get(`/api/ture/${tura}`)).card_neconfirmat).toEqual({ nr: 2, suma: 2 * pret });
    const p = await t.admin.get(`/api/panou?de_azi=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}`);
    expect(p.card_neconfirmat).toBeGreaterThanOrEqual(2);
  });
});

describe('setările tabletelor și POSLink', () => {
  it('modul demonstrație și blocarea automată ajung în catalog și îi schimbă versiunea', async () => {
    const inainte = await t.tableta.get('/api/pos/catalog');
    expect(inainte).toMatchObject({ mod_demonstratie: false, blocare_automata_min: 5, terminal_prin_server: true });
    await t.admin.put('/api/setari/tableta', { mod_demonstratie: true, blocare_automata_min: 3 });
    const dupa = await t.tableta.get('/api/pos/catalog');
    expect(dupa).toMatchObject({ mod_demonstratie: true, blocare_automata_min: 3 });
    expect(dupa.versiune).not.toBe(inainte.versiune);
    expect((await t.tableta.sync([])).catalog_versiune).toBe(dupa.versiune);
    await t.admin.put('/api/setari/tableta', { mod_demonstratie: false, blocare_automata_min: 5 });
  });

  it('POSLINK_URL trebuie să fie https, în afară de mașina locală', () => {
    const vechi = { ...process.env };
    try {
      process.env.POSLINK_API_KEY = 'k';
      process.env.POSLINK_URL = 'http://poslink.exemplu.md/POSLink';
      expect(() => configPOSLink()).toThrow(/https/);
      process.env.POSLINK_URL = 'http://127.0.0.1:9000/POSLink';
      expect(configPOSLink()?.url).toBe('http://127.0.0.1:9000/POSLink');
      process.env.POSLINK_URL = 'https://poslink.eservicii.md/POSLink/';
      expect(configPOSLink()?.url).toBe('https://poslink.eservicii.md/POSLink');
    } finally {
      process.env.POSLINK_API_KEY = vechi.POSLINK_API_KEY;
      process.env.POSLINK_URL = vechi.POSLINK_URL;
      if (vechi.POSLINK_API_KEY === undefined) delete process.env.POSLINK_API_KEY;
      if (vechi.POSLINK_URL === undefined) delete process.env.POSLINK_URL;
    }
  });
});
