import { EventEmitter } from 'node:events';

/** Notificări în timp real (SSE) către panoul de administrare și tablete. */
export interface Notificare {
  tip: 'stoc' | 'comanda' | 'tura' | 'bani' | 'catalog' | 'sync_eroare';
  locatie_id?: number | null;
}

class Magistrala extends EventEmitter {
  trimite(n: Notificare) {
    this.emit('notificare', n);
  }
}

export const magistrala = new Magistrala();
magistrala.setMaxListeners(500);
