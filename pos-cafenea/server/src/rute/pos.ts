import type { FastifyInstance, onRequestAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';
import { EroareNegasit } from '../erori';
import { magistrala } from '../magistrala';
import { LIMITA_CORP_SYNC } from '../limite';
import { asociazaDispozitiv, utilizatorPermisTabletei } from '../servicii/acces';
import { auditNumaratori, hookAudit } from '../servicii/audit';
import { catalogPOS } from '../servicii/catalog';
import { creeazaInventariere, finalizeazaInventariere, raportInventariere, salveazaNumaratori } from '../servicii/inventar';
import { proceseazaSync } from '../servicii/sync';
import * as terminal from '../servicii/terminal';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const linii = z.object({
  // Plafonul ține valoarea în coloana numeric(14, 3) (100 de tone sau 100 000 de litri într-un depozit ajung).
  linii: z.array(z.object({ articol_id: z.number().int().positive(), faptic: z.number().finite().min(0).max(100_000_000).nullable() })).max(2000),
});

/** API-ul tabletei de la tejghea. Autentificare: tokenul tabletei, primit la asociere. */
export async function rutePOS(app: FastifyInstance, db: Db, doarDispozitiv: onRequestAsyncHookHandler) {
  // Operațiunile tabletei în afara cozii de sincronizare (terminal, inventariere, asociere) ajung în
  // jurnalul de audit; evenimentele din coadă se păstrează oricum în evenimente_sync.
  app.addHook('onResponse', hookAudit(db));

  app.post('/api/pos/asociere', async (req) => {
    const { cod } = z.object({ cod: z.string().min(4).max(20) }).parse(req.body);
    const r = await asociazaDispozitiv(db, cod);
    req.dispozitiv = r.dispozitiv; // pentru jurnal: ce tabletă a fost asociată, de pe ce adresă
    return r;
  });

  app.register(async (p) => {
    // În onRequest, înainte de citirea corpului: o cerere fără token nu mai costă parsarea JSON-ului.
    p.addHook('onRequest', doarDispozitiv);

    p.get('/api/pos/catalog', async (req) => ({
      ...(await catalogPOS(db, req.dispozitiv!.locatie_id)),
      // Tableta află dacă are un terminal fiscal prin server, ca să-l aleagă din oficiu.
      terminal_prin_server: terminal.poslinkConfigurat() && (await terminal.areTerminal(db, req.dispozitiv!.id)),
    }));

    // ---- Terminalul bancar în regim fiscal (POSLink): plată, retur, bon fiscal, raport Z ----
    const bani = z.number().finite().positive().max(1_000_000);
    p.get('/api/pos/terminal/configurat', async (req) => ({
      configurat: terminal.poslinkConfigurat(),
      are_terminal: await terminal.areTerminal(db, req.dispozitiv!.id),
    }));
    p.get('/api/pos/terminal/stare', async (req) => terminal.stareTerminal(db, req.dispozitiv!.id));
    p.post('/api/pos/terminal/plata', async (req) => {
      const d = z.object({ suma: bani, referinta: z.string().uuid() }).parse(req.body);
      return terminal.plataCard(db, req.dispozitiv!.id, d.suma, d.referinta);
    });
    p.post('/api/pos/terminal/retur', async (req) => {
      const d = z.object({ suma: bani, referinta: z.string().uuid(), rrn: z.string().max(100).nullish(), operation_id: z.string().max(100).nullish() }).parse(req.body);
      return terminal.returCard(db, req.dispozitiv!.id, d.suma, { rrn: d.rrn, operation_id: d.operation_id }, d.referinta);
    });
    p.post('/api/pos/terminal/bon', async (req) => {
      const d = z
        .object({
          comanda_id: z.string().uuid(),
          numar: z.string().max(40),
          linii: z.array(z.object({ produs_id: z.number().int().positive().nullish(), nume: z.string().min(1).max(200), cantitate: z.number().positive().max(10_000), pret_unitar: z.number().min(0).max(1_000_000) })).min(1).max(200),
          metoda: z.enum(['numerar', 'card']),
          total: z.number().min(0).max(1_000_000),
          primit: z.number().min(0).max(1_000_000).nullish(),
          card: z.object({ rrn: z.string().max(100).nullish(), autorizare: z.string().max(100).nullish() }).nullish(),
        })
        .parse(req.body);
      return terminal.emiteBon(db, req.dispozitiv!.id, d);
    });
    p.post('/api/pos/terminal/raport-z', async (req) => {
      const { si_ziua_bancara } = z.object({ si_ziua_bancara: z.boolean().optional() }).parse(req.body ?? {});
      return terminal.raportZ(db, req.dispozitiv!.id, si_ziua_bancara ?? true);
    });

    // Coada vine în loturi de câte 100 de evenimente: are o limită proprie, mai mare decât restul API-ului.
    // Fiind apelată la fiecare 5 s de fiecare tabletă, se scrie în jurnal doar peste „warn”.
    p.post('/api/pos/sync', { bodyLimit: LIMITA_CORP_SYNC, logLevel: 'warn' }, async (req) => {
      const { evenimente } = z.object({ evenimente: z.array(z.unknown()).max(500) }).parse(req.body);
      return proceseazaSync(db, { locatie_id: req.dispozitiv!.locatie_id, dispozitiv_id: req.dispozitiv!.id }, evenimente);
    });

    // Inventarierea are nevoie de conexiune: scripticul vine de pe server, în timp real.
    const aLocatiei = async (id: number, locatieId: number) => {
      const r = await db.query('SELECT 1 FROM inventarieri WHERE id = $1 AND locatie_id = $2', [id, locatieId]);
      if (!r.length) throw new EroareNegasit('Inventarierea');
    };

    p.post('/api/pos/inventarieri', async (req) => {
      const { utilizator_id } = z.object({ utilizator_id: z.number().int().positive().nullish() }).parse(req.body ?? {});
      if (utilizator_id) await utilizatorPermisTabletei(db, utilizator_id, req.dispozitiv!.locatie_id);
      const { id } = await creeazaInventariere(db, { locatie_id: req.dispozitiv!.locatie_id, utilizator_id, dispozitiv_id: req.dispozitiv!.id });
      return raportInventariere(db, id);
    });

    p.get('/api/pos/inventarieri/:id', async (req) => {
      const { id } = idParam.parse(req.params);
      await aLocatiei(id, req.dispozitiv!.locatie_id);
      return raportInventariere(db, id);
    });

    p.put('/api/pos/inventarieri/:id/linii', async (req) => {
      const { id } = idParam.parse(req.params);
      await aLocatiei(id, req.dispozitiv!.locatie_id);
      const { linii: lista } = linii.parse(req.body);
      ({ corp: req.auditCorp, inainte: req.auditInainte } = await auditNumaratori(db, id, lista));
      await salveazaNumaratori(db, id, lista);
      return raportInventariere(db, id);
    });

    p.post('/api/pos/inventarieri/:id/finalizeaza', async (req) => {
      const { id } = idParam.parse(req.params);
      await aLocatiei(id, req.dispozitiv!.locatie_id);
      await finalizeazaInventariere(db, id);
      magistrala.trimite({ tip: 'stoc', locatie_id: req.dispozitiv!.locatie_id });
      return raportInventariere(db, id);
    });
  });
}

export const schemaLiniiInventar = linii;
