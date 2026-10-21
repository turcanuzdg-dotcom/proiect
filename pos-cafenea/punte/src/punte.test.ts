import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImprimantaSimulata, TerminalSimulat } from './drivere';
import { creeazaPunte } from './server';

const imprimanta = new ImprimantaSimulata();
const server = creeazaPunte(new TerminalSimulat(), imprimanta, { secret: 'secret-test', origine: 'https://pos.exemplu.md' });
let baza = '';
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baza = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const antete = { 'Content-Type': 'application/json', 'X-Punte-Token': 'secret-test', Origin: 'https://pos.exemplu.md' };
const post = async (cale: string, body: unknown) => (await fetch(baza + cale, { method: 'POST', headers: antete, body: JSON.stringify(body) })).json();

describe('puntea de echipamente', () => {
  it('aprobă plata pe terminal și tipărește bonul', async () => {
    const r = await post('/terminal/plata', { suma_bani: 4500, referinta: 'x' });
    expect(r.aprobat).toBe(true);
    expect(r.autorizare).toMatch(/^\d{6}$/);
    expect(await post('/imprimanta/bon', { referinta: 'x', nr: 1, linii: [], total: 45, metoda: 'card' })).toEqual({ ok: true });
    expect(imprimanta.tiparite.at(-1)?.tip).toBe('bon');
  });

  it('refuză cererile fără secret, de pe altă origine sau care nu sunt JSON', async () => {
    const corp = JSON.stringify({ referinta: 'x', nr: 2, linii: [], total: 1, metoda: 'card' });
    expect((await fetch(`${baza}/imprimanta/bon`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corp })).status).toBe(401);
    expect((await fetch(`${baza}/imprimanta/bon`, { method: 'POST', headers: { ...antete, Origin: 'https://alt-site.md' }, body: corp })).status).toBe(403);
    // 'text/plain; charset=application/json' trece de un simplu `includes` și nu cere cerere preliminară.
    expect((await fetch(`${baza}/imprimanta/bon`, { method: 'POST', headers: { ...antete, 'Content-Type': 'text/plain; charset=application/json' }, body: corp })).status).toBe(415);
    expect(imprimanta.tiparite.filter((x) => x.bon?.nr === 2)).toHaveLength(0);
  });

  it('răspunde la cererea preliminară CORS cu acces la rețeaua privată', async () => {
    const r = await fetch(`${baza}/terminal/plata`, { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-private-network')).toBe('true');
  });
});
