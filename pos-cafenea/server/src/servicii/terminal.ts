// Terminalul bancar în regim fiscal al fiecărei tablete (PAX A930 cu IS Fiscal, prin POSLink):
// plata cu cardul, bonul fiscal, raportul Z. Cheia API stă doar pe server.

import type { Db } from '../db';
import { EroareUtilizator } from '../erori';
import { ClientPOSLink, configPOSLink, type BonFiscalDeTrimis, type RezultatBon, type RezultatPlata } from './poslink';
import { citesteSetare } from './setari';

export interface ConfigFiscal {
  /** Litera cotei de TVA din configurația casei fiscale (de regulă A = 20%). */
  cota_tva_implicita: string;
  antet: string;
}
export const FISCAL_IMPLICIT: ConfigFiscal = { cota_tva_implicita: 'A', antet: '' };
export const citesteFiscal = (db: Db) => citesteSetare(db, 'fiscal', FISCAL_IMPLICIT);

let clientDeTest: ClientPOSLink | null = null;
/** Testele înlocuiesc clientul real cu unul care vorbește cu un POSLink fals. */
export function folosesteClientPOSLink(c: ClientPOSLink | null) {
  clientDeTest = c;
}

export function poslinkConfigurat(): boolean {
  return clientDeTest !== null || configPOSLink() !== null;
}

function client(): ClientPOSLink {
  if (clientDeTest) return clientDeTest;
  const cfg = configPOSLink();
  if (!cfg) throw new EroareUtilizator('POSLink nu este configurat pe server (variabila POSLINK_API_KEY)', 503);
  return new ClientPOSLink(cfg);
}

async function terminalulTabletei(db: Db, dispozitivId: number): Promise<string> {
  const r = await db.query<{ terminal_device_id: string | null }>('SELECT terminal_device_id FROM dispozitive WHERE id = $1', [dispozitivId]);
  if (!r[0]?.terminal_device_id) {
    throw new EroareUtilizator('Tableta nu are un terminal asociat; setați ID-ul terminalului în panou (Setări → Tablete)', 409);
  }
  return r[0].terminal_device_id;
}

export async function areTerminal(db: Db, dispozitivId: number): Promise<boolean> {
  const r = await db.query<{ terminal_device_id: string | null }>('SELECT terminal_device_id FROM dispozitive WHERE id = $1', [dispozitivId]);
  return !!r[0]?.terminal_device_id;
}

export async function stareTerminal(db: Db, dispozitivId: number) {
  const deviceId = await terminalulTabletei(db, dispozitivId);
  return { terminal_device_id: deviceId, stare: await client().stare(deviceId) };
}

export async function plataCard(db: Db, dispozitivId: number, suma: number, referinta: string): Promise<RezultatPlata> {
  const deviceId = await terminalulTabletei(db, dispozitivId);
  return client().plateste(deviceId, suma, referinta);
}

export async function returCard(
  db: Db,
  dispozitivId: number,
  suma: number,
  plata: { rrn?: string | null; operation_id?: string | null },
  referinta: string,
): Promise<RezultatPlata> {
  const deviceId = await terminalulTabletei(db, dispozitivId);
  return client().restituie(deviceId, suma, plata, referinta);
}

export interface BonDeLaTableta {
  comanda_id: string;
  numar: string;
  linii: { produs_id?: number | null; nume: string; cantitate: number; pret_unitar: number }[];
  metoda: 'numerar' | 'card';
  total: number;
  primit?: number | null;
  card?: { rrn?: string | null; autorizare?: string | null } | null;
}

/** Cota de TVA vine de pe produs sau din setarea implicită; tableta nu trebuie să o știe. */
export async function emiteBon(db: Db, dispozitivId: number, bon: BonDeLaTableta): Promise<RezultatBon> {
  const deviceId = await terminalulTabletei(db, dispozitivId);
  const fiscal = await citesteFiscal(db);
  const ids = [...new Set(bon.linii.map((l) => l.produs_id).filter((x): x is number => x != null))];
  const cote = new Map<number, string>();
  if (ids.length) {
    const r = await db.query<{ id: number; cota_tva: string | null }>('SELECT id, cota_tva FROM produse WHERE id = ANY($1::int[])', [ids]);
    for (const x of r) if (x.cota_tva) cote.set(x.id, x.cota_tva);
  }
  const deTrimis: BonFiscalDeTrimis = {
    uid: bon.comanda_id,
    numar: bon.numar,
    linii: bon.linii.map((l) => ({
      nume: l.nume,
      cantitate: l.cantitate,
      pret_unitar: l.pret_unitar,
      cota_tva: (l.produs_id != null && cote.get(l.produs_id)) || fiscal.cota_tva_implicita,
      cod: l.produs_id != null ? String(l.produs_id) : undefined,
    })),
    metoda: bon.metoda,
    total: bon.total,
    primit: bon.primit,
    card: bon.card,
    antet: fiscal.antet || null,
  };
  const rezultat = await client().bonFiscal(deviceId, deTrimis);
  if (rezultat.ok) {
    await db.query(
      `INSERT INTO bonuri_fiscale (comanda_id, dispozitiv_id, terminal_device_id, tip, numar, qr, receipt_id, raspuns)
       VALUES ($1, $2, $3, 'bon', $4, $5, $6, $7)
       ON CONFLICT (comanda_id) DO UPDATE SET qr = COALESCE(EXCLUDED.qr, bonuri_fiscale.qr), receipt_id = COALESCE(EXCLUDED.receipt_id, bonuri_fiscale.receipt_id)`,
      [bon.comanda_id, dispozitivId, deviceId, bon.numar, rezultat.qr ?? null, rezultat.receipt_id ?? null, JSON.stringify(rezultat)],
    );
  }
  return rezultat;
}

/** Raportul Z fiscal și, dacă se cere, închiderea zilei bancare (settlement). */
export async function raportZ(db: Db, dispozitivId: number, siZiuaBancara: boolean): Promise<{ ok: boolean; mesaj?: string }> {
  const deviceId = await terminalulTabletei(db, dispozitivId);
  const c = client();
  await c.raport(deviceId, true);
  if (siZiuaBancara) {
    try {
      await c.inchideZiuaBancara(deviceId);
    } catch (e) {
      return { ok: true, mesaj: `Raportul Z s-a tipărit, dar închiderea zilei bancare nu a reușit: ${(e as Error).message}` };
    }
  }
  return { ok: true };
}

export async function seteazaTerminal(db: Db, dispozitivId: number, terminalDeviceId: string | null): Promise<void> {
  const r = await db.query('UPDATE dispozitive SET terminal_device_id = $2 WHERE id = $1 RETURNING id', [dispozitivId, terminalDeviceId?.trim() || null]);
  if (!r.length) throw new EroareUtilizator('Tableta nu există', 404);
}
