import type { FastifyInstance, onRequestAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';
import { EroareUtilizator } from '../erori';
import { magistrala } from '../magistrala';
import * as acces from '../servicii/acces';
import { auditeaza, auditNumaratori, hookAudit, JurnalLoginNecunoscut, listaJurnal, stareAnterioara } from '../servicii/audit';
import { adaugaMiscareBani, listaMiscariBani, rezumatBani } from '../servicii/bani';
import * as catalog from '../servicii/catalog';
import { creeazaReceptie, creeazaTransfer, detaliuReceptie, listaReceptii, listaTransferuri } from '../servicii/gestiune';
import * as inventar from '../servicii/inventar';
import { panou } from '../servicii/panou';
import { comparaPerioade, raportConsum, raportPierderi, raportVanzari, serieZilnica } from '../servicii/rapoarte';
import { citesteSetariTableta, citesteTolerante, scrieSetare } from '../servicii/setari';
import { fisaArticol, stocLocatie, stocToateLocatiile } from '../servicii/stoc';
import { detaliuTura, listaTure, verificaTura } from '../servicii/ture';
import { listaComenzi } from '../servicii/vanzari';
import { detaliuEroareSync, listaEroriSync, listaOreSuspecte, marcheazaRezolvat, reaplicaEveniment } from '../servicii/sync';
import * as terminal from '../servicii/terminal';
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
  cota_tva: z.string().regex(/^[A-Z_]$/, 'o literă A–Z sau _').nullish(),
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

/** Parola unui administrator pusă din panou: cel puțin 12 caractere (contul vede toți banii rețelei). */
export const LUNGIME_MINIMA_PAROLA_ADMIN = 12;
function verificaParolaAdmin(d: z.infer<typeof schemaUtilizator>) {
  if (d.rol === 'admin' && d.parola && d.parola.length < LUNGIME_MINIMA_PAROLA_ADMIN) {
    throw new EroareUtilizator(`Parola unui administrator are cel puțin ${LUNGIME_MINIMA_PAROLA_ADMIN} caractere`);
  }
}

/** API-ul panoului de administrare. Autentificare: sesiunea adminului. */
export async function ruteAdmin(app: FastifyInstance, db: Db, doarAdmin: onRequestAsyncHookHandler) {
  // Orice modificare făcută din panou ajunge în jurnalul de audit (după răspuns).
  app.addHook('onResponse', hookAudit(db));

  const loginNecunoscut = new JurnalLoginNecunoscut();
  // La oprire (app.close() după SIGTERM), încercările numărate și încă nescrise ajung în jurnal
  // înainte să se închidă baza (index.ts închide întâi aplicația, apoi baza).
  app.addHook('onClose', async () => {
    for (const i of loginNecunoscut.vida()) await auditeaza(db, i, app.log);
  });
  app.post('/api/auth/login', async (req) => {
    const { login, parola } = z.object({ login: z.string().min(1).max(60), parola: z.string().min(1).max(200) }).parse(req.body);
    try {
      const r = await acces.autentificare(db, login, parola, req.ip);
      await auditeaza(db, { utilizator_id: r.utilizator.id, adresa: req.ip, actiune: 'login.reusit', cale: '/api/auth/login', stare_http: 200, date: { login } }, req.log);
      return r;
    } catch (e) {
      // Încercările refuzate fără verificarea parolei (429: pauză după eșecuri) nu se scriu deloc.
      // Un cont real: un rând pentru fiecare eșec (limitate de pauzele pe cont și pe adresă).
      // Un login inexistent: doar numărat, cel mult un rând pe minut pentru fiecare adresă (vezi
      // JurnalLoginNecunoscut), ca un val de nume inventate să nu umple tabelul nemodificabil.
      // Scrierea nu se așteaptă: un cont real (cu rând) și unul inexistent (de obicei fără) trebuie să
      // primească 401 la fel de repede, altfel diferența de timp arată ce conturi există (vezi SARE_FALSA).
      // auditeaza nu aruncă niciodată (își raportează singură erorile).
      if (e instanceof acces.EroareLogin && !e.contExista) {
        for (const i of loginNecunoscut.esec(req.ip, login)) void auditeaza(db, i, req.log);
      } else if (e instanceof EroareUtilizator && e.status !== 429) {
        void auditeaza(db, { adresa: req.ip, actiune: 'login.esuat', cale: '/api/auth/login', stare_http: e.status, date: { login } }, req.log);
      }
      throw e;
    }
  });

  app.register(async (a) => {
    // În onRequest, înainte de citirea corpului: o cerere fără sesiune nu mai costă parsarea JSON-ului.
    a.addHook('onRequest', doarAdmin);
    const anunta = (tip: Parameters<typeof magistrala.trimite>[0]['tip'], locatie_id?: number | null) => magistrala.trimite({ tip, locatie_id });

    a.get('/api/auth/eu', async (req) => req.utilizator);
    a.post('/api/auth/logout', async (req) => {
      await acces.iesire(db, req.headers.authorization!.slice(7));
      return { ok: true };
    });

    // ---- Locații, utilizatori, tablete, setări ----
    a.get('/api/locatii', async () => acces.listaLocatii(db));
    a.post('/api/locatii', async (req) => acces.salveazaLocatie(db, schemaLocatie.parse(req.body)));
    a.put('/api/locatii/:id', async (req) => {
      const { id } = idNum.parse(req.params);
      req.auditInainte = await stareAnterioara(db, 'locatie', id);
      const r = await acces.salveazaLocatie(db, schemaLocatie.parse(req.body), id);
      anunta('catalog'); // numele locației e în catalogul tabletelor
      return r;
    });

    a.get('/api/utilizatori', async () => acces.listaUtilizatori(db));
    a.post('/api/utilizatori', async (req) => {
      const d = schemaUtilizator.parse(req.body);
      verificaParolaAdmin(d);
      const r = await acces.salveazaUtilizator(db, d);
      anunta('catalog');
      return r;
    });
    a.put('/api/utilizatori/:id', async (req) => {
      const d = schemaUtilizator.parse(req.body);
      verificaParolaAdmin(d);
      const { id } = idNum.parse(req.params);
      req.auditInainte = await stareAnterioara(db, 'utilizator', id);
      const r = await acces.salveazaUtilizator(db, d, id, req.headers.authorization!.slice(7));
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
      const { id } = idNum.parse(req.params);
      const { activ } = z.object({ activ: z.boolean() }).parse(req.body);
      req.auditInainte = await stareAnterioara(db, 'dispozitiv', id);
      // Reactivarea întoarce un cod nou de asociere: tokenul vechi nu mai revine.
      const { cod_asociere } = await acces.activeazaDispozitiv(db, id, activ);
      return { ok: true, cod_asociere };
    });
    a.put('/api/dispozitive/:id/terminal', async (req) => {
      const { terminal_device_id } = z.object({ terminal_device_id: z.string().trim().max(100).nullable() }).parse(req.body);
      const { id } = idNum.parse(req.params);
      req.auditInainte = await stareAnterioara(db, 'dispozitiv', id);
      await terminal.seteazaTerminal(db, id, terminal_device_id);
      return { ok: true };
    });
    a.get('/api/dispozitive/:id/terminal/stare', async (req) => terminal.stareTerminal(db, idNum.parse(req.params).id));

    a.get('/api/terminal/config', async () => ({ configurat: terminal.poslinkConfigurat(), fiscal: await terminal.citesteFiscal(db) }));
    a.put('/api/setari/fiscal', async (req) => {
      const f = z.object({ cota_tva_implicita: z.string().regex(/^[A-Z_]$/), antet: z.string().max(60) }).parse(req.body);
      req.auditInainte = await stareAnterioara(db, 'setare', 'fiscal');
      await scrieSetare(db, 'fiscal', f);
      return f;
    });

    a.get('/api/setari/tolerante', async () => citesteTolerante(db));
    a.put('/api/setari/tolerante', async (req) => {
      const t = z.object({ numerar: z.number().min(0), card: z.number().min(0), doze: z.number().min(0) }).parse(req.body);
      req.auditInainte = await stareAnterioara(db, 'setare', 'tolerante');
      await scrieSetare(db, 'tolerante', t);
      return t;
    });

    // Tabletele: modul demonstrație (Simulator, punte locală) și blocarea automată; ajung în catalog.
    a.get('/api/setari/tableta', async () => citesteSetariTableta(db));
    a.put('/api/setari/tableta', async (req) => {
      const t = z.object({ mod_demonstratie: z.boolean(), blocare_automata_min: z.number().int().min(1).max(240) }).parse(req.body);
      req.auditInainte = await stareAnterioara(db, 'setare', 'tableta');
      await scrieSetare(db, 'tableta', t);
      anunta('catalog');
      return t;
    });

    // ---- Rețetar ----
    a.get('/api/articole', async () => catalog.listaArticole(db));
    a.post('/api/articole', async (req) => catalog.salveazaArticol(db, schemaArticol.parse(req.body)));
    a.put('/api/articole/:id', async (req) => {
      const { id } = idNum.parse(req.params);
      const d = schemaArticol.parse(req.body);
      req.auditInainte = await stareAnterioara(db, 'articol', id);
      return catalog.salveazaArticol(db, d, id);
    });

    a.get('/api/categorii', async () => catalog.listaCategorii(db));
    a.post('/api/categorii', async (req) => {
      const r = await catalog.salveazaCategorie(db, z.object({ nume, ordine: z.number().int().optional() }).parse(req.body));
      anunta('catalog');
      return r;
    });
    a.put('/api/categorii/:id', async (req) => {
      const { id } = idNum.parse(req.params);
      const d = z.object({ nume, ordine: z.number().int().optional() }).parse(req.body);
      req.auditInainte = await stareAnterioara(db, 'categorie', id);
      const r = await catalog.salveazaCategorie(db, d, id);
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
      const { id } = idNum.parse(req.params);
      const d = schemaProdus.parse(req.body);
      req.auditInainte = await stareAnterioara(db, 'produs', id);
      const r = await catalog.salveazaProdus(db, d, id);
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
      const { id } = idNum.parse(req.params);
      const d = schemaModificator.parse(req.body);
      req.auditInainte = await stareAnterioara(db, 'modificator', id);
      const r = await catalog.salveazaModificator(db, d, id);
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
      const { linii } = schemaLiniiInventar.parse(req.body);
      ({ corp: req.auditCorp, inainte: req.auditInainte } = await auditNumaratori(db, id, linii));
      await inventar.salveazaNumaratori(db, id, linii);
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
        .object({ locatie_id: locOpt, tura_id: z.string().uuid().optional(), de: data.optional(), pana: data.optional(), metoda: z.enum(['numerar', 'card', 'casare']).optional(), pret_abatere: z.stringbool().optional(), card_neconfirmat: z.stringbool().optional(), limita: z.coerce.number().int().positive().optional() })
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
      req.auditInainte = await stareAnterioara(db, 'tura', id);
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
          la: z.string().datetime({ offset: true }).nullish(),
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
    a.get('/api/sync/ore-suspecte', async () => listaOreSuspecte(db));
    a.get('/api/sync/erori/:id', async (req) => detaliuEroareSync(db, idUuid.parse(req.params).id));
    a.post('/api/sync/erori/:id/reaplica', async (req) => {
      await reaplicaEveniment(db, idUuid.parse(req.params).id);
      return { ok: true };
    });
    a.post('/api/sync/erori/:id/rezolvat', async (req) => {
      await marcheazaRezolvat(db, idUuid.parse(req.params).id);
      return { ok: true };
    });

    // ---- Jurnalul de audit (doar citire) ----
    a.get('/api/jurnal', async (req) => {
      const q = z
        .object({
          cauta: z.string().max(100).optional(),
          limita: z.coerce.number().int().positive().max(500).optional(),
          esecuri_login: z.enum(['0', '1']).optional(),
        })
        .parse(req.query);
      return listaJurnal(db, { cauta: q.cauta, limita: q.limita, esecuriLogin: q.esecuri_login === '1' });
    });
  });
}
