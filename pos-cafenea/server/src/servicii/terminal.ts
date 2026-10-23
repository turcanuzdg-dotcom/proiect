// Terminalul bancar în regim fiscal al fiecărei tablete (PAX A930 cu IS Fiscal, prin POSLink):
// plata cu cardul, bonul fiscal, raportul Z. Cheia API stă doar pe server.

import { COD_TERMINAL } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareUtilizator } from '../erori';
import { ClientPOSLink, configPOSLink, MESAJ_NESIGUR, uuidDocument, type BonFiscalDeTrimis, type RezultatBon, type RezultatPlata } from './poslink';
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
  if (!cfg) throw new EroareUtilizator('POSLink nu este configurat pe server (variabila POSLINK_API_KEY)', 503, COD_TERMINAL.configurare);
  return new ClientPOSLink(cfg);
}

async function terminalulTabletei(db: Db, dispozitivId: number): Promise<string> {
  const r = await db.query<{ terminal_device_id: string | null }>('SELECT terminal_device_id FROM dispozitive WHERE id = $1', [dispozitivId]);
  if (!r[0]?.terminal_device_id) {
    throw new EroareUtilizator('Tableta nu are un terminal asociat; setați ID-ul terminalului în panou (Setări → Tablete)', 409, COD_TERMINAL.configurare);
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

// ---- Plăți și retururi: registrul operațiunilor pe terminal ----

interface OperatiuneTerminal {
  id: number;
  referinta: string;
  tip: 'plata' | 'retur';
  document_nr: string;
  dispozitiv_id: number;
  locatie_id: number;
  terminal_device_id: string;
  suma: number;
  stare: 'in_curs' | 'aprobata' | 'refuzata' | 'nesigura';
  autorizare: string | null;
  rrn: string | null;
  operation_id: string | null;
  mesaj: string | null;
}

/**
 * Operațiunile aflate acum la terminal, pe „tip:referință”. O a doua cerere pentru aceeași comandă
 * (tableta a reîncercat după ce i s-a întrerupt conexiunea) se alătură celei în curs, nu trimite din nou
 * suma. Un singur proces de server, deci ajunge o hartă în memorie; după o repornire, o încercare rămasă
 * „în curs” în bază se verifică pe terminal ca una nesigură.
 */
const inCurs = new Map<string, { suma: number; dispozitiv_id: number; rezultat: Promise<RezultatPlata> }>();

/** Rulează `fn` o singură dată pe cheie; cererile simultane pentru aceeași cheie primesc același rezultat. */
async function oSinguraData(cheie: string, suma: number, dispozitivId: number, mesajInCurs: string, fn: () => Promise<RezultatPlata>): Promise<RezultatPlata> {
  const existenta = inCurs.get(cheie);
  if (existenta) {
    if (Math.abs(existenta.suma - suma) > 0.001 || existenta.dispozitiv_id !== dispozitivId) throw new EroareUtilizator(mesajInCurs, 409);
    return existenta.rezultat;
  }
  const rezultat = fn();
  inCurs.set(cheie, { suma, dispozitiv_id: dispozitivId, rezultat });
  try {
    return await rezultat;
  } finally {
    inCurs.delete(cheie);
  }
}

const dinOperatiune = (o: OperatiuneTerminal): RezultatPlata => ({
  aprobat: o.stare === 'aprobata',
  autorizare: o.autorizare ?? undefined,
  rrn: o.rrn ?? undefined,
  operation_id: o.operation_id ?? undefined,
  mesaj: o.mesaj ?? undefined,
  ...(o.stare === 'nesigura' ? { nesigur: true } : {}),
});

const stareDin = (r: RezultatPlata): OperatiuneTerminal['stare'] => (r.aprobat ? 'aprobata' : r.nesigur ? 'nesigura' : 'refuzata');

async function operatiuni(db: Db, referinta: string, tip: 'plata' | 'retur') {
  return db.query<OperatiuneTerminal>('SELECT * FROM operatiuni_terminal WHERE referinta = $1 AND tip = $2 ORDER BY id', [referinta, tip]);
}

async function deschideOperatiune(
  db: Db,
  o: { referinta: string; tip: 'plata' | 'retur'; document_nr: string; dispozitiv_id: number; terminal_device_id: string; suma: number },
): Promise<number> {
  const r = await db.query<{ id: number }>(
    `INSERT INTO operatiuni_terminal (referinta, tip, document_nr, dispozitiv_id, locatie_id, terminal_device_id, suma, stare)
     SELECT $1, $2, $3, d.id, d.locatie_id, $5, $6, 'in_curs' FROM dispozitive d WHERE d.id = $4 RETURNING id`,
    [o.referinta, o.tip, o.document_nr, o.dispozitiv_id, o.terminal_device_id, o.suma],
  );
  return r[0].id;
}

/** Încheie o încercare cu rezultatul primit. Doar câmpurile alese, niciodată răspunsul brut. */
async function incheieOperatiune(db: Db, id: number, r: RezultatPlata): Promise<void> {
  await db.query(
    `UPDATE operatiuni_terminal SET stare = $2, autorizare = COALESCE($3, autorizare), rrn = COALESCE($4, rrn),
            operation_id = COALESCE($5, operation_id), mesaj = $6, actualizata_la = now()
      WHERE id = $1`,
    [id, stareDin(r), r.autorizare ?? null, r.rrn ?? null, r.operation_id ?? null, r.mesaj ? r.mesaj.slice(0, 500) : null],
  );
}

/**
 * Trimite operațiunea la terminal și o încheie în registru. O eroare neașteptată în timpul trimiterii
 * (POSLink căzut, răspuns ilizibil) lasă operațiunea „nesigură”: suma poate să fi ajuns la terminal.
 */
async function executa(db: Db, id: number, fn: () => Promise<RezultatPlata>): Promise<RezultatPlata> {
  let r: RezultatPlata;
  try {
    r = await fn();
  } catch (e) {
    r = { aprobat: false, nesigur: true, mesaj: `${MESAJ_NESIGUR} (${(e as Error).message})` };
  }
  await incheieOperatiune(db, id, r);
  return r;
}

/**
 * O încercare rămasă nesigură (sau „în curs” după o repornire) se verifică pe terminal, fără o nouă
 * trimitere. Rămâne nesigură până când terminalul o confirmă sau o refuză explicit: o „ultimă tranzacție”
 * care nu o cuprinde nu dovedește că suma n-a fost luată. Tableta are pentru asta „Plata nu a trecut”.
 */
async function verificaNesigura(db: Db, o: OperatiuneTerminal): Promise<RezultatPlata> {
  return executa(db, o.id, () => client().verificaPlata(o.terminal_device_id, o.document_nr, Number(o.suma), null));
}

/**
 * Plata cu cardul, idempotentă pe referință (id-ul comenzii):
 *  - o plată deja aprobată se întoarce așa cum e înregistrată, fără o nouă trimitere la terminal;
 *  - o plată în curs pentru aceeași referință se așteaptă (aceeași sumă) sau se refuză cu 409;
 *  - o încercare nesigură se verifică pe terminal („ultima tranzacție”), nu se retrimite;
 *  - după un refuz definitiv se poate încerca din nou, și cu altă sumă (coșul s-a schimbat).
 */
export async function plataCard(db: Db, dispozitivId: number, suma: number, referinta: string): Promise<RezultatPlata> {
  const deviceId = await terminalulTabletei(db, dispozitivId);
  const c = client();
  return oSinguraData(`plata:${referinta}`, suma, dispozitivId, 'Plata este în curs pe terminal', async () => {
    const anterioare = await operatiuni(db, referinta, 'plata');
    if (anterioare.some((o) => o.dispozitiv_id !== dispozitivId)) throw new EroareUtilizator('Referința plății aparține altei tablete', 409);
    const aprobata = anterioare.find((o) => o.stare === 'aprobata');
    if (aprobata) {
      if (Math.abs(Number(aprobata.suma) - suma) > 0.001) {
        // Coșul s-a schimbat după o aprobare al cărei răspuns s-a pierdut: clientul a plătit deja această sumă.
        throw new EroareUtilizator(`Plata pentru această comandă a fost deja aprobată, pentru ${Number(aprobata.suma).toFixed(2)} lei`, 409, COD_TERMINAL.plataDejaAprobata, {
          suma_aprobata: Number(aprobata.suma),
        });
      }
      return dinOperatiune(aprobata);
    }
    const ultima = anterioare.at(-1);
    if (ultima && (ultima.stare === 'nesigura' || ultima.stare === 'in_curs')) {
      if (Math.abs(Number(ultima.suma) - suma) > 0.001) {
        throw new EroareUtilizator('Plata anterioară a acestei comenzi nu e lămurită; verificați terminalul înainte de a schimba suma', 409, COD_TERMINAL.plataNelamurita, {
          suma_nelamurita: Number(ultima.suma),
        });
      }
      return verificaNesigura(db, ultima);
    }
    const id = await deschideOperatiune(db, { referinta, tip: 'plata', document_nr: referinta, dispozitiv_id: dispozitivId, terminal_device_id: deviceId, suma });
    return executa(db, id, () => c.plateste(deviceId, suma, referinta));
  });
}

/**
 * Restituirea pe card a unei comenzi (referinta = id-ul comenzii). Se face doar în contul plății aprobate
 * a acelei comenzi din registrul terminalului: RRN-ul, operationId și suma vin de acolo, niciodată din
 * cerere. Returul e integral (anularea comenzii), deci cel mult unul aprobat pe comandă: o cerere repetată
 * primește returul înregistrat, iar unul nesigur se verifică înainte de orice retrimitere. Un retur parțial
 * sau fără plată înregistrată (vânzare din pilotul manual, de dinaintea registrului) se face din meniul
 * terminalului; codul erorii îi spune tabletei să ceară asta baristei.
 */
export async function returCard(db: Db, dispozitivId: number, referinta: string, sumaCeruta?: number | null): Promise<RezultatPlata & { suma?: number }> {
  const deviceId = await terminalulTabletei(db, dispozitivId);
  const c = client();
  const locatie = (await db.query<{ locatie_id: number }>('SELECT locatie_id FROM dispozitive WHERE id = $1', [dispozitivId]))[0].locatie_id;
  const plata = (await operatiuni(db, referinta, 'plata')).find((o) => o.stare === 'aprobata');
  if (!plata || plata.locatie_id !== locatie) {
    throw new EroareUtilizator('Returul pe card se face din meniul terminalului', 409, COD_TERMINAL.returDinMeniu);
  }
  // RRN-ul plății e cunoscut doar de terminalul care a încasat-o (și de lotul lui bancar).
  if (plata.terminal_device_id !== deviceId) {
    throw new EroareUtilizator(`Plata s-a încasat pe terminalul ${plata.terminal_device_id}; returul se face de acolo`, 409, COD_TERMINAL.returAltTerminal, {
      terminal: plata.terminal_device_id,
    });
  }
  // Fără RRN, POSLink nu are după ce restitui (o aprobare veche, recuperată fără el).
  if (!plata.rrn) throw new EroareUtilizator('Plata nu are RRN; returul pe card se face din meniul terminalului', 409, COD_TERMINAL.returDinMeniu);
  const suma = Number(plata.suma);
  if (sumaCeruta != null && Math.abs(sumaCeruta - suma) > 0.001) {
    throw new EroareUtilizator(`Returul pe card se face integral (${suma.toFixed(2)} lei); un retur parțial se face din meniul terminalului`, 409);
  }
  return oSinguraData(`retur:${referinta}`, suma, dispozitivId, 'Returul este în curs pe terminal', async () => {
    const retururi = await operatiuni(db, referinta, 'retur');
    // Comanda e deja restituită: aceeași cerere repetată primește returul înregistrat.
    const aprobat = retururi.find((o) => o.stare === 'aprobata');
    if (aprobat) return { ...dinOperatiune(aprobat), suma: Number(aprobat.suma) };
    const neincheiat = retururi.find((o) => o.stare === 'nesigura' || o.stare === 'in_curs');
    if (neincheiat) {
      const r = await verificaNesigura(db, neincheiat);
      if (r.aprobat || r.nesigur) return { ...r, suma: Number(neincheiat.suma) };
    }
    const documentNr = uuidDocument();
    const id = await deschideOperatiune(db, { referinta, tip: 'retur', document_nr: documentNr, dispozitiv_id: dispozitivId, terminal_device_id: deviceId, suma });
    const r = await executa(db, id, () => c.restituie(deviceId, suma, { rrn: plata.rrn, operation_id: plata.operation_id }, documentNr));
    return { ...r, suma };
  });
}

/** Plata aprobată a unei comenzi, din registrul terminalului (bonul fiscal și confirmarea vânzării o folosesc). */
export async function plataAprobata(db: Db, comandaId: string) {
  const r = await db.query<{ suma: number; rrn: string | null; autorizare: string | null }>(
    `SELECT suma, rrn, autorizare FROM operatiuni_terminal WHERE referinta = $1 AND tip = 'plata' AND stare = 'aprobata'`,
    [comandaId],
  );
  return r[0] ? { ...r[0], suma: Number(r[0].suma) } : null;
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
  // Totalul bonului trebuie să fie suma liniilor: tableta le calculează din aceeași comandă.
  const linii = bon.linii.reduce((s, l) => s + Math.round(l.cantitate * l.pret_unitar * 100) / 100, 0);
  if (Math.abs(bon.total - linii) > 0.01) {
    throw new EroareUtilizator(`Totalul bonului (${bon.total.toFixed(2)}) nu corespunde liniilor (${linii.toFixed(2)})`);
  }
  // La card, RRN-ul și codul de autorizare vin din plata înregistrată de server, nu de la tabletă.
  let card = bon.card;
  if (bon.metoda === 'card') {
    const plata = await plataAprobata(db, bon.comanda_id);
    if (plata) card = { rrn: plata.rrn, autorizare: plata.autorizare };
  }
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
    card,
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
