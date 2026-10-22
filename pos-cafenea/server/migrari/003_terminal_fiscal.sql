-- Terminalul bancar în regim fiscal (POSLink / Intelectsoft) legat de fiecare tabletă,
-- referințele plății cu cardul pe comenzi și bonurile fiscale emise.

ALTER TABLE dispozitive ADD COLUMN terminal_device_id text;

ALTER TABLE comenzi ADD COLUMN card_rrn text;
ALTER TABLE comenzi ADD COLUMN card_operation_id text;

-- Litera cotei de TVA din configurația casei fiscale (A/B/C… sau _ fără TVA); lipsă = cea implicită.
ALTER TABLE produse ADD COLUMN cota_tva text;

CREATE TABLE bonuri_fiscale (
  comanda_id uuid PRIMARY KEY,
  dispozitiv_id int REFERENCES dispozitive(id),
  terminal_device_id text,
  tip text NOT NULL CHECK (tip IN ('bon', 'retur')),
  numar text,
  qr text,
  receipt_id text,
  emis_la timestamptz NOT NULL DEFAULT now(),
  raspuns jsonb
);
