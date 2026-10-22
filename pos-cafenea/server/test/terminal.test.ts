// Terminalul fiscal prin POSLink, cu un POSLink fals care răspunde ca documentația.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClientPOSLink, construiesteBon } from '../src/servicii/poslink';
import { folosesteClientPOSLink } from '../src/servicii/terminal';
import { pregateste } from './ajutor';

interface Apel {
  cale: string;
  corp: any;
}

/** Comportamentul se setează din test: ce răspunde /Pay, dacă LastTransaction găsește plata etc. */
const scenariu = {
  payRaspuns: { errorCode: 0, report: JSON.stringify({ rrn: '428541236789', authCode: '123456', operationId: 'op-1', amount: 60 }) } as any,
  payIntarziereMs: 0,
  ultima: null as any,
  bonRaspuns: { errorCode: 0, report: JSON.stringify({ QR: 'https://mev.sfs.md/receipt-verifier/ABC', ReceiptID: 'r-1' }) } as any,
};
const apeluri: Apel[] = [];

function corp(req: IncomingMessage) {
  return new Promise<any>((ok) => {
    let s = '';
    req.on('data', (b) => (s += b));
    req.on('end', () => ok(s ? JSON.parse(s) : {}));
  });
}

let fals: Server;
let t: Awaited<ReturnType<typeof pregateste>>;
let terminalDeviceId = randomUUID();

