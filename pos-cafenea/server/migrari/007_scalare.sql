-- Scalare: citirile de stoc și de casă nu mai parcurg tot istoricul, indexuri pentru rapoarte și liste,
-- chei de idempotență pentru documentele introduse din panou.
-- Indexurile noi se creează înaintea celor pe care le înlocuiesc (migrația rulează într-o singură
-- tranzacție, la pornire, înainte ca serverul să asculte: tabletele așteaptă offline).

-- ---- 1. Indexuri ----
-- Stocul pe (locație, articol) și fișa articolului: citire doar din index, fără rândurile tabelului.
CREATE INDEX miscari_stoc_loc_art_c ON miscari_stoc (locatie_id, articol_id, creata_la) INCLUDE (cantitate);
DROP INDEX miscari_stoc_loc_art;
-- Soldul de numerar al locației (rezumatul Bani, deschiderea și închiderea turei).
CREATE INDEX miscari_bani_loc_c ON miscari_bani (locatie_id, cont, creata_la) INCLUDE (suma);
DROP INDEX miscari_bani_loc;

-- Liste și rapoarte pe interval fără filtru de locație.
CREATE INDEX comenzi_data ON comenzi (creata_la);
CREATE INDEX miscari_bani_data ON miscari_bani (creata_la);

-- Raportul de pierderi citește doar rândurile rare: casări, anulări, inventar, diferențe de casă.
CREATE INDEX comenzi_casari ON comenzi (creata_la) WHERE metoda = 'casare';
CREATE INDEX comenzi_anulate ON comenzi (anulata_la) WHERE stare = 'anulata';
CREATE INDEX miscari_stoc_inventar ON miscari_stoc (creata_la) WHERE tip = 'inventar';
CREATE INDEX miscari_bani_diferente ON miscari_bani (creata_la) WHERE tip = 'diferenta_casa';
-- Închiderea turei numără anulările făcute în ea (rare): fără index, o citire a tuturor comenzilor.
CREATE INDEX comenzi_anulare_tura ON comenzi (anulare_tura_id) WHERE anulare_tura_id IS NOT NULL;
-- „Are fond de pornire?” (lista turelor, panoul): fără el, fiecare apel citea tot registrul de bani.
CREATE INDEX miscari_bani_fond_initial ON miscari_bani (tura_id) WHERE tip = 'fond_initial';

-- Erorile de sincronizare (numărul din panou, lista din Setări) sunt singurele rânduri citite după
-- stare; indexul pe toată coloana (aproape numai „aplicat”) nu mai e necesar.
CREATE INDEX evenimente_sync_erori ON evenimente_sync (primit_la) WHERE stare = 'eroare';
DROP INDEX evenimente_sync_stare;

-- ---- 2. Solduri închise (servicii/solduri.ts) ----
-- Suma mișcărilor registrului cu id <= pana_la_id, pe locație și articol (cont). Doar o scurtătură
-- pentru citiri: registrele rămân sursa, soldurile se pot reface oricând din ele, iar cele înlocuite
-- de unele mai noi se șterg după o oră.
CREATE TABLE solduri_stoc (
  pana_la_id bigint NOT NULL,
  locatie_id int NOT NULL REFERENCES locatii(id),
  articol_id int NOT NULL REFERENCES articole(id),
  cantitate numeric NOT NULL,
  inchis_la timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pana_la_id, locatie_id, articol_id)
);

CREATE TABLE solduri_bani (
  pana_la_id bigint NOT NULL,
  locatie_id int NOT NULL REFERENCES locatii(id),
  cont text NOT NULL,
  suma numeric NOT NULL,
  inchis_la timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pana_la_id, locatie_id, cont)
);

-- ---- 3. Idempotența documentelor din panou ----
-- Formularul generează cheia la deschidere. Dacă răspunsul se pierde (timp de așteptare depășit,
-- conexiune căzută) și adminul apasă din nou „Salvează”, serverul întoarce documentul deja creat,
-- fără să dubleze stocul sau să recalculeze costul mediu.
ALTER TABLE receptii ADD COLUMN cheie uuid UNIQUE;
ALTER TABLE transferuri ADD COLUMN cheie uuid UNIQUE;
