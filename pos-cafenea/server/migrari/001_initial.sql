-- Schema inițială. Stocul și banii sunt registre (jurnale de mișcări):
-- stocul scriptic = suma mișcărilor, nu un câmp care se suprascrie.

CREATE TABLE locatii (
  id serial PRIMARY KEY,
  nume text NOT NULL UNIQUE,
  tip text NOT NULL CHECK (tip IN ('depozit', 'punct')),
  activ boolean NOT NULL DEFAULT true
);

CREATE TABLE utilizatori (
  id serial PRIMARY KEY,
  nume text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('admin', 'barista')),
  login text UNIQUE,
  parola_hash text,
  pin_hash text,
  sare text NOT NULL,
  locatie_id int REFERENCES locatii(id),
  activ boolean NOT NULL DEFAULT true
);

CREATE TABLE sesiuni (
  token text PRIMARY KEY,
  utilizator_id int NOT NULL REFERENCES utilizatori(id),
  creata_la timestamptz NOT NULL DEFAULT now(),
  expira_la timestamptz NOT NULL
);

CREATE TABLE dispozitive (
  id serial PRIMARY KEY,
  nume text NOT NULL,
  locatie_id int NOT NULL REFERENCES locatii(id),
  cod_asociere text UNIQUE,
  token text UNIQUE,
  activ boolean NOT NULL DEFAULT true,
  creat_la timestamptz NOT NULL DEFAULT now(),
  ultima_sincronizare timestamptz
);

CREATE TABLE setari (
  cheie text PRIMARY KEY,
  valoare jsonb NOT NULL
);

-- ---- Rețetar ----

CREATE TABLE articole (
  id serial PRIMARY KEY,
  nume text NOT NULL UNIQUE,
  um text NOT NULL CHECK (um IN ('g', 'ml', 'buc')),
  tip text NOT NULL CHECK (tip IN ('materie_prima', 'ambalaj', 'marfa')),
  cost_mediu numeric(14, 6) NOT NULL DEFAULT 0,
  prag_minim numeric(14, 3) NOT NULL DEFAULT 0,
  activ boolean NOT NULL DEFAULT true
);

CREATE TABLE categorii (
  id serial PRIMARY KEY,
  nume text NOT NULL UNIQUE,
  ordine int NOT NULL DEFAULT 0
);

CREATE TABLE produse (
  id serial PRIMARY KEY,
  nume text NOT NULL UNIQUE,
  categorie_id int REFERENCES categorii(id),
  pret numeric(12, 2) NOT NULL,
  doze_cafea numeric(6, 2) NOT NULL DEFAULT 0,
  ordine int NOT NULL DEFAULT 0,
  activ boolean NOT NULL DEFAULT true
);

CREATE TABLE retete (
  produs_id int NOT NULL REFERENCES produse(id) ON DELETE CASCADE,
  articol_id int NOT NULL REFERENCES articole(id),
  cantitate numeric(14, 3) NOT NULL CHECK (cantitate > 0),
  PRIMARY KEY (produs_id, articol_id)
);

CREATE TABLE modificatori (
  id serial PRIMARY KEY,
  nume text NOT NULL UNIQUE,
  pret numeric(12, 2) NOT NULL DEFAULT 0,
  doze_cafea numeric(6, 2) NOT NULL DEFAULT 0,
  inlocuieste_articol_id int REFERENCES articole(id),
  inlocuitor_articol_id int REFERENCES articole(id),
  activ boolean NOT NULL DEFAULT true
);

CREATE TABLE modificatori_linii (
  modificator_id int NOT NULL REFERENCES modificatori(id) ON DELETE CASCADE,
  articol_id int NOT NULL REFERENCES articole(id),
  cantitate numeric(14, 3) NOT NULL,
  PRIMARY KEY (modificator_id, articol_id)
);

CREATE TABLE produse_modificatori (
  produs_id int NOT NULL REFERENCES produse(id) ON DELETE CASCADE,
  modificator_id int NOT NULL REFERENCES modificatori(id) ON DELETE CASCADE,
  PRIMARY KEY (produs_id, modificator_id)
);

