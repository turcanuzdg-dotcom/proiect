#!/usr/bin/env bash
# Restaurarea bazei POS dintr-o copie criptată făcută de backup.sh (pg_dump -Fc | age).
#
#   sudo restaureaza.sh proba [ultima | FIȘIER.dump.age]
#       Proba lunară: restaurează într-o bază temporară, verifică ce s-a restaurat, apoi o șterge
#       (PASTREAZA=1 o lasă pentru inspecție). Serverul POS nu e atins.
#
#   sudo restaureaza.sh productie [ultima | FIȘIER.dump.age]
#       Dezastru: înlocuiește baza „cafenea” cu copia. Baza existentă nu se șterge, se redenumește
#       (cafenea_inainte_DATA), ca să se poată recupera orice din ea.
#
# „ultima” descarcă cea mai nouă copie din bucket (cu datele din /etc/cafenea/backup.env).
#
# Cheia privată age (AGE-SECRET-KEY-1...) NU stă pe server: scriptul o cere la rulare, o ține
# doar în memorie (/dev/shm) și o șterge la final. Alternativ: AGE_CHEIE=/cale/cheie.key.
#
# Pe VPS scriptul e instalat în /usr/local/lib/cafenea/; merge și pe alt calculator cu PostgreSQL 16,
# age și rclone (proba se poate face și pe laptop): atunci comenzile PostgreSQL rulează ca
# utilizatorul curent, cu PGHOST/PGUSER din mediu.
# shellcheck disable=SC1111  # ghilimelele românești „…” din mesaje sunt intenționate
set -euo pipefail
umask 077

opreste() { printf '\nEROARE: %s\n' "$*" >&2; exit 1; }
pas() { printf '==> %s\n' "$*"; }

MOD=${1:-}
SURSA=${2:-ultima}
[[ $MOD == proba || $MOD == productie ]] || opreste "utilizare: $0 proba|productie [ultima|FIȘIER.dump.age]"

AICI=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if [[ -f $AICI/postgresql/baza-noua.sql ]]; then SQL=$AICI/postgresql        # /usr/local/lib/cafenea
elif [[ -f $AICI/../postgresql/baza-noua.sql ]]; then SQL=$AICI/../postgresql # deploy/backup în depozit
else opreste "nu găsesc baza-noua.sql și roluri.sql lângă script"; fi

for c in age pg_restore psql; do command -v "$c" >/dev/null || opreste "lipsește comanda $c"; done

# Pe VPS (root, cu utilizatorul postgres) comenzile PostgreSQL rulează ca postgres, prin socketul local.
if [[ $EUID -eq 0 ]] && id postgres >/dev/null 2>&1; then
  pg() { (cd / && runuser -u postgres -- "$@"); }
else
  pg() { "$@"; }
fi
psql_() { pg psql -X -q -v ON_ERROR_STOP=1 "$@"; }

lucru=$(mktemp -d)
memorie=$(mktemp -d -p /dev/shm 2>/dev/null || mktemp -d)
curata() {
  [[ -f $memorie/cheie ]] && { shred -u "$memorie/cheie" 2>/dev/null || rm -f "$memorie/cheie"; }
  rm -rf "$lucru" "$memorie"
}
trap curata EXIT

