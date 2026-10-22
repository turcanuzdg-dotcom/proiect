import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';
import { EroareNegasit } from '../erori';
import { magistrala } from '../magistrala';
import { asociazaDispozitiv, utilizatorPermisTabletei } from '../servicii/acces';
import { catalogPOS } from '../servicii/catalog';
import { creeazaInventariere, finalizeazaInventariere, raportInventariere, salveazaNumaratori } from '../servicii/inventar';
import { proceseazaSync } from '../servicii/sync';
import * as terminal from '../servicii/terminal';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const linii = z.object({
  linii: z.array(z.object({ articol_id: z.number().int().positive(), faptic: z.number().finite().min(0).nullable() })).max(2000),
});

/** API-ul tabletei de la tejghea. Autentificare: tokenul tabletei, primit la asociere. */
export async function rutePOS(app: FastifyInstance, db: Db, doarDispozitiv: preHandlerAsyncHookHandler) {
  app.post('/api/pos/asociere', async (req) => {
    const { cod } = z.object({ cod: z.string().min(4).max(20) }).parse(req.body);
    return asociazaDispozitiv(db, cod);
  });

  app.register(async (p) => {
    p.addHook('preHandler', doarDispozitiv);

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

    p.post('/api/pos/sync', async (req) => {
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
      await salveazaNumaratori(db, id, linii.parse(req.body).linii);
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
