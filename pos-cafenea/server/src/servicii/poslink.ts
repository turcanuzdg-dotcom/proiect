// Clientul pentru POSLink (Intelectsoft): terminalul bancar Android în „regim fiscal” (de ex. PAX A930
// cu IS Fiscal) primește prin acest API atât plata cu cardul, cât și bonul fiscal de tipărit.
// Documentație: https://poslink.eservicii.md/POSLink/api-docs.html și documentația ISFiscalService
// (structura bonului, codurile de plată, literele de TVA).

import { randomUUID } from 'node:crypto';
import { EroareUtilizator } from '../erori';

export interface ConfigPOSLink {
  url: string;
  cheie: string;
}

export function configPOSLink(): ConfigPOSLink | null {
  const cheie = process.env.POSLINK_API_KEY;
  if (!cheie) return null;
  return { url: (process.env.POSLINK_URL ?? 'https://poslink.eservicii.md/POSLink').replace(/\/$/, ''), cheie };
}

/** Răspunsul standard POSLink: errorCode 0 = succes; `report` vine ca text JSON. */
interface RaspunsPOSLink {
  errorCode: number;
  errorName?: string;
  errorMessage?: string;
  report?: string | Record<string, unknown> | null;
  [k: string]: unknown;
}

const MESAJE: Record<number, string> = {
  10: 'Cheia API POSLink lipsește sau a fost respinsă',
  165: 'Tranzacția nu a fost găsită pe terminal',
  184: 'Terminalul este blocat în cabinetul POSLink',
  241: 'Terminalul nu răspunde (oprit sau fără conexiune)',
  242: 'Compania este dezactivată în POSLink',
};

export class EroarePOSLink extends EroareUtilizator {
  constructor(
    public cod: number,
    mesaj: string,
  ) {
    super(mesaj, 502);
  }
}

export interface RezultatPlata {
  aprobat: boolean;
  autorizare?: string;
  rrn?: string;
  operation_id?: string;
  mesaj?: string;
  /** true când aprobarea a fost regăsită prin „ultima tranzacție”, după un răspuns pierdut. */
  recuperata?: boolean;
}

export interface LinieBonFiscal {
  nume: string;
  cantitate: number;
  pret_unitar: number;
  cota_tva: string;
  cod?: string;
}

export interface BonFiscalDeTrimis {
  /** Identificatorul comenzii: POSLink/ISFiscal refuză un al doilea bon cu același Uid (cod 46). */
  uid: string;
  numar: string;
  linii: LinieBonFiscal[];
  metoda: 'numerar' | 'card';
  total: number;
  primit?: number | null;
  card?: { rrn?: string | null; autorizare?: string | null } | null;
  antet?: string | null;
}

export interface RezultatBon {
  ok: boolean;
  qr?: string;
  receipt_id?: string;
  mesaj?: string;
  /** Bonul exista deja pe terminal (același Uid): nu s-a tipărit a doua oară. */
  deja_emis?: boolean;
}

/** Codurile de plată MEV: 1 numerar, 2 card. Restul schimbului se dă doar din numerar. */
const COD_NUMERAR = '1';
const COD_CARD = '2';

