-- Securitate și urme:
--  1. tokenurile de sesiune și ale tabletelor se păstrează doar ca amprentă SHA-256;
--  2. registrele de stoc și de bani nu se mai pot modifica sau șterge nici direct în bază;
--  3. jurnalul de audit: cine a schimbat ce, de unde și când (panou, tablete, autentificări).

-- ---- 1. Tokenuri: în bază doar amprenta (SHA-256, hex) ----
-- O copie a bazei (backup, export, o mașină de test) nu mai dă acces la panou sau la tablete.
-- Conversia se face pe loc: tabletele asociate și sesiunile deschise merg mai departe, fiindcă
-- serverul compară de acum amprenta tokenului primit.
UPDATE sesiuni SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex');
UPDATE dispozitive SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex') WHERE token IS NOT NULL;
-- Sesiunile expirate nu mai servesc la nimic.
DELETE FROM sesiuni WHERE expira_la < now();
-- O tabletă dezactivată nu mai păstrează niciun token: reactivarea cere o asociere nouă, cu cod.
UPDATE dispozitive SET token = NULL, cod_asociere = NULL WHERE NOT activ;
-- Administratorii nu lucrează pe tablete: hash-ul PIN-ului lor nu mai ajunge în catalogul tabletelor.
UPDATE utilizatori SET pin_hash = NULL WHERE rol = 'admin';

-- ---- 2. Registrele nu se modifică și nu se șterg ----
-- Orice corecție se scrie ca mișcare nouă (vezi docs/arhitectura.md). Până acum regula era ținută
-- doar de cod; de acum o ține și baza, pentru oricine are acces direct la ea.
-- Codul 23001 (restrict_violation, clasa 23): un eveniment de pe tabletă care ar ajunge aici e o eroare
-- permanentă și trece la „Erori sincronizare”, fără să blocheze coada.
-- O migrație viitoare care chiar trebuie să completeze o coloană nouă dezactivează temporar
-- declanșatorul în aceeași tranzacție (ALTER TABLE ... DISABLE TRIGGER ...; ... ENABLE TRIGGER ...).
CREATE FUNCTION registru_nemodificabil() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registrul % nu se modifică și nu se șterge (%): corecțiile se scriu ca înregistrări noi', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER miscari_stoc_nemodificabil BEFORE UPDATE OR DELETE ON miscari_stoc
  FOR EACH ROW EXECUTE FUNCTION registru_nemodificabil();
CREATE TRIGGER miscari_stoc_fara_golire BEFORE TRUNCATE ON miscari_stoc
  FOR EACH STATEMENT EXECUTE FUNCTION registru_nemodificabil();

CREATE TRIGGER miscari_bani_nemodificabil BEFORE UPDATE OR DELETE ON miscari_bani
  FOR EACH ROW EXECUTE FUNCTION registru_nemodificabil();
CREATE TRIGGER miscari_bani_fara_golire BEFORE TRUNCATE ON miscari_bani
  FOR EACH STATEMENT EXECUTE FUNCTION registru_nemodificabil();

-- ---- 3. Jurnalul de audit ----
-- Fără chei străine: jurnalul trebuie să poată fi scris orice s-ar întâmpla cu restul datelor.
-- Nu conține niciodată parole, PIN-uri, coduri de asociere, tokenuri sau hash-uri.
CREATE TABLE jurnal_audit (
  id bigserial PRIMARY KEY,
  la timestamptz NOT NULL DEFAULT now(),
  utilizator_id int,
  dispozitiv_id int,
  adresa text,
  actiune text NOT NULL,
  cale text,
  stare_http int,
  date jsonb
);
CREATE INDEX jurnal_audit_la ON jurnal_audit (la);

CREATE TRIGGER jurnal_audit_nemodificabil BEFORE UPDATE OR DELETE ON jurnal_audit
  FOR EACH ROW EXECUTE FUNCTION registru_nemodificabil();
CREATE TRIGGER jurnal_audit_fara_golire BEFORE TRUNCATE ON jurnal_audit
  FOR EACH STATEMENT EXECUTE FUNCTION registru_nemodificabil();
