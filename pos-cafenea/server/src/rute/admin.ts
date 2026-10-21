import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';
import { magistrala } from '../magistrala';
import * as acces from '../servicii/acces';
import { adaugaMiscareBani, listaMiscariBani, rezumatBani } from '../servicii/bani';
import * as catalog from '../servicii/catalog';
import { creeazaReceptie, creeazaTransfer, detaliuReceptie, listaReceptii, listaTransferuri } from '../servicii/gestiune';
import * as inventar from '../servicii/inventar';
import { panou } from '../servicii/panou';
import { comparaPerioade, raportConsum, raportPierderi, raportVanzari, serieZilnica } from '../servicii/rapoarte';
import { citesteTolerante, scrieSetare } from '../servicii/setari';
import { fisaArticol, stocLocatie, stocToateLocatiile } from '../servicii/stoc';
import { detaliuTura, listaTure, verificaTura } from '../servicii/ture';
import { listaComenzi } from '../servicii/vanzari';
import { listaEroriSync, marcheazaRezolvat, reaplicaEveniment } from '../servicii/sync';
import { schemaLiniiInventar } from './pos';

const idNum = z.object({ id: z.coerce.number().int().positive() });
const idUuid = z.object({ id: z.string().uuid() });
const locOpt = z.coerce.number().int().positive().optional();
const data = z.string().min(10).max(40);
const interval = z.object({ de: data, pana: data, locatie_id: locOpt });
const nume = z.string().trim().min(1).max(120);
const cantitate = z.number().finite().positive().max(10_000_000);
const linieReteta = z.object({ articol_id: z.number().int().positive(), cantitate });

const schemaArticol = z.object({
  nume,
  um: z.enum(['g', 'ml', 'buc']),
  tip: z.enum(['materie_prima', 'ambalaj', 'marfa']),
  prag_minim: z.number().finite().min(0).optional(),
  activ: z.boolean().optional(),
});
const schemaProdus = z.object({
  nume,
  categorie_id: z.number().int().positive().nullable(),
  pret: z.number().finite().min(0).max(100_000),
  doze_cafea: z.number().finite().min(0).max(20).optional(),
  ordine: z.number().int().optional(),
  activ: z.boolean().optional(),
  reteta: z.array(linieReteta).max(50),
  modificatori: z.array(z.number().int().positive()).max(50),
});
const schemaModificator = z.object({
  nume,
  pret: z.number().finite().min(0).max(100_000),
  doze_cafea: z.number().finite().min(0).max(20).optional(),
  inlocuieste_articol_id: z.number().int().positive().nullish(),
  inlocuitor_articol_id: z.number().int().positive().nullish(),
  adauga: z.array(z.object({ articol_id: z.number().int().positive(), cantitate: z.number().finite().refine((x) => x !== 0) })).max(50),
  activ: z.boolean().optional(),
});
const schemaUtilizator = z.object({
  nume,
  rol: z.enum(['admin', 'barista']),
  login: z.string().trim().max(60).nullish(),
  parola: z.string().max(200).nullish(),
  pin: z.string().max(6).nullish(),
  locatie_id: z.number().int().positive().nullish(),
  activ: z.boolean().optional(),
});
const schemaLocatie = z.object({ nume, tip: z.enum(['depozit', 'punct']), activ: z.boolean().optional() });