export class ClientPOSLink {
  constructor(
    private cfg: ConfigPOSLink,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private async cere<T = RaspunsPOSLink>(metoda: 'GET' | 'POST', cale: string, date: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let r: Response;
      if (metoda === 'GET') {
        const q = new URLSearchParams({ APIKey: this.cfg.cheie, ...Object.fromEntries(Object.entries(date).map(([k, v]) => [k, String(v)])) });
        r = await this.fetchFn(`${this.cfg.url}${cale}?${q}`, { signal: ctrl.signal });
      } else {
        r = await this.fetchFn(`${this.cfg.url}${cale}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ APIKey: this.cfg.cheie, ...date }),
          signal: ctrl.signal,
        });
      }
      const text = await r.text();
      let corp: any;
      try {
        corp = JSON.parse(text);
      } catch {
        throw new EroarePOSLink(-1, `POSLink a răspuns neașteptat (${r.status})`);
      }
      if (typeof corp.report === 'string') {
        try {
          corp.report = JSON.parse(corp.report);
        } catch {
          /* raportul poate fi text simplu */
        }
      }
      return corp as T;
    } catch (e) {
      if (e instanceof EroarePOSLink) throw e;
      if ((e as Error).name === 'AbortError') throw new EroarePOSLink(241, 'Nu a venit niciun răspuns de la POSLink în timpul așteptat');
      throw new EroarePOSLink(-1, `Nu s-a putut contacta POSLink: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private verifica(r: RaspunsPOSLink, context: string): void {
    if (r.errorCode === 0) return;
    throw new EroarePOSLink(r.errorCode, `${context}: ${MESAJE[r.errorCode] ?? r.errorMessage ?? r.errorName ?? `eroare ${r.errorCode}`}`);
  }

  /** Starea terminalului: online, baterie, hârtie, bancă, semnal. */
  async stare(deviceId: string): Promise<Record<string, unknown>> {
    const r = await this.cere('GET', '/Device/Device/Status', { DeviceID: deviceId }, 25_000);
    this.verifica(r, 'Starea terminalului');
    return (r.report as Record<string, unknown>) ?? {};
  }

  /**
   * Plata cu cardul: suma apare pe terminal, clientul apropie cardul (până la 5 minute).
   * Dacă răspunsul se pierde, întrebăm terminalul de ultima tranzacție înainte de a declara
   * refuz, ca să nu-i cerem clientului să plătească de două ori. După aprobare, CloseDoc
   * eliberează terminalul pentru următoarea tranzacție.
   */
  async plateste(deviceId: string, suma: number, documentNr: string): Promise<RezultatPlata> {
    let r: RaspunsPOSLink;
    try {
      r = await this.cere('POST', '/Device/payment/Pay', { DeviceID: deviceId, amount: suma, documentNr }, 5.5 * 60_000);
    } catch (e) {
      if (e instanceof EroarePOSLink && e.cod === 241) {
        const regasita = await this.cautaInUltimaTranzactie(deviceId, documentNr, suma).catch(() => null);
        if (regasita) return { ...regasita, recuperata: true };
        return { aprobat: false, mesaj: e.message };
      }
      throw e;
    }
    if (r.errorCode === 241) {
      const regasita = await this.cautaInUltimaTranzactie(deviceId, documentNr, suma).catch(() => null);
      if (regasita) return { ...regasita, recuperata: true };
      return { aprobat: false, mesaj: MESAJE[241] };
    }
    if (r.errorCode !== 0) return { aprobat: false, mesaj: MESAJE[r.errorCode] ?? r.errorMessage ?? `Refuzat (${r.errorCode})` };
    const rap = (r.report ?? {}) as Record<string, any>;
    const rezultat: RezultatPlata = { aprobat: true, autorizare: rap.authCode ? String(rap.authCode) : undefined, rrn: rap.rrn ? String(rap.rrn) : undefined, operation_id: rap.operationId ? String(rap.operationId) : undefined };
    await this.inchideDocument(deviceId, documentNr, rezultat.operation_id).catch(() => {});
    return rezultat;
  }

  /** Schema răspunsului „ultima tranzacție” nu e publicată: căutăm defensiv referința noastră. */
  private async cautaInUltimaTranzactie(deviceId: string, documentNr: string, suma: number): Promise<RezultatPlata | null> {
    const r = await this.cere('GET', '/Device/payment/LastTransaction', { DeviceId: deviceId }, 30_000);
    if (r.errorCode !== 0) return null;
    const rap = aplatizeaza((r.report ?? r) as Record<string, unknown>);
    const doc = rap.documentnr ?? rap.documentnumber ?? rap.document;
    const amount = Number(rap.amount);
    if (doc != null && String(doc).toLowerCase() !== documentNr.toLowerCase()) return null;
    if (doc == null && (!Number.isFinite(amount) || Math.abs(amount - suma) > 0.001)) return null;
    const rezultat: RezultatPlata = {
      aprobat: true,
      autorizare: rap.authcode != null ? String(rap.authcode) : undefined,
      rrn: rap.rrn != null ? String(rap.rrn) : undefined,
      operation_id: rap.operationid != null ? String(rap.operationid) : undefined,
    };
    await this.inchideDocument(deviceId, documentNr, rezultat.operation_id).catch(() => {});
    return rezultat;
  }

  async inchideDocument(deviceId: string, documentNr: string, operationId?: string): Promise<void> {
    const r = await this.cere('POST', '/Device/payment/CloseDoc', { DeviceID: deviceId, documentNr, operationId: operationId ?? '' }, 60_000);
    this.verifica(r, 'Închiderea documentului pe terminal');
  }

  /** Restituire pe card (ziua bancară deschisă): are nevoie de RRN și de operationId ale plății. */
  async restituie(deviceId: string, suma: number, plata: { rrn?: string | null; operation_id?: string | null }, documentNr: string): Promise<RezultatPlata> {
    if (!plata.rrn) return { aprobat: false, mesaj: 'Plata originală nu are RRN; restituirea se face manual pe terminal' };
    const r = await this.cere('POST', '/Device/payment/Refund', { DeviceID: deviceId, documentNr, operationId: plata.operation_id ?? '', rrn: plata.rrn, amount: suma, currency: 'MDL' }, 90_000);
    if (r.errorCode !== 0) return { aprobat: false, mesaj: MESAJE[r.errorCode] ?? r.errorMessage ?? `Refuzat (${r.errorCode})` };
    const rap = (r.report ?? {}) as Record<string, any>;
    return { aprobat: true, autorizare: rap.authCode ? String(rap.authCode) : undefined, rrn: rap.rrn ? String(rap.rrn) : undefined, operation_id: rap.operationId ? String(rap.operationId) : undefined };
  }

  /** Închiderea zilei bancare (settlement). */
  async inchideZiuaBancara(deviceId: string): Promise<void> {
    const r = await this.cere('POST', '/Device/payment/closeDay', { DeviceID: deviceId }, 90_000);
    this.verifica(r, 'Închiderea zilei bancare');
  }

  /** Bonul fiscal, tipărit de terminal în regim fiscal. */
  async bonFiscal(deviceId: string, bon: BonFiscalDeTrimis, callback?: string): Promise<RezultatBon> {
    const Receipt = construiesteBon(bon);
    const r = await this.cere('POST', '/Device/Invoice/Pay', { DeviceID: deviceId, Receipt, ...(callback ? { CallbackURI: callback } : {}) }, 90_000);
    if (r.errorCode === 46 || /Uid/i.test(String(r.errorMessage ?? '')) && r.errorCode !== 0) {
      return { ok: true, deja_emis: true, mesaj: 'Bonul fusese deja emis' };
    }
    if (r.errorCode !== 0) return { ok: false, mesaj: MESAJE[r.errorCode] ?? r.errorMessage ?? `Eroare ${r.errorCode}` };
    const rap = (r.report ?? {}) as Record<string, any>;
    return { ok: true, qr: rap.QR ?? rap.qr ?? (r as any).QR, receipt_id: rap.ReceiptID ?? rap.receiptId ?? (r as any).ReceiptID };
  }

  /** Raport Z (fiscal=true) sau X. */
  async raport(deviceId: string, z: boolean): Promise<void> {
    const r = await this.cere('POST', '/Device/Report/Create', { DeviceID: deviceId, Fiscal: z }, 60_000);
    this.verifica(r, z ? 'Raportul Z' : 'Raportul X');
  }

  /** Depunere (+) sau ridicare (−) de numerar înregistrată pe casa fiscală. */
  async bani(deviceId: string, suma: number, motiv: string): Promise<void> {
    const cale = suma >= 0 ? '/Device/Money/In' : '/Device/Money/Out';
    const r = await this.cere('POST', cale, { DeviceID: deviceId, Amount: Math.abs(suma), Reason: motiv }, 30_000);
    this.verifica(r, 'Operațiunea de numerar pe casa fiscală');
  }
}

function aplatizeaza(o: Record<string, unknown>): Record<string, unknown> {
  const rez: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(rez, aplatizeaza(v as Record<string, unknown>));
    else rez[k.toLowerCase()] = v;
  }
  return rez;
}

/**
 * Structura bonului după ISFiscalService (RegisterFiscalReceipt), pe care POSLink o trimite
 * terminalului: linii cu Name/Quantity/Price/VAT și plăți cu Code/Amount (+ RRN pentru card).
 * Prețul unitar include opțiunile; cantitatea e pe linie. Restul se calculează pe terminal
 * din plata în numerar, deci la numerar trimitem suma primită.
 */
export function construiesteBon(bon: BonFiscalDeTrimis) {
  const Items = bon.linii.map((l) => ({
    Name: l.nume.slice(0, 120),
    Quantity: Math.round(l.cantitate * 1000) / 1000,
    Price: Math.round(l.pret_unitar * 100) / 100,
    VAT: l.cota_tva,
    ...(l.cod ? { Code: l.cod } : {}),
  }));
  const total = Math.round(bon.total * 100) / 100;
  const Payments =
    bon.metoda === 'card'
      ? [{ Code: COD_CARD, Amount: total, RRN: bon.card?.rrn ?? '', BankResponse: bon.card?.autorizare ?? '' }]
      : [{ Code: COD_NUMERAR, Amount: Math.max(total, Math.round((bon.primit ?? total) * 100) / 100) }];
  return {
    Number: bon.numar,
    Uid: bon.uid,
    Items,
    Lines: Items,
    Payments,
    DisplayType: 0,
    ...(bon.antet ? { HeaderText: bon.antet } : {}),
  };
}

export const uuidDocument = () => randomUUID();
