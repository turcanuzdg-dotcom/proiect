#!/usr/bin/env bash
# Partea de pe VPS a unei actualizări. O pornește actualizeaza.sh (ssh + sudo); manual doar pentru
# revenirea la versiunea anterioară:
#
#   sudo bash activeaza-versiune.sh ARHIVA.tar.gz VERSIUNE   instalează și activează o versiune
#   sudo bash /opt/cafenea/curent/deploy/activeaza-versiune.sh --revino
#                                                             revine la versiunea anterioară
#
# Structura pe server:
#   /opt/cafenea/versiuni/<VERSIUNE>/   codul fiecărei versiuni (al lui root; serviciul doar îl citește)
#   /opt/cafenea/curent   → versiunea care rulează        /opt/cafenea/anterior → cea de dinainte
# shellcheck disable=SC1111  # ghilimelele românești „…” din mesaje sunt intenționate
set -euo pipefail
umask 022

BAZA=/opt/cafenea
ETC=/etc/cafenea
PASTREAZA_VERSIUNI=5

opreste() { printf '\nEROARE: %s\n' "$*" >&2; exit 1; }
pas() { printf '\n==> %s\n' "$*"; }
psql_pg() { (cd / && runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"); }

sanatos() {
  for _ in $(seq 1 90); do
    if curl -fs --noproxy "*" -m 3 -o /dev/null http://127.0.0.1:3000/api/sanatate; then return 0; fi
    sleep 1
  done
  return 1
}

# Comută atomic legătura „curent” (ln + mv -T: niciun moment fără versiune).
comuta() {
  ln -sfn "$1" "$BAZA/curent.nou"
  mv -Tf "$BAZA/curent.nou" "$BAZA/curent"
}

[[ $EUID -eq 0 ]] || opreste "rulați cu sudo"
[[ -f $ETC/server.env ]] || opreste "lipsește $ETC/server.env: rulați întâi deploy/instaleaza.sh"

# ---- Revenire manuală ----
if [[ ${1:-} == --revino ]]; then
  anterior=$(readlink -f "$BAZA/anterior" 2>/dev/null || true)
  [[ -n $anterior && -d $anterior ]] || opreste "nu există o versiune anterioară în $BAZA/anterior"
  curent=$(readlink -f "$BAZA/curent")
  pas "Revin de la $(basename "$curent") la $(basename "$anterior")"
  comuta "$anterior"
  ln -sfn "$curent" "$BAZA/anterior"
  systemctl restart cafenea.service
  sanatos || opreste "nici versiunea anterioară nu răspunde: sudo journalctl -u cafenea -n 80"
  echo "Rulează $(basename "$anterior"). Dacă versiunea nouă a aplicat migrații, codul vechi lucrează pe
schema nouă (migrațiile adaugă, nu șterg); dacă totuși apar erori, vezi „Revenire” în deploy/README.md."
  exit 0
fi

ARHIVA=${1:?utilizare: $0 ARHIVA.tar.gz VERSIUNE}
VERSIUNE=${2:?utilizare: $0 ARHIVA.tar.gz VERSIUNE}
[[ $VERSIUNE =~ ^[0-9]{8}-[0-9]{6}-[0-9a-f]+$ ]] || opreste "versiune invalidă: $VERSIUNE"
[[ -f $ARHIVA ]] || opreste "nu există $ARHIVA"
DEST=$BAZA/versiuni/$VERSIUNE
[[ ! -e $DEST ]] || opreste "$DEST există deja"
PRECEDENT=$(readlink -f "$BAZA/curent" 2>/dev/null || true)

# ---- 1. Codul ----
pas "Despachetez în $DEST"
install -d -m 755 "$DEST"
tar -xzf "$ARHIVA" -C "$DEST" --no-same-owner --no-same-permissions
chown -R root:root "$DEST"
chmod -R go-w,a+rX "$DEST"
[[ -f $DEST/server/src/index.ts && -f $DEST/web/dist/pos.html ]] || opreste "arhiva nu conține serverul și web/dist"

pas "Dependențele de producție (npm ci --omit=dev --ignore-scripts)"
# --ignore-scripts: niciun pachet nu rulează cod la instalare pe serverul cu banii (pg, PGlite,
# Fastify și tsx nu au nevoie; esbuild își ia binarul din pachetul opțional @esbuild/linux-x64).
(cd "$DEST" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)

# ---- 2. Verificări înainte de comutare ----
if ! grep -qE '^ADMIN_PAROLA=.+' "$ETC/server.env"; then
  admin=$(psql_pg -d cafenea -tAc "SELECT 1 FROM utilizatori WHERE rol = 'admin' LIMIT 1" 2>/dev/null || true)
  if [[ -z $admin ]]; then
    rm -rf "$DEST"
    opreste "baza nu are încă un administrator: completați ADMIN_PAROLA în $ETC/server.env pentru prima pornire"
  fi
fi
grep -qE '^POSLINK_API_KEY=.+' "$ETC/server.env" \
  || echo "Atenție: POSLINK_API_KEY e gol în $ETC/server.env; plata cu cardul prin terminal nu va funcționa."

# ---- 3. Copie de siguranță chiar înainte de schimbare ----
if systemctl is-enabled --quiet cafenea-backup.timer 2>/dev/null; then
  pas "Copie de siguranță înainte de actualizare"
  if ! systemctl start cafenea-backup.service; then
    if [[ ${FARA_COPIE:-0} != 1 ]]; then
      rm -rf "$DEST"
      opreste "copia de siguranță a eșuat (sudo journalctl -u cafenea-backup -n 30). Actualizarea s-a oprit.
Doar dacă știți de ce și acceptați riscul, continuați fără copie, pe server:
  sudo FARA_COPIE=1 bash ${BASH_SOURCE[0]} $ARHIVA $VERSIUNE"
    fi
    echo "Copia a eșuat, dar continui (FARA_COPIE=1)."
  fi
else
  echo "Atenție: copiile de siguranță nu sunt încă pornite (cafenea-backup.timer); continui fără copie."
fi

# ---- 4. Migrații separate, dacă versiunea are o comandă pentru ele ----
# Implicit serverul aplică singur migrațiile la pornire, cu DATABASE_URL_MIGRARI.
# Rulează ca serviciul: același utilizator și același server.env, citit de systemd (nu de shell).
if grep -q '"migreaza"' "$DEST/server/package.json"; then
  pas "Migrațiile bazei (npm run migreaza, rolul proprietar)"
  systemd-run --quiet --wait --pipe --collect \
    -p User=cafenea -p Group=cafenea -p PrivateTmp=yes \
    -p EnvironmentFile="$ETC/server.env" -p WorkingDirectory="$DEST" \
    -E NODE_ENV=production -E HOME=/tmp \
    /usr/bin/npm run --silent migreaza -w server \
    || { rm -rf "$DEST"; opreste "migrațiile au eșuat; versiunea curentă rulează în continuare neschimbată"; }
fi

# ---- 5. Comutare și repornire ----
pas "Pornesc versiunea $VERSIUNE"
comuta "$DEST"
systemctl restart cafenea.service

if ! sanatos; then
  echo
  journalctl -u cafenea.service -n 40 --no-pager || true
  if [[ -n $PRECEDENT ]]; then
    pas "Versiunea nouă nu răspunde: revin la $(basename "$PRECEDENT")"
    comuta "$PRECEDENT"
    systemctl restart cafenea.service
    if sanatos; then
      opreste "actualizarea a eșuat, dar rulează din nou versiunea anterioară. Jurnalul e mai sus.
Dacă eroarea e de la o migrație, baza poate fi deja migrată; vezi „Revenire” în deploy/README.md."
    fi
    opreste "nici versiunea anterioară nu răspunde. Urmați „Incident” din deploy/README.md."
  fi
  opreste "serverul nu pornește (prima instalare). Jurnalul e mai sus; corectați și reluați."
fi
echo "Serverul răspunde la /api/sanatate."
# Versiunea de dinainte rămâne la îndemână pentru „--revino”.
if [[ -n $PRECEDENT ]]; then ln -sfn "$PRECEDENT" "$BAZA/anterior"; fi

# Prin Caddy (HTTPS): la prima instalare certificatul poate lipsi până se propagă DNS-ul.
domeniu=$(cat "$ETC/domeniu" 2>/dev/null || true)
if [[ -n $domeniu ]]; then
  if curl -fs --noproxy "*" -m 10 -o /dev/null --resolve "$domeniu:443:127.0.0.1" "https://$domeniu/api/sanatate"; then
    echo "https://$domeniu răspunde."
  else
    echo "Atenție: https://$domeniu nu răspunde încă prin Caddy (DNS sau certificat): sudo journalctl -u caddy -n 30"
  fi
fi

# ---- 6. După ---
# Drepturile rolurilor, și pentru tabelele create de migrațiile noi (idempotent). Serverul merge deja;
# o eroare aici se raportează, dar nu anulează actualizarea.
if ! psql_pg -d cafenea < "$DEST/deploy/postgresql/roluri.sql"; then
  echo "Atenție: nu am putut reaplica deploy/postgresql/roluri.sql; rulați sudo bash $BAZA/curent/deploy/instaleaza.sh"
fi

if [[ -n $PRECEDENT && -d $PRECEDENT/deploy ]] && ! diff -rq "$PRECEDENT/deploy" "$DEST/deploy" >/dev/null; then
  echo
  echo "Fișierele din deploy/ s-au schimbat. Aplicați-le pe server cu:"
  echo "  sudo bash $BAZA/curent/deploy/instaleaza.sh"
fi
if grep -qE '^ADMIN_PAROLA=.+' "$ETC/server.env"; then
  echo
  echo "După ce v-ați autentificat în panou, ștergeți ADMIN_PAROLA din $ETC/server.env și: sudo systemctl restart cafenea"
fi

# Păstrăm ultimele versiuni (pentru revenire); niciodată pe cea curentă sau pe cea anterioară.
pastrate=0
anterior=$(readlink -f "$BAZA/anterior" 2>/dev/null || true)
while IFS= read -r d; do
  pastrate=$((pastrate + 1))
  if (( pastrate > PASTREAZA_VERSIUNI )) && [[ $d != "$DEST" && $d != "$anterior" ]]; then
    rm -rf -- "$d"
  fi
done < <(find "$BAZA/versiuni" -mindepth 1 -maxdepth 1 -type d | sort -r)

rm -f -- "$ARHIVA" "${BASH_SOURCE[0]}"
pas "Gata: rulează $VERSIUNE"
