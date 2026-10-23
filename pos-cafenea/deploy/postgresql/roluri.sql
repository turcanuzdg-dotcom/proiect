-- Rolurile și drepturile bazei „cafenea”. Se rulează ca superutilizator (postgres), conectat la baza
-- aplicației; se poate rula oricând din nou (instaleaza.sh și actualizeaza.sh o fac la fiecare rulare):
--   sudo -u postgres psql -d cafenea -v ON_ERROR_STOP=1 -f roluri.sql
--
--   cafenea_migrari  proprietarul schemei: creează și modifică tabele (doar migrațiile, la actualizare)
--   cafenea_app      serverul: citește și scrie rânduri; nu poate crea, modifica, goli (TRUNCATE) sau
--                    șterge tabele și nu poate dezactiva triggerele
--   cafenea_citire   copiile de siguranță (pg_dump) și verificările: doar citire
--
-- Fișierul trebuie să meargă și în PGlite (testul server/test/drepturi-postgres.test.ts), deci fără
-- comenzi psql (\c, \set).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cafenea_migrari') THEN
    CREATE ROLE cafenea_migrari LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cafenea_app') THEN
    CREATE ROLE cafenea_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cafenea_citire') THEN
    CREATE ROLE cafenea_citire LOGIN;
  END IF;
END
$$;

-- Niciunul nu e superutilizator și nu poate crea baze sau roluri (și dacă au fost create altfel).
ALTER ROLE cafenea_migrari NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
ALTER ROLE cafenea_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 40;
ALTER ROLE cafenea_citire NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;

-- O tranzacție lăsată deschisă (de ex. un proces blocat) nu ține la nesfârșit blocări pe registre.
ALTER ROLE cafenea_app SET idle_in_transaction_session_timeout = '60s';
-- Rolul de citire nu poate scrie nici dacă cineva îi dă din greșeală drepturi în plus.
ALTER ROLE cafenea_citire SET default_transaction_read_only = on;

-- pg_read_all_data (PostgreSQL 14+): SELECT pe toate tabelele și secvențele, de acum și din viitor.
DO $$
BEGIN
  IF NOT pg_has_role('cafenea_citire', 'pg_read_all_data', 'MEMBER') THEN
    GRANT pg_read_all_data TO cafenea_citire;
  END IF;
END
$$;

-- Dreptul de conectare la bază se dă la crearea ei (baza-noua.sql), nu aici.

-- Schema e a rolului de migrații; nimeni altcineva nu poate crea obiecte în ea.
ALTER SCHEMA public OWNER TO cafenea_migrari;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO cafenea_app;

-- Tabelele care există deja (baza restaurată sau creată de o versiune mai veche).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cafenea_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cafenea_app;

-- Tabelele create de migrațiile viitoare primesc singure aceleași drepturi. Fără TRUNCATE: el
-- golește un tabel fără să declanșeze triggerele pe rânduri, deci ar ocoli orice protecție a
-- registrelor de stoc și de bani.
ALTER DEFAULT PRIVILEGES FOR ROLE cafenea_migrari IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cafenea_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cafenea_migrari IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cafenea_app;
