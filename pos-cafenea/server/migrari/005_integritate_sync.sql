-- Integritatea cozii de sincronizare și a registrelor:
--  1. prețul din catalog la momentul sincronizării, alături de cel trimis de tabletă;
--  2. tura verificată de admin care se schimbă ulterior iese din nou la verificare;
--  3. ceasul tabletei: ultimul moment primit și evenimentele cu oră suspectă.

-- ---- 1. Prețuri ----
-- O vânzare offline făcută înaintea unei schimbări de preț e legitimă, deci nu se respinge: se
-- păstrează prețul catalogului de la sincronizare și comanda se marchează pentru admin.
-- Prețul din catalog al fiecărui modificator stă în comenzi_linii.modificatori (cheia pret_catalog).
ALTER TABLE comenzi_linii ADD COLUMN pret_catalog numeric(12, 2);
ALTER TABLE comenzi ADD COLUMN pret_abatere boolean NOT NULL DEFAULT false;
CREATE INDEX comenzi_pret_abatere ON comenzi (creata_la) WHERE pret_abatere;

-- ---- 2. Ture modificate după verificare ----
-- O vânzare sau o corecție de numerar ajunsă târziu poate schimba cifrele unei ture deja
-- verificate: tura apare din nou „neverificată” până când adminul o verifică iar.
ALTER TABLE ture ADD COLUMN modificata_dupa_verificare timestamptz;

-- ---- 3. Ceasul tabletei ----
-- Coada tabletei e în ordine, deci momentele ar trebui să crească: un eveniment mult mai vechi decât
-- cel de dinaintea lui înseamnă un ceas dat înapoi. Nu se respinge (coada nu se blochează), se semnalează.
ALTER TABLE dispozitive ADD COLUMN ultimul_la timestamptz;
ALTER TABLE evenimente_sync ADD COLUMN ora_suspecta boolean NOT NULL DEFAULT false;
CREATE INDEX evenimente_sync_ora_suspecta ON evenimente_sync (primit_la) WHERE ora_suspecta;