/** API-ul panoului de administrare. Autentificare: sesiunea adminului. */
export async function ruteAdmin(app: FastifyInstance, db: Db, doarAdmin: preHandlerAsyncHookHandler) {
  app.post('/api/auth/login', async (req) => {
    const { login, parola } = z.object({ login: z.string().min(1).max(60), parola: z.string().min(1).max(200) }).parse(req.body);
    return acces.autentificare(db, login, parola, req.ip);
  });

  app.register(async (a) => {
    a.addHook('preHandler', doarAdmin);
    const anunta = (tip: Parameters<typeof magistrala.trimite>[0]['tip'], locatie_id?: number | null) => magistrala.trimite({ tip, locatie_id });

    a.get('/api/auth/eu', async (req) => req.utilizator);
    a.post('/api/auth/logout', async (req) => {
      await acces.iesire(db, req.headers.authorization!.slice(7));
      return { ok: true };
    });

    // ---- Locații, utilizatori, tablete, setări ----
    a.get('/api/locatii', async () => acces.listaLocatii(db));
    a.post('/api/locatii', async (req) => acces.salveazaLocatie(db, schemaLocatie.parse(req.body)));
    a.put('/api/locatii/:id', async (req) => acces.salveazaLocatie(db, schemaLocatie.parse(req.body), idNum.parse(req.params).id));

    a.get('/api/utilizatori', async () => acces.listaUtilizatori(db));
    a.post('/api/utilizatori', async (req) => {
      const r = await acces.salveazaUtilizator(db, schemaUtilizator.parse(req.body));
      anunta('catalog');
      return r;
    });
    a.put('/api/utilizatori/:id', async (req) => {
      const r = await acces.salveazaUtilizator(db, schemaUtilizator.parse(req.body), idNum.parse(req.params).id, req.headers.authorization!.slice(7));
      anunta('catalog');
      return r;
    });

    a.get('/api/dispozitive', async () => acces.listaDispozitive(db));
    a.post('/api/dispozitive', async (req) => {
      const d = z.object({ nume, locatie_id: z.number().int().positive() }).parse(req.body);
      return acces.creeazaDispozitiv(db, d.nume, d.locatie_id);
    });
    a.post('/api/dispozitive/:id/reasociere', async (req) => acces.reasociazaDispozitiv(db, idNum.parse(req.params).id));
    a.put('/api/dispozitive/:id/activ', async (req) => {
      await acces.activeazaDispozitiv(db, idNum.parse(req.params).id, z.object({ activ: z.boolean() }).parse(req.body).activ);
      return { ok: true };
    });

    a.get('/api/setari/tolerante', async () => citesteTolerante(db));
    a.put('/api/setari/tolerante', async (req) => {
      const t = z.object({ numerar: z.number().min(0), card: z.number().min(0), doze: z.number().min(0) }).parse(req.body);
      await scrieSetare(db, 'tolerante', t);
      return t;
    });

    // ---- Rețetar ----
    a.get('/api/articole', async () => catalog.listaArticole(db));
    a.post('/api/articole', async (req) => catalog.salveazaArticol(db, schemaArticol.parse(req.body)));
    a.put('/api/articole/:id', async (req) => catalog.salveazaArticol(db, schemaArticol.parse(req.body), idNum.parse(req.params).id));

    a.get('/api/categorii', async () => catalog.listaCategorii(db));
    a.post('/api/categorii', async (req) => {
      const r = await catalog.salveazaCategorie(db, z.object({ nume, ordine: z.number().int().optional() }).parse(req.body));
      anunta('catalog');
      return r;
    });
    a.put('/api/categorii/:id', async (req) => {
      const r = await catalog.salveazaCategorie(db, z.object({ nume, ordine: z.number().int().optional() }).parse(req.body), idNum.parse(req.params).id);
      anunta('catalog');
      return r;
    });

    a.get('/api/produse', async () => catalog.listaProduse(db));
    a.post('/api/produse', async (req) => {
      const r = await catalog.salveazaProdus(db, schemaProdus.parse(req.body));
      anunta('catalog');
      return r;
    });
    a.put('/api/produse/:id', async (req) => {
      const r = await catalog.salveazaProdus(db, schemaProdus.parse(req.body), idNum.parse(req.params).id);
      anunta('catalog');
      return r;
    });

    a.get('/api/modificatori', async () => catalog.listaModificatori(db));
    a.post('/api/modificatori', async (req) => {
      const r = await catalog.salveazaModificator(db, schemaModificator.parse(req.body));
      anunta('catalog');
      return r;
    });
    a.put('/api/modificatori/:id', async (req) => {
      const r = await catalog.salveazaModificator(db, schemaModificator.parse(req.body), idNum.parse(req.params).id);
      anunta('catalog');
      return r;
    });

    // ---- Stocuri și documente ----
    a.get('/api/stoc', async (req) => {
      const { locatie_id } = z.object({ locatie_id: locOpt }).parse(req.query);
      return locatie_id ? stocLocatie(db, locatie_id) : stocToateLocatiile(db);
    });
    a.get('/api/stoc/fisa', async (req) => {
      const q = z.object({ locatie_id: z.coerce.number().int().positive(), articol_id: z.coerce.number().int().positive() }).parse(req.query);
      return fisaArticol(db, q.locatie_id, q.articol_id);
    });

    a.get('/api/receptii', async (req) => listaReceptii(db, z.object({ locatie_id: locOpt }).parse(req.query).locatie_id));
    a.get('/api/receptii/:id', async (req) => detaliuReceptie(db, idNum.parse(req.params).id));
    a.post('/api/receptii', async (req) => {
      const d = z
        .object({
          locatie_id: z.number().int().positive(),
          furnizor: nume,
          nr_factura: z.string().trim().min(1).max(60),
          data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          linii: z.array(z.object({ articol_id: z.number().int().positive(), cantitate, cost_unitar: z.number().finite().min(0) })).min(1).max(500),
        })
        .parse(req.body);
      const r = await creeazaReceptie(db, d, req.utilizator!.id);
      anunta('stoc', d.locatie_id);
      return r;
    });

    a.get('/api/transferuri', async (req) => listaTransferuri(db, z.object({ locatie_id: locOpt }).parse(req.query).locatie_id));
    a.post('/api/transferuri', async (req) => {
      const d = z
        .object({
          din_locatie_id: z.number().int().positive(),
          in_locatie_id: z.number().int().positive(),
          observatii: z.string().max(500).nullish(),
          linii: z.array(z.object({ articol_id: z.number().int().positive(), cantitate })).min(1).max(500),
        })
        .parse(req.body);
      const r = await creeazaTransfer(db, d, req.utilizator!.id);
      anunta('stoc', d.din_locatie_id);
      anunta('stoc', d.in_locatie_id);
      return r;
    });

    a.get('/api/inventarieri', async (req) => inventar.listaInventarieri(db, z.object({ locatie_id: locOpt }).parse(req.query).locatie_id));
    a.post('/api/inventarieri', async (req) => {
      const { locatie_id } = z.object({ locatie_id: z.number().int().positive() }).parse(req.body);
      return inventar.creeazaInventariere(db, { locatie_id, utilizator_id: req.utilizator!.id });
    });
    a.get('/api/inventarieri/:id', async (req) => inventar.raportInventariere(db, idNum.parse(req.params).id));
    a.put('/api/inventarieri/:id/linii', async (req) => {
      const { id } = idNum.parse(req.params);
      await inventar.salveazaNumaratori(db, id, schemaLiniiInventar.parse(req.body).linii);
      return inventar.raportInventariere(db, id);
    });
    a.post('/api/inventarieri/:id/finalizeaza', async (req) => {
      const { id } = idNum.parse(req.params);
      await inventar.finalizeazaInventariere(db, id);
      const r = await inventar.raportInventariere(db, id);
      anunta('stoc', r.locatie_id);
      return r;
    });

    // ---- Vânzări, ture, bani ----
    a.get('/api/comenzi', async (req) => {
      const f = z
        .object({ locatie_id: locOpt, tura_id: z.string().uuid().optional(), de: data.optional(), pana: data.optional(), metoda: z.enum(['numerar', 'card', 'casare']).optional(), limita: z.coerce.number().int().positive().optional() })
        .parse(req.query);
      return listaComenzi(db, f);
    });

    a.get('/api/ture', async (req) => {
      const f = z
        .object({ locatie_id: locOpt, doar_discrepante: z.stringbool().optional(), neverificate: z.stringbool().optional() })
        .parse(req.query);
      return listaTure(db, f);
    });
    a.get('/api/ture/:id', async (req) => detaliuTura(db, idUuid.parse(req.params).id));
    a.post('/api/ture/:id/verifica', async (req) => {
      const { id } = idUuid.parse(req.params);
      const { nota } = z.object({ nota: z.string().max(1000).nullish() }).parse(req.body ?? {});
      await verificaTura(db, id, req.utilizator!.id, nota ?? null);
      anunta('tura');
      return { ok: true };
    });

    a.get('/api/bani/rezumat', async (req) => {
      const q = z.object({ de: data, pana: data }).parse(req.query);
      return rezumatBani(db, q.de, q.pana);
    });
    a.get('/api/bani/miscari', async (req) => {
      const f = z.object({ locatie_id: locOpt, cont: z.enum(['numerar', 'card']).optional(), de: data.optional(), pana: data.optional() }).parse(req.query);
      return listaMiscariBani(db, f);
    });
    a.post('/api/bani/miscari', async (req) => {
      const d = z
        .object({
          locatie_id: z.number().int().positive(),
          tip: z.enum(['depunere', 'alimentare', 'plata_marunta']),
          suma: z.number().finite().positive().max(10_000_000),
          descriere: z.string().trim().min(1).max(300),
        })
        .parse(req.body);
      const r = await adaugaMiscareBani(db, d, req.utilizator!.id);
      anunta('bani', d.locatie_id);
      return r;
    });

    // ---- Rapoarte ----
    const grupare = z.enum(['produs', 'categorie']).default('produs');
    a.get('/api/rapoarte/vanzari', async (req) => {
      const q = interval.extend({ grupare }).parse(req.query);
      const [randuri, serie] = await Promise.all([raportVanzari(db, q, q.grupare), serieZilnica(db, q)]);
      return { randuri, serie };
    });
    a.get('/api/rapoarte/comparatie', async (req) => {
      const q = z.object({ a_de: data, a_pana: data, b_de: data, b_pana: data, locatie_id: locOpt, grupare }).parse(req.query);
      return comparaPerioade(
        db,
        { de: q.a_de, pana: q.a_pana, locatie_id: q.locatie_id },
        { de: q.b_de, pana: q.b_pana, locatie_id: q.locatie_id },
        q.grupare,
      );
    });
    a.get('/api/rapoarte/consum', async (req) => raportConsum(db, interval.parse(req.query)));
    a.get('/api/rapoarte/pierderi', async (req) => raportPierderi(db, interval.parse(req.query)));

    a.get('/api/panou', async (req) => panou(db, z.object({ de_azi: data }).parse(req.query).de_azi));

    // ---- Evenimente offline care n-au putut fi aplicate ----
    a.get('/api/sync/erori', async () => listaEroriSync(db));
    a.post('/api/sync/erori/:id/reaplica', async (req) => {
      await reaplicaEveniment(db, idUuid.parse(req.params).id);
      return { ok: true };
    });
    a.post('/api/sync/erori/:id/rezolvat', async (req) => {
      await marcheazaRezolvat(db, idUuid.parse(req.params).id);
      return { ok: true };
    });
  });
}
