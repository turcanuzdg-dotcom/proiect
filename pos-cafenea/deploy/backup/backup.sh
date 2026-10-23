#!/usr/bin/env bash
# Copia de siguranță a bazei POS, la fiecare 15 minute (cafenea-backup.timer):
#
#   pg_dump (format custom) → age (criptat cu cheile publice) → rclone (stocare S3 în afara VPS-ului)
#
# - Nimic necriptat nu atinge discul: pg_dump scrie direct în age.
# - Cheia S3 de pe VPS poate doar încărca și citi, nu și șterge; vechimea copiilor o gestionează
#   regulile de ciclu de viață ale bucket-ului (sfert/ 1 zi, zilnic/ 31 de zile, lunar/ 1 an).
# - La reușită (și doar atunci) anunță healthchecks.io; dacă anunțul lipsește mai mult de 45 de minute
#   (perioada de 15 + toleranța de 30), healthchecks.io trimite alertă pe e-mail/Telegram.
#
# Rulează ca utilizatorul de sistem cafenea-backup (rolul PostgreSQL cafenea_citire, doar citire).
# Manual: sudo systemctl start cafenea-backup.service && sudo journalctl -u cafenea-backup -n 20
set -euo pipefail
umask 077

: "${COPII_DESTINATIE:?lipsește COPII_DESTINATIE în /etc/cafenea/backup.env}"
: "${PING_URL:?lipsește PING_URL în /etc/cafenea/backup.env}"
AGE_DESTINATARI=${AGE_DESTINATARI:-/etc/cafenea/backup-destinatari.txt}
STARE=${STATE_DIRECTORY:-/var/lib/cafenea-backup}
# rclone primește remote-ul din variabilele RCLONE_CONFIG_COPII_*; fără fișier de configurare.
export RCLONE_CONFIG=${RCLONE_CONFIG:-/dev/null}

grep -q '^age1' "$AGE_DESTINATARI" || { echo "Nicio cheie publică age (age1...) în $AGE_DESTINATARI" >&2; exit 1; }

lucru=$(mktemp -d)
trap 'rm -rf "$lucru"' EXIT

moment=$(date -u +%Y%m%dT%H%M%SZ)
nume="cafenea-$moment.dump.age"
fisier="$lucru/$nume"

# --format=custom e deja comprimat; pg_restore îl poate restaura și selectiv (un singur tabel).
pg_dump --format=custom --no-password | age --encrypt -R "$AGE_DESTINATARI" -o "$fisier"

marime=$(stat -c %s "$fisier")
# O bază POS goală are deja peste 10 kB; un fișier mai mic înseamnă că ceva n-a mers.
if (( marime < 10240 )); then
  echo "Copia are doar $marime octeți: nu o trimit" >&2
  exit 1
fi

trimite() {
  # --immutable: un fișier cu același nume nu se suprascrie niciodată.
  rclone copyto --immutable --retries 5 --low-level-retries 10 --contimeout 30s --timeout 5m \
    "$fisier" "$COPII_DESTINATIE/$1"
}

trimite "sfert/$(date -u +%Y/%m/%d)/$nume"

# Prima copie reușită din fiecare zi și din fiecare lună (după ora Chișinăului) se mai păstrează o dată,
# în directoare cu termene de păstrare mai lungi.
zi=$(date +%F)
luna=$(date +%Y-%m)
if [[ $(cat "$STARE/ultima-zilnica" 2>/dev/null || true) != "$zi" ]]; then
  trimite "zilnic/$(date +%Y)/$nume"
  echo "$zi" > "$STARE/ultima-zilnica"
fi
if [[ $(cat "$STARE/ultima-lunara" 2>/dev/null || true) != "$luna" ]]; then
  trimite "lunar/$nume"
  echo "$luna" > "$STARE/ultima-lunara"
fi

mesaj="Copie trimisă: $nume ($(( (marime + 1023) / 1024 )) kB)"
echo "$mesaj"
# Anunțul de reușită. Dacă healthchecks.io nu răspunde, copia rămâne bună: doar notăm.
if ! curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "$mesaj" "$PING_URL"; then
  echo "Avertisment: healthchecks.io nu a confirmat anunțul (copia e totuși trimisă)" >&2
fi
