-- Creează o bază goală pentru POS, cu proprietarul și dreptul de conectare corecte.
-- Folosit de instaleaza.sh (baza „cafenea”) și de backup/restaureaza.sh (înainte de restaurare):
--   sudo -u postgres psql -v ON_ERROR_STOP=1 -v baza=cafenea -f baza-noua.sql
-- Rolurile trebuie să existe deja (roluri.sql sau instaleaza.sh).
--
-- Colaționare ICU „ro-RO”: listele ordonate după nume pun „Ș” după „S” și „Ă” după „A”, ca în română.

CREATE DATABASE :"baza" OWNER cafenea_migrari TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'ro-RO' LOCALE 'C.UTF-8';

-- Doar cele trei roluri ale POS-ului se pot conecta (pe lângă superutilizator); pg_hba.conf
-- face același lucru, aici e a doua barieră.
REVOKE ALL ON DATABASE :"baza" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"baza" TO cafenea_migrari, cafenea_app, cafenea_citire;