-- ---- Vânzare și ture ----

CREATE TABLE ture (
  id uuid PRIMARY KEY,
  locatie_id int NOT NULL REFERENCES locatii(id),
  dispozitiv_id int REFERENCES dispozitive(id),
  utilizator_id int REFERENCES utilizatori(id),
  deschisa_la timestamptz NOT NULL,
  inchisa_la timestamptz,
  inchisa_de int REFERENCES utilizatori(id),
  fond_initial numeric(12, 2) NOT NULL DEFAULT 0,
  scriptic_fond numeric(12, 2),
  -- declarat de barista la închidere
  declarat_doze numeric(10, 2),
  declarat_numerar numeric(12, 2),
  declarat_card numeric(12, 2),
  declarat_anulari int,
  declarat_casari int,
  observatii text,
  -- calculat de sistem la închidere
  scriptic_doze numeric(10, 2),
  scriptic_numerar numeric(12, 2),
  scriptic_card numeric(12, 2),
  scriptic_anulari int,
  scriptic_casari int,
  are_discrepante boolean NOT NULL DEFAULT false,
  verificata_de int REFERENCES utilizatori(id),
  verificata_la timestamptz,
  nota_verificare text,
  creata_automat boolean NOT NULL DEFAULT false
);
CREATE INDEX ture_locatie ON ture (locatie_id, deschisa_la);

CREATE TABLE comenzi (
  id uuid PRIMARY KEY,
  locatie_id int NOT NULL REFERENCES locatii(id),
  tura_id uuid NOT NULL REFERENCES ture(id),
  dispozitiv_id int REFERENCES dispozitive(id),
  utilizator_id int REFERENCES utilizatori(id),
  nr int NOT NULL,
  creata_la timestamptz NOT NULL,
  sincronizata_la timestamptz NOT NULL DEFAULT now(),
  metoda text NOT NULL CHECK (metoda IN ('numerar', 'card', 'casare')),
  motiv_casare text,
  nota text,
  total numeric(12, 2) NOT NULL,
  primit numeric(12, 2),
  rest numeric(12, 2),
  card_autorizare text,
  doze_cafea numeric(10, 2) NOT NULL DEFAULT 0,
  stare text NOT NULL DEFAULT 'finalizata' CHECK (stare IN ('finalizata', 'anulata')),
  anulata_la timestamptz,
  anulare_tura_id uuid REFERENCES ture(id),
  motiv_anulare text,
  stoc_restituit boolean
);
CREATE INDEX comenzi_locatie_data ON comenzi (locatie_id, creata_la);
CREATE INDEX comenzi_tura ON comenzi (tura_id);

CREATE TABLE comenzi_linii (
  id serial PRIMARY KEY,
  comanda_id uuid NOT NULL REFERENCES comenzi(id) ON DELETE CASCADE,
  produs_id int NOT NULL REFERENCES produse(id),
  cantitate int NOT NULL CHECK (cantitate > 0),
  pret_unitar numeric(12, 2) NOT NULL,
  modificatori jsonb NOT NULL DEFAULT '[]',
  total numeric(12, 2) NOT NULL,
  cost numeric(14, 4) NOT NULL DEFAULT 0
);
CREATE INDEX comenzi_linii_comanda ON comenzi_linii (comanda_id);

-- ---- Registre ----

