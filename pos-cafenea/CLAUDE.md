# pos-cafenea

Soft POS + gestiune pentru o rețea de cafenele (client al utilizatorului). Independent de restul
depozitului (hasurarea PDF-urilor Primăriei Băcioi): regulile de hasurare din CLAUDE.md-ul de la
rădăcină nu se aplică aici.

- Monorepo npm: `shared/` (tipuri, calcule), `server/` (Fastify + PostgreSQL/PGlite), `web/` (Vite +
  React: `src/pos` tableta, `src/admin` panoul), `punte/` (terminal și imprimantă fiscală).
- Interfața și comentariile sunt în română, cu diacritice; numele din cod tot în română.
- Stocul și banii sunt registre de mișcări: nu adăuga câmpuri de „stoc curent” care se suprascriu.
- Orice operație făcută pe tabletă este un eveniment cu UUID în coada offline (`shared/src/tipuri.ts`,
  `server/src/servicii/sync.ts`); aplicarea pe server trebuie să rămână idempotentă și în ordine.
- Schema bazei: migrații noi în `server/migrari/NNN_*.sql`, niciodată modificări în cele existente.
- Înainte de commit: `npm test` și `npm run typecheck` (din `pos-cafenea/`).
- `simulare/` rulează serverul real în browser (rutele prin `simulare/src/server/ruter.ts`, modulele Node
  înlocuite în `simulare/src/shim`); serviciile nu au voie să importe alte module Node decât cele de acolo.
- Testele în browser se fac cu Playwright din scratchpad (Chromium la `/opt/pw-browsers/chromium`).
