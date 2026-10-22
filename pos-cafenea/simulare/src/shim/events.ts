// Înlocuitorul lui node:events: magistrala de notificări a serverului (SSE) are nevoie doar de atât.
type Ascultator = (...args: any[]) => void;

export class EventEmitter {
  private ascultatori = new Map<string, Set<Ascultator>>();
  on(ev: string, f: Ascultator) {
    if (!this.ascultatori.has(ev)) this.ascultatori.set(ev, new Set());
    this.ascultatori.get(ev)!.add(f);
    return this;
  }
  off(ev: string, f: Ascultator) {
    this.ascultatori.get(ev)?.delete(f);
    return this;
  }
  emit(ev: string, ...args: unknown[]) {
    const s = this.ascultatori.get(ev);
    s?.forEach((f) => f(...args));
    return !!s?.size;
  }
  setMaxListeners(_n: number) {
    return this;
  }
}
