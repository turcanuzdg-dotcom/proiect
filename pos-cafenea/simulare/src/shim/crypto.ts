// Înlocuitorul lui node:crypto pentru serverul care rulează în browser. Acoperă doar ce folosește
// serverul: hash pentru versiunea catalogului, octeți aleatori pentru tokenuri, scrypt pentru parole.
// Simularea nu păstrează secrete reale, deci „scrypt”-ul de aici e un SHA-256 simplu.
import { sha256Hex } from '@cafenea/shared';

class Octeti extends Uint8Array {
  toString(codare?: string): string {
    if (codare === 'hex') return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join('');
    if (codare === 'base64url' || codare === 'base64') {
      const b64 = btoa(String.fromCharCode(...this));
      return codare === 'base64' ? b64 : b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    return new TextDecoder().decode(this);
  }
}

const dinHex = (hex: string) => new Octeti((hex.match(/../g) ?? []).map((x) => parseInt(x, 16)));

export function randomBytes(n: number): Octeti {
  return globalThis.crypto.getRandomValues(new Octeti(n));
}

export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export function createHash(_algoritm: string) {
  let text = '';
  return {
    update(s: string) {
      text += s;
      return this;
    },
    digest(_codare: 'hex') {
      return sha256Hex(text);
    },
  };
}

export function scrypt(parola: string, sare: string, lungime: number, gata: (e: Error | null, rez?: Octeti) => void) {
  let hex = '';
  for (let i = 0; hex.length < lungime * 2; i++) hex += sha256Hex(`${i}:${sare}:${parola}`);
  queueMicrotask(() => gata(null, dinHex(hex.slice(0, lungime * 2))));
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// acces.ts compară hash-urile cu Buffer.from(hex, 'hex').
const g = globalThis as { Buffer?: unknown; process?: unknown };
g.Buffer ??= { from: (s: string, codare: string) => (codare === 'hex' ? dinHex(s) : new TextEncoder().encode(s)) };
g.process ??= { env: {} };
