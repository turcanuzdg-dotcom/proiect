-- Corecturi după revizia finală (securitate și scalare):
--  1. returul pe card are o baristă: cine a restituit banii se vede în registru;
--  2. returul aprobat fără anularea comenzii se caută repede (alerta de reconciliere);
--  3. „promovat din barista în admin” se citește dintr-un index mic, nu din tot jurnalul de audit;
--  4. codul de asociere al unei tablete expiră (data emiterii).

-- ---- 1. Returul pe card, atribuit ----
-- NULL la operațiunile vechi și la plăți (tableta declară barista doar la retur).
ALTER TABLE operatiuni_terminal ADD COLUMN utilizator_id int REFERENCES utilizatori(id);

-- Registrul rămâne neschimbat: la încheierea unei încercări nu se poate schimba nici barista.
CREATE OR REPLACE FUNCTION operatiune_terminal_doar_incheiere() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.stare IN ('in_curs', 'nesigura')
     AND NEW.referinta = OLD.referinta AND NEW.tip = OLD.tip AND NEW.document_nr = OLD.document_nr
     AND NEW.dispozitiv_id = OLD.dispozitiv_id AND NEW.locatie_id = OLD.locatie_id
     AND NEW.terminal_device_id = OLD.terminal_device_id AND NEW.suma = OLD.suma AND NEW.creata_la = OLD.creata_la
     AND NEW.utilizator_id IS NOT DISTINCT FROM OLD.utilizator_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Operațiunea pe terminal % nu se modifică și nu se șterge (%)', OLD.id, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;

-- ---- 2. Retururi aprobate de reconciliat cu anulările ----
-- Puține rânduri (retururile aprobate), citite de Panou, de tură și de lista Comenzi.
CREATE INDEX operatiuni_terminal_retur_aprobat ON operatiuni_terminal (actualizata_la) WHERE tip = 'retur' AND stare = 'aprobata';

-- ---- 3. Promovările barista → admin (servicii/acces.ts, promovatDupa) ----
-- Doar modificările reușite ale utilizatorilor: o tabletă care trimite sute de evenimente pe numele unui
-- admin fără PIN nu mai citește la fiecare tot jurnalul, care crește cât trăiește instalarea.
CREATE INDEX jurnal_audit_promovari ON jurnal_audit (cale, la) WHERE actiune = 'PUT /api/utilizatori/:id' AND stare_http = 200;

-- ---- 4. Codul de asociere expiră ----
-- Un cod scris pe hârtie sau uitat nu mai rămâne valabil la nesfârșit (servicii/acces.ts, VALABILITATE_COD).
-- Codurile existente primesc ziua de acum, ca o tabletă pe cale de asociere să nu fie surprinsă.
ALTER TABLE dispozitive ADD COLUMN cod_asociere_la timestamptz;
UPDATE dispozitive SET cod_asociere_la = now() WHERE cod_asociere IS NOT NULL;
