// Rulează în cadrul tabletei sau al panoului: cererile către /api/ și fluxul de notificări merg
// la serverul din pagina simulării, nu în rețea. Restul aplicației rămâne neschimbat.
import type { PunteSimulare, SursaCerere } from '../punte-tipuri';

export function instaleazaPunte(sursa: SursaCerere): PunteSimulare {
  const sim = (window.parent as unknown as { __sim?: PunteSimulare }).__sim;
  if (!sim) throw new Error('Aplicația se deschide din pagina simulării.');

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (intrare: RequestInfo | URL, init?: RequestInit) => {
    const adresa = typeof intrare === 'string' ? intrare : intrare instanceof URL ? intrare.href : intrare.url;
    if (!adresa.startsWith('/api/')) return fetchOriginal(intrare, init);
    const semnal = init?.signal;
    const intrerupt = () => new DOMException('Cererea a fost întreruptă', 'AbortError');
    if (semnal?.aborted) throw intrerupt();
    const cerere = sim.cerere({
      sursa,
      metoda: init?.method ?? 'GET',
      url: adresa,
      autorizare: new Headers(init?.headers).get('authorization'),
      corp: typeof init?.body === 'string' ? init.body : null,
    });
    const r = await (semnal ? Promise.race([cerere, new Promise<never>((_, respinge) => semnal.addEventListener('abort', () => respinge(intrerupt())))]) : cerere);
    if ('fara_internet' in r) throw new TypeError('Failed to fetch');
    return new Response(r.corp || null, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  // EventSource fals: notificările vin direct de la magistrala serverului din pagină.
  class FluxSimulat extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readyState = 0;
    onopen: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    private opreste: (() => void) | null = null;
    constructor(public url: string) {
      super();
      const bilet = new URL(url, 'http://simulare.local').searchParams.get('bilet') ?? '';
      setTimeout(() => {
        if (this.readyState === 2) return;
        this.opreste = sim!.flux(bilet, (date) => this.emite(new MessageEvent('message', { data: date })));
        if (!this.opreste) return this.emite(new Event('error'));
        this.readyState = 1;
        this.emite(new Event('open'));
      });
    }
    private emite(e: Event) {
      this.dispatchEvent(e);
      if (e.type === 'open') this.onopen?.(e);
      else if (e.type === 'message') this.onmessage?.(e as MessageEvent);
      else this.onerror?.(e);
    }
    close() {
      this.readyState = 2;
      this.opreste?.();
    }
  }
  (window as unknown as { EventSource: unknown }).EventSource = FluxSimulat;

  // Cadrul e un document srcdoc, care rezolvă adresele față de pagina simulării: un link „#/stoc”
  // ar încărca pagina simulării în cadru. Navigarea din panou rămâne în același document.
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      location.hash = a.getAttribute('href')!;
    },
    true,
  );

  // Pagina simulării e într-un cadru care nu afișează dialogurile browserului: confirmările trec singure.
  window.confirm = () => true;
  window.alert = () => {};
  return sim;
}
