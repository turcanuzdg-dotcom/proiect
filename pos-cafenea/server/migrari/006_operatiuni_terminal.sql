-- Terminalul bancar prin POSLink: fiecare plată și fiecare restituire trimisă la terminal lasă o urmă.
--  1. operatiuni_terminal: o înregistrare pentru fiecare încercare (plată sau retur), cu rezultatul ei;
--  2. comenzi.card_confirmat: vânzarea pe card are în spate o plată aprobată de terminal, de aceeași sumă.

-- ---- 1. Operațiunile pe terminal ----
-- `referinta` e id-ul comenzii (tableta îl trimite la plată ca documentNr și îl păstrează ca id al
-- vânzării); la retur e comanda restituită. `document_nr` e numărul trimis la POSLink: la plată coincide
-- cu referința, la retur e propriu fiecărei încercări, ca „ultima tranzacție” să nu confunde returul cu plata.
-- Se păstrează doar câmpurile de mai jos, niciodată răspunsul brut al POSLink (poate conține PAN-ul mascat).
CREATE TABLE operatiuni_terminal (
  id bigserial PRIMARY KEY,
  referinta uuid NOT NULL,
  tip text NOT NULL CHECK (tip IN ('plata', 'retur')),
  document_nr text NOT NULL,
  dispozitiv_id int NOT NULL REFERENCES dispozitive(id),
  locatie_id int NOT NULL REFERENCES locatii(id),
  terminal_device_id text NOT NULL,
  suma numeric(12, 2) NOT NULL CHECK (suma > 0),
  stare text NOT NULL CHECK (stare IN ('in_curs', 'aprobata', 'refuzata', 'nesigura')),
  autorizare text,
  rrn text,
  operation_id text,
  mesaj text,
  creata_la timestamptz NOT NULL DEFAULT now(),
  actualizata_la timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operatiuni_terminal_referinta ON operatiuni_terminal (referinta, tip);
-- Cel mult o plată aprobată pe comandă: o reîncercare nu poate încasa a doua oară.
CREATE UNIQUE INDEX operatiuni_terminal_o_plata ON operatiuni_terminal (referinta) WHERE tip = 'plata' AND stare = 'aprobata';

-- Registru: nu se șterge, iar o încercare se poate doar încheia (din „în curs” sau „nesigură” într-un
-- rezultat), fără să i se schimbe ce s-a trimis la terminal. Codul 23001, ca la celelalte registre.
CREATE FUNCTION operatiune_terminal_doar_incheiere() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.stare IN ('in_curs', 'nesigura')
     AND NEW.referinta = OLD.referinta AND NEW.tip = OLD.tip AND NEW.document_nr = OLD.document_nr
     AND NEW.dispozitiv_id = OLD.dispozitiv_id AND NEW.locatie_id = OLD.locatie_id
     AND NEW.terminal_device_id = OLD.terminal_device_id AND NEW.suma = OLD.suma AND NEW.creata_la = OLD.creata_la THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Operațiunea pe terminal % nu se modifică și nu se șterge (%)', OLD.id, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;
CREATE TRIGGER operatiuni_terminal_registru BEFORE UPDATE OR DELETE ON operatiuni_terminal
  FOR EACH ROW EXECUTE FUNCTION operatiune_terminal_doar_incheiere();
CREATE TRIGGER operatiuni_terminal_fara_golire BEFORE TRUNCATE ON operatiuni_terminal
  FOR EACH STATEMENT EXECUTE FUNCTION registru_nemodificabil();

-- ---- 2. Vânzări pe card confirmate de terminal ----
-- Tableta lucrează offline-first, deci o vânzare pe card fără plată aprobată nu se respinge: se marchează
-- (false) și apare în Comenzi, pe tură și pe Panou. NULL la numerar și casări.
ALTER TABLE comenzi ADD COLUMN card_confirmat boolean;
CREATE INDEX comenzi_card_neconfirmat ON comenzi (creata_la) WHERE card_confirmat = false;