beforeAll(async () => {
  fals = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const body = req.method === 'POST' ? await corp(req) : Object.fromEntries(url.searchParams);
    apeluri.push({ cale: url.pathname, corp: body });
    const raspunde = (o: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o));
    };
    if (body.APIKey !== 'cheie-test') return raspunde({ errorCode: 10, errorName: 'APIKey_not_exist' });
    switch (url.pathname) {
      case '/POSLink/Device/Device/Status':
        return raspunde({ errorCode: 0, report: JSON.stringify({ online: true, battery: 87, paper: 'OK', bank: 'MICB', signal: 4 }) });
      case '/POSLink/Device/payment/Pay':
        if (scenariu.payIntarziereMs) await new Promise((r) => setTimeout(r, scenariu.payIntarziereMs));
        return raspunde(scenariu.payRaspuns);
      case '/POSLink/Device/payment/LastTransaction':
        return raspunde(scenariu.ultima ?? { errorCode: 165, errorName: 'Record_not_exist' });
      case '/POSLink/Device/payment/CloseDoc':
      case '/POSLink/Device/payment/closeDay':
      case '/POSLink/Device/Report/Create':
        return raspunde({ errorCode: 0 });
      case '/POSLink/Device/payment/Refund':
        return raspunde({ errorCode: 0, report: JSON.stringify({ rrn: '999', authCode: '654321', operationId: 'op-r' }) });
      case '/POSLink/Device/Invoice/Pay':
        return raspunde(scenariu.bonRaspuns);
      default:
        return raspunde({ errorCode: -1, errorMessage: `necunoscut ${url.pathname}` });
    }
  });
  await new Promise<void>((r) => fals.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(fals.address() as AddressInfo).port}/POSLink`;
  folosesteClientPOSLink(new ClientPOSLink({ url, cheie: 'cheie-test' }));
  t = await pregateste();
  const tablete = await t.admin.get('/api/dispozitive');
  const centru = tablete.find((d: any) => d.nume === 'Tabletă Centru');
  await t.admin.put(`/api/dispozitive/${centru.id}/terminal`, { terminal_device_id: terminalDeviceId });
});
afterAll(async () => {
  folosesteClientPOSLink(null);
  await t.app.close();
  await t.db.close();
  await new Promise<void>((r) => fals.close(() => r()));
});

describe('terminalul fiscal prin POSLink', () => {
  it('tableta știe că are terminal, iar panoul îi vede starea', async () => {
    const c = await t.tableta.get('/api/pos/terminal/configurat');
    expect(c).toEqual({ configurat: true, are_terminal: true });
    const catalog = await t.tableta.get('/api/pos/catalog');
    expect(catalog.terminal_prin_server).toBe(true);
    const s = await t.tableta.get('/api/pos/terminal/stare');
    expect(s.terminal_device_id).toBe(terminalDeviceId);
    expect(s.stare.paper).toBe('OK');
    const tablete = await t.admin.get('/api/dispozitive');
    const centru = tablete.find((d: any) => d.nume === 'Tabletă Centru');
    expect((await t.admin.get(`/api/dispozitive/${centru.id}/terminal/stare`)).stare.bank).toBe('MICB');
  });

  it('plata cu cardul: suma pleacă la terminal, aprobarea se întoarce și documentul se închide', async () => {
    apeluri.length = 0;
    const referinta = randomUUID();
    const r = await t.tableta.post('/api/pos/terminal/plata', { suma: 60, referinta });
    expect(r).toMatchObject({ aprobat: true, autorizare: '123456', rrn: '428541236789', operation_id: 'op-1' });
    const pay = apeluri.find((a) => a.cale.endsWith('/payment/Pay'))!;
    expect(pay.corp).toMatchObject({ DeviceID: terminalDeviceId, amount: 60, documentNr: referinta });
    const close = apeluri.find((a) => a.cale.endsWith('/payment/CloseDoc'))!;
    expect(close.corp).toMatchObject({ documentNr: referinta, operationId: 'op-1' });
  });

  it('un terminal care nu răspunde nu înseamnă refuz: se verifică ultima tranzacție, apoi se raportează', async () => {
    const referinta = randomUUID();
    scenariu.payRaspuns = { errorCode: 241, errorName: 'Timeout_or_no_response', errorMessage: 'Error: Response timeout' };
    scenariu.ultima = { errorCode: 165 };
    let r = await t.tableta.post('/api/pos/terminal/plata', { suma: 45, referinta });
    expect(r.aprobat).toBe(false);
    expect(r.mesaj).toMatch(/nu răspunde/);
    // Plata trecuse de fapt: „ultima tranzacție” o regăsește după referința noastră → nu se încasează a doua oară.
    scenariu.ultima = { errorCode: 0, report: JSON.stringify({ documentNr: referinta, rrn: '777', authCode: '111111', operationId: 'op-7', amount: 45 }) };
    r = await t.tableta.post('/api/pos/terminal/plata', { suma: 45, referinta });
    expect(r).toMatchObject({ aprobat: true, recuperata: true, rrn: '777', autorizare: '111111' });
    scenariu.payRaspuns = { errorCode: 0, report: JSON.stringify({ rrn: '428541236789', authCode: '123456', operationId: 'op-1', amount: 60 }) };
    scenariu.ultima = null;
  });

  it('restituirea pe card cere RRN-ul plății', async () => {
    const r = await t.tableta.post('/api/pos/terminal/retur', { suma: 60, referinta: randomUUID(), rrn: '428541236789', operation_id: 'op-1' });
    expect(r.aprobat).toBe(true);
    const fara = await t.tableta.post('/api/pos/terminal/retur', { suma: 60, referinta: randomUUID(), rrn: null, operation_id: null });
    expect(fara.aprobat).toBe(false);
    expect(fara.mesaj).toMatch(/RRN/);
  });

  it('bonul fiscal pleacă în structura ISFiscal, cu cota TVA a produsului și plata potrivită', async () => {
    const cap = t.produs('Cappuccino');
    const esp = t.produs('Espresso');
    await t.admin.put('/api/setari/fiscal', { cota_tva_implicita: 'A', antet: 'Mulțumim!' });
    const produse = await t.admin.get('/api/produse');
    const pe = produse.find((p: any) => p.id === esp.id);
    await t.admin.put(`/api/produse/${esp.id}`, { ...pe, cota_tva: 'B', reteta: pe.reteta, modificatori: pe.modificatori });
    apeluri.length = 0;
    const comandaId = randomUUID();
    const r = await t.tableta.post('/api/pos/terminal/bon', {
      comanda_id: comandaId, numar: '17',
      linii: [
        { produs_id: cap.id, nume: 'Cappuccino + Lapte de ovăz', cantitate: 2, pret_unitar: 45 },
        { produs_id: esp.id, nume: 'Espresso', cantitate: 1, pret_unitar: 25 },
      ],
      metoda: 'numerar', total: 115, primit: 200,
    });
    expect(r).toMatchObject({ ok: true, qr: 'https://mev.sfs.md/receipt-verifier/ABC', receipt_id: 'r-1' });
    const trimis = apeluri.find((a) => a.cale.endsWith('/Invoice/Pay'))!.corp;
    expect(trimis.DeviceID).toBe(terminalDeviceId);
    expect(trimis.Receipt).toMatchObject({
      Number: '17', Uid: comandaId, HeaderText: 'Mulțumim!', DisplayType: 0,
      Items: [
        { Name: 'Cappuccino + Lapte de ovăz', Quantity: 2, Price: 45, VAT: 'A', Code: String(cap.id) },
        { Name: 'Espresso', Quantity: 1, Price: 25, VAT: 'B', Code: String(esp.id) },
      ],
      Payments: [{ Code: '1', Amount: 200 }],
    });
    // Bonul emis rămâne înregistrat pe server, cu QR-ul de verificare.
    const bon = await t.db.query('SELECT * FROM bonuri_fiscale WHERE comanda_id = $1', [comandaId]);
    expect(bon[0].qr).toBe('https://mev.sfs.md/receipt-verifier/ABC');
  });

  it('la card, plata de pe bon poartă RRN și codul de autorizare', () => {
    const b = construiesteBon({
      uid: randomUUID(), numar: '18', metoda: 'card', total: 30,
      linii: [{ nume: 'Americano', cantitate: 1, pret_unitar: 30, cota_tva: 'A' }],
      card: { rrn: '428541236789', autorizare: '123456' },
    });
    expect(b.Payments).toEqual([{ Code: '2', Amount: 30, RRN: '428541236789', BankResponse: '123456' }]);
  });

  it('același bon trimis de două ori nu se tipărește a doua oară', async () => {
    scenariu.bonRaspuns = { errorCode: 46, errorMessage: 'Receipt with this Uid already exists' };
    const r = await t.tableta.post('/api/pos/terminal/bon', {
      comanda_id: randomUUID(), numar: '19', linii: [{ produs_id: null, nume: 'Apă', cantitate: 1, pret_unitar: 15 }], metoda: 'numerar', total: 15, primit: 15,
    });
    expect(r).toMatchObject({ ok: true, deja_emis: true });
    scenariu.bonRaspuns = { errorCode: 0, report: JSON.stringify({ QR: 'https://mev.sfs.md/receipt-verifier/ABC', ReceiptID: 'r-1' }) };
  });

  it('raportul Z și închiderea zilei bancare', async () => {
    apeluri.length = 0;
    const r = await t.tableta.post('/api/pos/terminal/raport-z', {});
    expect(r.ok).toBe(true);
    expect(apeluri.map((a) => a.cale.split('/').pop())).toEqual(['Create', 'closeDay']);
    expect(apeluri[0].corp.Fiscal).toBe(true);
  });

  it('o tabletă fără terminal primește un mesaj clar', async () => {
    const asociere = await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: t.demo.coduri_tablete.botanica } });
    const token = asociere.json().token;
    const r = await t.app.inject({ method: 'POST', url: '/api/pos/terminal/plata', payload: { suma: 10, referinta: randomUUID() }, headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(409);
    expect(r.json().eroare).toMatch(/nu are un terminal asociat/);
  });

  it('o cheie API greșită e raportată, nu ascunsă', async () => {
    folosesteClientPOSLink(new ClientPOSLink({ url: `http://127.0.0.1:${(fals.address() as AddressInfo).port}/POSLink`, cheie: 'gresita' }));
    const r = await t.app.inject({ method: 'GET', url: '/api/pos/terminal/stare', headers: { authorization: `Bearer ${t.tokenTableta}` } });
    expect(r.statusCode).toBe(502);
    expect(r.json().eroare).toMatch(/Cheia API POSLink/);
    folosesteClientPOSLink(new ClientPOSLink({ url: `http://127.0.0.1:${(fals.address() as AddressInfo).port}/POSLink`, cheie: 'cheie-test' }));
  });
});