# ---- 1. Fișierul copiei ----
if [[ $SURSA == ultima ]]; then
  command -v rclone >/dev/null || opreste "lipsește rclone (sau dați calea unui fișier .dump.age)"
  if [[ -z ${COPII_DESTINATIE:-} && -r /etc/cafenea/backup.env ]]; then
    # Citit rând cu rând, ca systemd (CHEIE=valoare, eventual între ghilimele), nu executat ca shell:
    # o cheie S3 cu caractere speciale nu poate strica sau rula nimic.
    while IFS= read -r linie || [[ -n $linie ]]; do
      [[ $linie =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
      cheie_env=${BASH_REMATCH[1]}
      valoare=${BASH_REMATCH[2]}
      if [[ $valoare =~ ^\'(.*)\'$ || $valoare =~ ^\"(.*)\"$ ]]; then valoare=${BASH_REMATCH[1]}; fi
      export "$cheie_env=$valoare"
    done < /etc/cafenea/backup.env
  fi
  : "${COPII_DESTINATIE:?lipsește COPII_DESTINATIE (din /etc/cafenea/backup.env)}"
  export RCLONE_CONFIG=${RCLONE_CONFIG:-/dev/null}
  pas "Caut cea mai nouă copie în $COPII_DESTINATIE/sfert/"
  ultima=$(rclone lsf -R --files-only --include '*.dump.age' "$COPII_DESTINATIE/sfert/" | sort | tail -n 1)
  [[ -n $ultima ]] || opreste "nu am găsit nicio copie în $COPII_DESTINATIE/sfert/"
  FISIER=$lucru/$(basename "$ultima")
  rclone copyto "$COPII_DESTINATIE/sfert/$ultima" "$FISIER"
else
  [[ -f $SURSA ]] || opreste "nu există fișierul $SURSA"
  FISIER=$SURSA
fi
NUME=$(basename "$FISIER")
pas "Copia: $NUME ($(( ($(stat -c %s "$FISIER") + 1023) / 1024 )) kB)"

# ---- 2. Cheia privată ----
CHEIE=$memorie/cheie
if [[ -n ${AGE_CHEIE:-} ]]; then
  cp "$AGE_CHEIE" "$CHEIE"
else
  read -rsp "Lipiți cheia privată age (AGE-SECRET-KEY-1...) și apăsați Enter: " cheie
  echo
  printf '%s\n' "$cheie" > "$CHEIE"
  unset cheie
fi
grep -q '^AGE-SECRET-KEY-1' "$CHEIE" || opreste "cheia nu arată ca o cheie privată age (AGE-SECRET-KEY-1...)"
# Verificăm cheia înainte să atingem vreo bază: decriptarea trebuie să meargă cap-coadă.
age --decrypt -i "$CHEIE" -o /dev/null "$FISIER" 2>"$lucru/age.err" \
  || opreste "copia nu se poate decripta cu această cheie: $(cat "$lucru/age.err")"

roluri_exista() {
  [[ $(psql_ -d postgres -tAc "SELECT count(*) FROM pg_roles WHERE rolname IN ('cafenea_migrari','cafenea_app','cafenea_citire')") == 3 ]]
}

# Raportul de după restaurare: ce conține baza și cât de nouă e ultima vânzare.
raport() {
  psql_ -d "$1" -P pager=off <<'SQL'
SELECT (SELECT string_agg(nume, ' ' ORDER BY nume) FROM schema_migrari) AS migratii,
       (SELECT count(*) FROM locatii) AS locatii,
       (SELECT count(*) FROM utilizatori) AS utilizatori,
       (SELECT count(*) FROM comenzi) AS comenzi,
       (SELECT max(creata_la) FROM comenzi) AS ultima_comanda,
       (SELECT max(primit_la) FROM evenimente_sync) AS ultimul_eveniment_primit,
       (SELECT count(*) FROM miscari_stoc) AS miscari_stoc,
       (SELECT count(*) FROM miscari_bani) AS miscari_bani,
       (SELECT count(*) FROM ture WHERE inchisa_la IS NULL) AS ture_deschise;
SELECT l.nume AS locatie, coalesce(sum(m.suma), 0) AS sold_numerar
  FROM locatii l LEFT JOIN miscari_bani m ON m.locatie_id = l.id AND m.cont = 'numerar'
 GROUP BY l.nume ORDER BY l.nume;
SQL
}

# ---- 3a. Proba ----
if [[ $MOD == proba ]]; then
  BAZA=cafenea_proba_$(date +%Y%m%d_%H%M%S)
  inceput=$(date +%s)
  if roluri_exista; then
    psql_ -d postgres -v baza="$BAZA" < "$SQL/baza-noua.sql"
    optiuni=(--exit-on-error --single-transaction)
  else
    # Pe un laptop fără rolurile POS-ului: aceleași date, proprietarul e utilizatorul curent.
    pg createdb -T template0 -E UTF8 "$BAZA"
    optiuni=(--exit-on-error --single-transaction --no-owner --no-privileges)
  fi
  pas "Restaurez în baza temporară $BAZA"
  if ! age --decrypt -i "$CHEIE" "$FISIER" | pg pg_restore "${optiuni[@]}" -d "$BAZA"; then
    pg dropdb --if-exists "$BAZA" || true
    opreste "restaurarea de probă a eșuat (baza temporară a fost ștearsă)"
  fi
  durata=$(( $(date +%s) - inceput ))
  raport "$BAZA"
  if [[ ${PASTREAZA:-0} == 1 ]]; then
    pas "Baza $BAZA rămâne pentru inspecție. Ștergeți-o după: sudo -u postgres dropdb $BAZA"
  else
    pg dropdb "$BAZA"
  fi
  echo
  echo "Proba de restaurare REUȘITĂ — $(date '+%Y-%m-%d %H:%M'), copia $NUME, restaurată în $durata s."
  echo "Treceți rândul de mai sus în jurnalul probelor (deploy/README.md, „Proba lunară”)."
  exit 0
fi

# ---- 3b. Producție ----
[[ $EUID -eq 0 ]] || opreste "restaurarea în producție se rulează cu sudo, pe VPS"
roluri_exista || opreste "rolurile POS lipsesc: rulați întâi instaleaza.sh"
cat <<TEXT

ATENȚIE: baza „cafenea” va fi înlocuită cu copia $NUME.
- Serverul POS se oprește câteva minute; tabletele lucrează offline în acest timp.
- Baza actuală NU se șterge: devine cafenea_inainte_<data> și se poate consulta după.
- Tot ce s-a vândut după momentul copiei trebuie retrimis de pe fiecare tabletă
  („Retrimite evenimentele din ultimele 7 zile”), vezi pasul de la final.

TEXT
read -rp "Scrieți RESTAUREZ ca să continuați: " raspuns
[[ $raspuns == RESTAUREZ ]] || opreste "renunțat"

active=()
for u in cafenea-backup.timer cafenea-verificari.timer cafenea.service; do
  if systemctl is-active --quiet "$u"; then active+=("$u"); fi
done
pas "Opresc serverul POS și timerele"
systemctl stop cafenea-backup.timer cafenea-verificari.timer cafenea.service 2>/dev/null || true

VECHE=
if [[ -n $(psql_ -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'cafenea'") ]]; then
  VECHE=cafenea_inainte_$(date +%Y%m%d_%H%M%S)
  pas "Baza actuală devine $VECHE"
  psql_ -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'cafenea' AND pid <> pg_backend_pid()" >/dev/null
  psql_ -d postgres -c "ALTER DATABASE cafenea RENAME TO $VECHE"
fi

revino() {
  echo "Restaurarea a eșuat; pun la loc baza de dinainte." >&2
  psql_ -d postgres -c "DROP DATABASE IF EXISTS cafenea" || true
  [[ -n $VECHE ]] && psql_ -d postgres -c "ALTER DATABASE $VECHE RENAME TO cafenea"
  ((${#active[@]})) && systemctl start "${active[@]}"
  exit 1
}

pas "Creez baza nouă și restaurez copia"
psql_ -d postgres -v baza=cafenea < "$SQL/baza-noua.sql" || revino
age --decrypt -i "$CHEIE" "$FISIER" | pg pg_restore --exit-on-error --single-transaction -d cafenea || revino
psql_ -d cafenea < "$SQL/roluri.sql" || revino
raport cafenea

pas "Pornesc serverul POS"
systemctl start cafenea.service
sanatos=0
for _ in $(seq 1 60); do
  if curl -fs --noproxy "*" -m 3 -o /dev/null http://127.0.0.1:3000/api/sanatate; then sanatos=1; break; fi
  sleep 1
done
((${#active[@]})) && systemctl start "${active[@]}"
(( sanatos )) || opreste "serverul nu răspunde după restaurare: sudo journalctl -u cafenea -n 50"

cat <<TEXT

Restaurare terminată din $NUME.

Pași obligatorii acum:
1. Pe FIECARE tabletă: meniul POS → „Retrimite evenimentele din ultimele 7 zile”. Vânzările, plățile
   și închiderile de tură făcute după momentul copiei ajung din nou pe server; cele care existau deja
   sunt recunoscute după identificator și nu se dublează.
2. În panou: verificați ultimele ture, soldurile de numerar și Setări → Erori de sincronizare.
3. Recepțiile, transferurile și operațiunile de casă introduse în PANOU după momentul copiei NU sunt
   pe tablete: se reintroduc de mână (le găsiți în baza veche, dacă mai era accesibilă).
${VECHE:+4. Baza veche e păstrată ca $VECHE. După ce ați verificat totul: sudo -u postgres dropdb $VECHE}
TEXT
