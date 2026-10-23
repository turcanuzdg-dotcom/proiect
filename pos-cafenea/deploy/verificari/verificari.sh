#!/usr/bin/env bash
# Verificări pe VPS la fiecare 5 minute (cafenea-verificari.timer). Rezultatul pleacă la
# healthchecks.io: „bine” dacă nu e nicio problemă, altfel „eșec” cu lista problemelor (o vedeți în
# alerta pe e-mail/Telegram). Dacă VPS-ul cade de tot, anunțurile încetează și healthchecks.io
# alertează după toleranța setată (10 minute), deci verificarea acoperă și „serverul nu mai există”.
#
# Ce verifică:
#   - serverul POS răspunde la /api/sanatate (503 = baza de date nu răspunde);
#   - discul are loc; ceasul e sincronizat (NTP);
#   - evenimente de pe tablete respinse de server (Setări → Erori de sincronizare);
#   - tablete care nu s-au mai sincronizat de 2 ore, doar în programul cafenelelor.
#
# Rulează ca cafenea-backup (rolul PostgreSQL cafenea_citire, doar citire).
# Manual: sudo systemctl start cafenea-verificari.service && sudo journalctl -u cafenea-verificari -n 5
set -uo pipefail

: "${PING_URL_VERIFICARI:?lipsește PING_URL_VERIFICARI în /etc/cafenea/verificari.env}"
PRAG_DISC=${PRAG_DISC:-80}
# Programul în care tabletele trebuie să fie pornite (ore întregi, ora Chișinăului): 8-22 = 08:00–21:59.
ORE_LUCRU=${ORE_LUCRU:-8-22}
ORE_FARA_SINCRONIZARE=${ORE_FARA_SINCRONIZARE:-2}

probleme=()

cod=$(curl -s --noproxy '*' -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/sanatate || true)
case $cod in
  200) ;;
  503) probleme+=("serverul POS răspunde, dar baza de date nu (sanatate: 503)") ;;
  *) probleme+=("serverul POS nu răspunde (sanatate: ${cod:-fără răspuns}); sudo journalctl -u cafenea -n 50") ;;
esac

ocupat=$(df --output=pcent / | tail -n 1 | tr -dc '0-9')
if (( ${ocupat:-0} >= PRAG_DISC )); then
  probleme+=("discul e ocupat în proporție de ${ocupat}% (prag ${PRAG_DISC}%)")
fi

if [[ $(timedatectl show -p NTPSynchronized --value 2>/dev/null) != yes ]]; then
  probleme+=("ceasul serverului nu e sincronizat (timedatectl status)")
fi

if erori=$(psql -XAtq -c "SELECT count(*) FROM evenimente_sync WHERE stare = 'eroare'" 2>&1); then
  if (( erori > 0 )); then
    probleme+=("$erori evenimente de pe tablete respinse de server: panou → Setări → Erori de sincronizare")
  fi
  ora=$((10#$(date +%H)))
  if (( ora >= ${ORE_LUCRU%-*} && ora < ${ORE_LUCRU#*-} )); then
    tacute=$(psql -XAtq -v ore="$ORE_FARA_SINCRONIZARE" <<'SQL'
SELECT string_agg(d.nume || ' (' || l.nume || ')', ', ' ORDER BY l.nume, d.nume)
  FROM dispozitive d JOIN locatii l ON l.id = d.locatie_id
 WHERE d.activ AND d.ultima_sincronizare IS NOT NULL
   AND d.ultima_sincronizare < now() - make_interval(hours => :ore)
SQL
    )
    if [[ -n $tacute ]]; then
      probleme+=("tablete fără sincronizare de peste ${ORE_FARA_SINCRONIZARE} ore: $tacute")
    fi
  fi
else
  probleme+=("nu mă pot conecta la baza de date: $erori")
fi

if ((${#probleme[@]})); then
  mesaj=$(printf -- '- %s\n' "${probleme[@]}")
  printf 'Probleme:\n%s\n' "$mesaj"
  curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "$mesaj" "$PING_URL_VERIFICARI/fail" || true
  exit 1
fi
echo "Totul în regulă"
curl -fsS -m 10 --retry 3 -o /dev/null "$PING_URL_VERIFICARI" || true