CREATE TABLE miscari_stoc (
  id bigserial PRIMARY KEY,
  locatie_id int NOT NULL REFERENCES locatii(id),
  articol_id int NOT NULL REFERENCES articole(id),
  cantitate numeric(14, 3) NOT NULL,
  tip text NOT NULL,
  document_tip text NOT NULL,
  document_id text NOT NULL,
  cost_unitar numeric(14, 6) NOT NULL DEFAULT 0,
  creata_la timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX miscari_stoc_loc_art ON miscari_stoc (locatie_id, articol_id, creata_la);
CREATE INDEX miscari_stoc_data ON miscari_stoc (creata_la);
CREATE INDEX miscari_stoc_doc ON miscari_stoc (document_tip, document_id);

CREATE TABLE miscari_bani (
  id bigserial PRIMARY KEY,
  locatie_id int NOT NULL REFERENCES locatii(id),
  cont text NOT NULL CHECK (cont IN ('numerar', 'card')),
  suma numeric(12, 2) NOT NULL,
  tip text NOT NULL,
  descriere text,
  tura_id uuid REFERENCES ture(id),
  document_tip text,
  document_id text,
  utilizator_id int REFERENCES utilizatori(id),
  creata_la timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX miscari_bani_loc ON miscari_bani (locatie_id, cont, creata_la);
CREATE INDEX miscari_bani_tura ON miscari_bani (tura_id);

-- ---- Documente de gestiune ----

CREATE TABLE receptii (
  id serial PRIMARY KEY,
  locatie_id int NOT NULL REFERENCES locatii(id),
  furnizor text NOT NULL,
  nr_factura text NOT NULL,
  data date NOT NULL,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  creata_de int REFERENCES utilizatori(id),
  creata_la timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE receptii_linii (
  receptie_id int NOT NULL REFERENCES receptii(id) ON DELETE CASCADE,
  articol_id int NOT NULL REFERENCES articole(id),
  cantitate numeric(14, 3) NOT NULL CHECK (cantitate > 0),
  cost_unitar numeric(14, 6) NOT NULL CHECK (cost_unitar >= 0),
  PRIMARY KEY (receptie_id, articol_id)
);

CREATE TABLE transferuri (
  id serial PRIMARY KEY,
  din_locatie_id int NOT NULL REFERENCES locatii(id),
  in_locatie_id int NOT NULL REFERENCES locatii(id),
  observatii text,
  creat_de int REFERENCES utilizatori(id),
  creat_la timestamptz NOT NULL DEFAULT now(),
  CHECK (din_locatie_id <> in_locatie_id)
);

CREATE TABLE transferuri_linii (
  transfer_id int NOT NULL REFERENCES transferuri(id) ON DELETE CASCADE,
  articol_id int NOT NULL REFERENCES articole(id),
  cantitate numeric(14, 3) NOT NULL CHECK (cantitate > 0),
  PRIMARY KEY (transfer_id, articol_id)
);

CREATE TABLE inventarieri (
  id serial PRIMARY KEY,
  locatie_id int NOT NULL REFERENCES locatii(id),
  stare text NOT NULL DEFAULT 'deschisa' CHECK (stare IN ('deschisa', 'finalizata')),
  inceputa_la timestamptz NOT NULL DEFAULT now(),
  finalizata_la timestamptz,
  utilizator_id int REFERENCES utilizatori(id),
  dispozitiv_id int REFERENCES dispozitive(id)
);

CREATE TABLE inventarieri_linii (
  inventariere_id int NOT NULL REFERENCES inventarieri(id) ON DELETE CASCADE,
  articol_id int NOT NULL REFERENCES articole(id),
  faptic numeric(14, 3) NOT NULL CHECK (faptic >= 0),
  scriptic numeric(14, 3),
  numarat_la timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (inventariere_id, articol_id)
);

-- ---- Sincronizare offline ----
-- Fiecare eveniment al tabletei are un UUID generat local; cheia primară face
-- re-trimiterea inofensivă. Evenimentele care nu pot fi aplicate rămân aici
-- (stare = 'eroare') pentru admin, fără să blocheze coada tabletei.

CREATE TABLE evenimente_sync (
  id uuid PRIMARY KEY,
  dispozitiv_id int REFERENCES dispozitive(id),
  locatie_id int REFERENCES locatii(id),
  tip text NOT NULL,
  la timestamptz,
  primit_la timestamptz NOT NULL DEFAULT now(),
  stare text NOT NULL CHECK (stare IN ('aplicat', 'eroare', 'rezolvat')),
  eroare text,
  payload jsonb NOT NULL
);
CREATE INDEX evenimente_sync_stare ON evenimente_sync (stare);
