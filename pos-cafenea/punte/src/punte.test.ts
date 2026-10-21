import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImprimantaSimulata, TerminalSimulat } from './drivere';
import { creeazaPunte } from './server';

const imprimanta = new ImprimantaSimulata();
const server = creeazaPunte(new TerminalSimulat(), imprimanta);
let baza = '';
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baza = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const post = async (cale: string, body: unknown) =>
  (await fetch(baza + cale, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

describe('puntea de echipamente', () => {
  it('aprobă plata pe terminal și tipărește bonul', async () => {
    const r = await post('/terminal/plata', { suma_bani: 4500, referinta: 'x' });
    expect(r.aprobat).toBe(true);
    expect(r.autorizare).toMatch(/^\d{6}$/);
    expect(await post('/imprimanta/bon', { referinta: 'x', nr: 1, linii: [], total: 45, metoda: 'card' })).toEqual({ ok: true });
    expect(imprimanta.tiparite.at(-1)?.tip).toBe('bon');
  });

  it('refuză cererile care nu sunt JSON (un formular de pe altă pagină)', async () => {
    const r = await fetch(`${baza}/imprimanta/bon`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    expect(r.status).toBe(415);
  });

  it('răspunde la cererea preliminară CORS cu acces la rețeaua privată', async () => {
    const r = await fetch(`${baza}/terminal/plata`, { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-private-network')).toBe('true');
  });
});
