import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construiesteApp } from '../src/app';
import { pregateste } from './ajutor';

/**
 * Interfața construită (web/dist) servită de @fastify/static. Cererile pleacă printr-un socket real,
 * cu adresa trimisă exact cum e scrisă (inject ar normaliza „..” înainte să ajungă la server).
 */
let t: Awaited<ReturnType<typeof pregateste>>;
let app: Awaited<ReturnType<typeof construiesteApp>>;
let dirTemp: string;
let port: number;

beforeAll(async () => {
  t = await pregateste();
  dirTemp = mkdtempSync(path.join(tmpdir(), 'cafenea-web-'));
  const dirWeb = path.join(dirTemp, 'dist');
  mkdirSync(dirWeb);
  writeFileSync(path.join(dirWeb, 'index.html'), '<!doctype html><title>Cafenea</title>');
  writeFileSync(path.join(dirWeb, 'pos.html'), '<!doctype html><title>POS</title>');
  writeFileSync(path.join(dirWeb, 'admin.html'), '<!doctype html><title>Panou</title>');
  writeFileSync(path.join(dirWeb, 'sw.js'), 'self.addEventListener("install", () => {});');
  writeFileSync(path.join(dirWeb, 'manifest.webmanifest'), '{"name":"POS Cafenea"}');
  // Lângă interfață, nu în ea: nu trebuie să poată fi citit prin adresă.
  writeFileSync(path.join(dirTemp, 'secret.txt'), 'NU-SE-SERVESTE');
  app = await construiesteApp({ db: t.db, dirWeb });
  await app.listen({ port: 0, host: '127.0.0.1' });
  port = (app.server.address() as AddressInfo).port;
});
afterAll(async () => {
  await app.close();
  await t.app.close();
  await t.db.close();
  rmSync(dirTemp, { recursive: true, force: true });
});

function cere(adresa: string): Promise<{ status: number; antete: Record<string, string | string[] | undefined>; corp: string }> {
  return new Promise((rezolva, respinge) => {
    const r = request({ host: '127.0.0.1', port, path: adresa, method: 'GET' }, (res) => {
      let corp = '';
      res.setEncoding('utf8');
      res.on('data', (b) => (corp += b));
      res.on('end', () => rezolva({ status: res.statusCode!, antete: res.headers, corp }));
    });
    r.on('error', respinge);
    r.end();
  });
}

describe('interfața statică', () => {
  it('servește paginile, service worker-ul și manifestul', async () => {
    const index = await cere('/');
    expect(index.status).toBe(200);
    expect(index.corp).toContain('<title>Cafenea</title>');
    const pos = await cere('/pos.html');
    expect(pos.status).toBe(200);
    expect(pos.antete['content-type']).toMatch(/text\/html/);
    const sw = await cere('/sw.js');
    expect(sw.status).toBe(200);
    expect(sw.antete['content-type']).toMatch(/javascript/);
    expect((await cere('/manifest.webmanifest')).status).toBe(200);
    expect((await cere('/lipsa.js')).status).toBe(404);
  });

  it('/pos și /admin trimit la paginile aplicațiilor', async () => {
    const pos = await cere('/pos');
    expect(pos.status).toBe(302);
    expect(pos.antete.location).toBe('/pos.html');
    const admin = await cere('/admin');
    expect(admin.status).toBe(302);
    expect(admin.antete.location).toBe('/admin.html');
  });

  it('API-ul are întâietate față de fișiere', async () => {
    expect((await cere('/api/pos/catalog')).status).toBe(401);
  });

  it('nu iese din directorul interfeței', async () => {
    for (const adresa of ['/../secret.txt', '/%2E%2E/secret.txt', '/..%2Fsecret.txt', '/%2e%2e%2fsecret.txt', '/pos.html/../../secret.txt']) {
      const r = await cere(adresa);
      expect(r.status, adresa).not.toBe(200);
      expect(r.corp, adresa).not.toContain('NU-SE-SERVESTE');
    }
  });
});
