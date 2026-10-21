// O versiune nouă a aplicației se aplică (reîncărcarea paginii) doar când tableta nu lucrează:
// pe ecranul de PIN, nu în mijlocul unei plăți cu cardul.

type Aplicare = (reincarca?: boolean) => Promise<void>;
let aplicare: Aplicare | null = null;
let disponibila = false;
const ascultatori = new Set<() => void>();

export const actualizare = {
  get disponibila() {
    return disponibila;
  },
  marcheaza(fn: Aplicare) {
    aplicare = fn;
    disponibila = true;
    ascultatori.forEach((f) => f());
  },
  aplica() {
    if (aplicare) void aplicare(true);
  },
  aboneaza(f: () => void) {
    ascultatori.add(f);
    return () => void ascultatori.delete(f);
  },
};
