import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';
import { EroareNegasit } from '../erori';
import { magistrala } from '../magistrala';
import { asociazaDispozitiv, utilizatorPermisTabletei } from '../servicii/acces';
import { catalogPOS } from '../servicii/catalog';
import { creeazaInventariere, finalizeazaInventariere, raportInventariere, salveazaNumaratori } from '../servicii/inventar';
import { proceseazaSync } from '../servicii/sync';

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

    p.get('/api/pos/catalog', async (req) => catalogPOS(db, req.dispozitiv!.locatie_id));

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
