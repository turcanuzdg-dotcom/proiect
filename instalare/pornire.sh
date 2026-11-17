#!/usr/bin/env bash
# Prima instalare pe VPS dintr-o singură comandă, fără calculator de dezvoltare. Se rulează PE SERVER,
# ca root, pe un Ubuntu 24.04 proaspăt:
#
#   curl -fsSLO https://turcanuzdg-dotcom.github.io/proiect/instalare/pornire.sh
#   bash pornire.sh pos.domeniu.md email@domeniu.md
#
# Descarcă versiunea gata construită (codul din git + interfața web/dist), îi verifică amprenta
# SHA-256, rulează deploy/instaleaza.sh, cere parola panoului și activează versiunea cu
# deploy/activeaza-versiune.sh. Se poate rula din nou dacă se oprește la jumătate.
# Versiunea și amprenta sunt scrise în copia publicată de pe site (vezi publica-pornire.sh).
# shellcheck disable=SC1111  # ghilimelele românești „…” din mesaje sunt intenționate
set -euo pipefail

ADRESA=https://turcanuzdg-dotcom.github.io/proiect/instalare
VERSIUNE=20261117-091805-f72dd40f7b
AMPRENTA=fd65e1effe8ef0a5863f0db04be5ea731289a775c3e3ca96c88d7c03c265fd49

opreste() { printf '\nEROARE: %s\n' "$*" >&2; exit 1; }
pas() { printf '\n==> %s\n' "$*"; }

[[ $EUID -eq 0 ]] || opreste "rulați ca root (sau cu sudo)"
DOMENIU=${1:-}
EMAIL=${2:-}
[[ -n $DOMENIU && -n $EMAIL ]] || opreste "exemplu: bash pornire.sh pos.domeniu.md email@domeniu.md"
[[ $VERSIUNE != __* ]] || opreste "folosiți copia publicată pe site, nu pe cea din depozit"

SURSA=/root/cafenea-instalare/$VERSIUNE
ARHIVA=/root/cafenea-instalare/cafenea-$VERSIUNE.tar.gz
install -d -m 700 /root/cafenea-instalare

pas "Descarc versiunea $VERSIUNE"
if [[ ! -f $ARHIVA ]] || ! echo "$AMPRENTA  $ARHIVA" | sha256sum -c --quiet 2>/dev/null; then
  curl -fsSL "$ADRESA/cafenea-$VERSIUNE.tar.gz" -o "$ARHIVA.part"
  mv "$ARHIVA.part" "$ARHIVA"
fi
echo "$AMPRENTA  $ARHIVA" | sha256sum -c --quiet || opreste "amprenta arhivei nu se potrivește: nu instalez nimic"
rm -rf "$SURSA"
install -d -m 700 "$SURSA"
tar -xzf "$ARHIVA" -C "$SURSA" --no-same-owner

pas "Pregătesc serverul (5–10 minute)"
bash "$SURSA/deploy/instaleaza.sh" "$DOMENIU" "$EMAIL"

ENV=/etc/cafenea/server.env
if ! grep -qE '^ADMIN_PAROLA=.+' "$ENV" && [[ ! -L /opt/cafenea/curent ]]; then
  pas "Parola contului de administrator (login: admin)"
  echo "Minimum 12 caractere. Nu se vede când tastați. Notați-o într-un loc sigur."
  while :; do
    read -rsp "Parola: " p1 </dev/tty; echo
    read -rsp "Încă o dată: " p2 </dev/tty; echo
    [[ $p1 == "$p2" ]] || { echo "Nu sunt la fel, reluați."; continue; }
    (( ${#p1} >= 12 )) || { echo "Prea scurtă (minimum 12 caractere)."; continue; }
    [[ $p1 != *[\'\\]* ]] || { echo "Fără apostrof (') sau bară inversă (\\), vă rog."; continue; }
    break
  done
  tmp=$(mktemp)
  P=$p1 awk '/^ADMIN_PAROLA=/{print "ADMIN_PAROLA=\x27" ENVIRON["P"] "\x27"; next} {print}' "$ENV" > "$tmp"
  install -m 600 -o root -g root "$tmp" "$ENV"
  rm -f "$tmp"
  unset p1 p2
fi

if [[ -L /opt/cafenea/curent && $(basename "$(readlink -f /opt/cafenea/curent)") == "$VERSIUNE" ]]; then
  echo "Versiunea $VERSIUNE rulează deja."
else
  pas "Activez programul"
  bash "$SURSA/deploy/activeaza-versiune.sh" "$ARHIVA" "$VERSIUNE"
fi

cat <<EOF

==> Gata.
Panoul:  https://$DOMENIU/admin.html   (login: admin)
Tableta: https://$DOMENIU/pos.html
Dacă adresa nu se deschide încă, DNS-ul sau certificatul HTTPS mai au nevoie de câteva minute.
După prima intrare în panou, ștergeți parola din $ENV (rândul ADMIN_PAROLA) cu:
  sed -i "s/^ADMIN_PAROLA=.*/ADMIN_PAROLA=/" $ENV && systemctl restart cafenea
EOF
