-- O singură inventariere deschisă pe locație: tableta și panoul lucrează pe aceeași foaie,
-- iar două cereri simultane nu mai pot crea două inventarieri (care ar dubla ajustările).
CREATE UNIQUE INDEX inventarieri_deschisa_unica ON inventarieri (locatie_id) WHERE stare = 'deschisa';

-- Căutarea numărărilor finalizate de după o mișcare sincronizată târziu.
CREATE INDEX inventarieri_linii_articol ON inventarieri_linii (articol_id, numarat_la);
