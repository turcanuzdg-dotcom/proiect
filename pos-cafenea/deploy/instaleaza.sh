#!/usr/bin/env bash
# Pregătește un VPS Ubuntu 24.04 pentru POS: actualizări automate, ceas, firewall, SSH doar cu chei,
# Node.js 22, PostgreSQL 16 cu roluri separate, Caddy (HTTPS), jurnale limitate, serviciile systemd
# ale POS-ului, ale copiilor de siguranță și ale verificărilor.
#
# Se rulează ca root, pe VPS, din directorul deploy/ copiat acolo:
#   sudo bash instaleaza.sh pos.domeniu.md admin@domeniu.md
# E idempotent: se poate rula oricând din nou (de ex. după ce s-a schimbat ceva în deploy/ sau după
# ce ați completat backup.env); a doua oară argumentele se pot omite. Nu suprascrie fișierele cu
# secrete din /etc/cafenea și nu atinge datele din baza de date.
# shellcheck disable=SC1111  # ghilimelele românești „…” din mesaje sunt intenționate
set -euo pipefail
umask 022

DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ETC=/etc/cafenea
BAZA=/opt/cafenea
LIB=/usr/local/lib/cafenea
PG_ETC=/etc/postgresql/16/main
# Amprentele cheilor de semnare ale depozitelor apt (verificate la 23.10.2026). Dacă furnizorul își
# schimbă cheia, scriptul se oprește: verificați noua amprentă pe site-ul oficial, apoi actualizați-o aici.
AMPRENTA_NODESOURCE=6F71F525282841EEDAF851B42F59B5F99B1BE0B4
AMPRENTA_CADDY=65760C51EDEA2017CEA2CA15155B6D79CA56EA34

pas() { printf '\n==> %s\n' "$*"; }
avert() { printf '\n!!! %s\n' "$*" >&2; }
opreste() { printf '\nEROARE: %s\n' "$*" >&2; exit 1; }

# Copiază un fișier doar dacă diferă. SCHIMBAT=1 dacă l-a scris, 0 dacă era deja identic.
SCHIMBAT=0
copiaza() {
  local sursa=$1 dest=$2 proprietar=$3 mod=$4
  SCHIMBAT=0
  if [[ ! -f $dest ]] || ! cmp -s "$sursa" "$dest"; then
    install -D -m "$mod" "$sursa" "$dest"
    SCHIMBAT=1
  fi
  chown "$proprietar" "$dest"
  chmod "$mod" "$dest"
}

# psql ca superutilizatorul postgres (din /, ca să nu se plângă că nu poate intra în /root).
psql_pg() { (cd / && runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"); }

# Descarcă o cheie de semnare apt, verifică amprenta și o salvează în format binar.
cheie_apt() {
  local url=$1 amprenta=$2 dest=$3 tmp gasita
  tmp=$(mktemp)
  curl -fsSL --proto '=https' --tlsv1.2 -o "$tmp" "$url"
  gasita=$(gpg --show-keys --with-colons "$tmp" 2>/dev/null | awk -F: '$1 == "fpr" { print $10; exit }')
  if [[ $gasita != "$amprenta" ]]; then
    rm -f "$tmp"
    opreste "cheia de la $url are amprenta ${gasita:-necunoscută}, nu $amprenta. Nu instalez nimic din acest depozit."
  fi
  install -d -m 755 "$(dirname "$dest")"
  gpg --dearmor --yes -o "$dest" "$tmp"
  chmod 644 "$dest"
  rm -f "$tmp"
}

# ---- 0. Verificări și parametri ----
[[ $EUID -eq 0 ]] || opreste "rulați cu sudo: sudo bash $0 pos.domeniu.md admin@domeniu.md"
# shellcheck disable=SC1091
. /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] || opreste "scriptul e scris pentru Ubuntu 24.04 (aici: ${PRETTY_NAME:-necunoscut})"

DOMENIU=${1:-$(cat "$ETC/domeniu" 2>/dev/null || true)}
EMAIL=${2:-$(cat "$ETC/email" 2>/dev/null || true)}
[[ -n $DOMENIU && -n $EMAIL ]] || opreste "lipsesc domeniul și e-mailul. Exemplu: sudo bash $0 pos.cafenea.md admin@cafenea.md"
DOMENIU=${DOMENIU,,}
[[ $DOMENIU =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || opreste "domeniu invalid: $DOMENIU"
[[ $EMAIL =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || opreste "e-mail invalid: $EMAIL"

export DEBIAN_FRONTEND=noninteractive
# needrestart (Ubuntu 24.04) repornește singur serviciile afectate de actualizări, fără întrebări.
export NEEDRESTART_MODE=a
APT=(apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

# 711: nimeni în afară de root nu poate lista directorul; cafenea-backup poate citi doar fișierul cu
# cheile publice age, pe care îl știe după nume. Fișierele cu secrete sunt 600, ale lui root.
install -d -m 711 -o root -g root "$ETC"
echo "$DOMENIU" > "$ETC/domeniu"
echo "$EMAIL" > "$ETC/email"

# ---- 1. Ora și actualizările ----
pas "Fusul orar Europe/Chisinau"
timedatectl set-timezone Europe/Chisinau

pas "Actualizez sistemul (apt update && apt upgrade)"
apt-get update -q
"${APT[@]}" upgrade
"${APT[@]}" install ca-certificates curl gnupg openssl ufw unattended-upgrades age rclone

pas "Actualizări de securitate automate (unattended-upgrades)"
copiaza "$DIR/sistem/20auto-upgrades" /etc/apt/apt.conf.d/20auto-upgrades root:root 644
copiaza "$DIR/sistem/52cafenea-unattended-upgrades" /etc/apt/apt.conf.d/52cafenea-unattended-upgrades root:root 644
systemctl enable --now unattended-upgrades.service >/dev/null

pas "Sincronizarea ceasului (NTP)"
if systemctl is-active --quiet chrony; then
  echo "chrony e activ."
else
  dpkg -s systemd-timesyncd >/dev/null 2>&1 || "${APT[@]}" install systemd-timesyncd
  timedatectl set-ntp true || avert "nu pot porni sincronizarea NTP (timedatectl set-ntp true)"
fi
for _ in $(seq 1 30); do
  [[ $(timedatectl show -p NTPSynchronized --value) == yes ]] && break
  sleep 1
done
if [[ $(timedatectl show -p NTPSynchronized --value) == yes ]]; then
  echo "Ceasul e sincronizat: $(date '+%Y-%m-%d %H:%M:%S %Z')"
else
  avert "ceasul nu e încă sincronizat. Verificați peste câteva minute: timedatectl status"
fi

# ---- 2. Rețea și SSH ----
pas "Firewall (ufw): intră doar SSH, HTTP și HTTPS"
# Porturile pe care ascultă SSH acum (de obicei 22): nu închidem ușa prin care sunteți conectat.
porturi_ssh=$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }' | sort -u)
[[ -n $porturi_ssh ]] || porturi_ssh=22
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for p in $porturi_ssh; do
  ufw limit "$p/tcp" comment 'SSH, limitat la 6 conexiuni / 30 s' >/dev/null
done
ufw allow 80/tcp comment 'HTTP (Caddy: certificat și redirecționare spre HTTPS)' >/dev/null
ufw allow 443/tcp comment 'HTTPS (Caddy)' >/dev/null
ufw allow 443/udp comment 'HTTP/3 (Caddy)' >/dev/null
ufw --force enable >/dev/null
ufw status verbose

pas "SSH doar cu chei"
are_chei=0
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  if [[ -s $f ]] && grep -qE '(ssh-(ed25519|rsa)|ecdsa-sha2-|sk-(ssh|ecdsa))' "$f"; then are_chei=1; fi
done
if (( are_chei )); then
  copiaza "$DIR/sistem/sshd-cafenea.conf" /etc/ssh/sshd_config.d/01-cafenea.conf root:root 644
  if ! sshd -t; then
    rm -f /etc/ssh/sshd_config.d/01-cafenea.conf
    opreste "configurația SSH nu trece de sshd -t; am scos fișierul nou, SSH a rămas cum era"
  fi
  if (( SCHIMBAT )); then
    systemctl try-reload-or-restart ssh.service
    avert "Autentificarea SSH cu parolă e dezactivată. Înainte să închideți sesiunea curentă, deschideți
    una nouă (cu cheia) și verificați că intrați."
  fi
  # (fără „sshd -T | grep -q”: cu pipefail, grep care se oprește devreme ar face pipeline-ul să pară eșuat)
  setari_ssh=$(sshd -T 2>/dev/null || true)
  grep -qx 'passwordauthentication no' <<< "$setari_ssh" \
    || avert "sshd raportează încă PasswordAuthentication activ: verificați sudo sshd -T"
else
  avert "Nu există nicio cheie publică în /root/.ssh/authorized_keys sau /home/*/.ssh/authorized_keys.
    NU dezactivez parolele SSH (v-ați bloca singur). Adăugați o cheie (ssh-copy-id) și rulați din nou scriptul."
fi

# ---- 3. Utilizatori și directoare ----
pas "Utilizatorii de sistem cafenea (serverul) și cafenea-backup (copii și verificări)"
for u in cafenea cafenea-backup; do
  if ! id -u "$u" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "/var/lib/$u" --no-create-home --shell /usr/sbin/nologin "$u"
  fi
done
install -d -m 755 -o root -g root "$BAZA" "$BAZA/versiuni" "$LIB" "$LIB/postgresql"

# Fără swap, un vârf de memorie oprește brusc PostgreSQL sau Node; 2 GB pe disc sunt o plasă de siguranță.
if [[ -z $(swapon --noheadings --show=NAME) ]]; then
  pas "Fișier de swap de 2 GB"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness = 10' > /etc/sysctl.d/60-cafenea-swap.conf
  sysctl -q --system
fi

# ---- 4. Depozitele Node.js 22 și Caddy, apoi pachetele ----
pas "Depozitele apt NodeSource (Node.js 22) și Caddy, cu cheile verificate"
cheie_apt https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key "$AMPRENTA_NODESOURCE" /etc/apt/keyrings/nodesource.gpg
echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' \
  > /etc/apt/sources.list.d/nodesource.list
# Pachetul nodejs vine de la NodeSource, nu versiunea mai veche din Ubuntu.
printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600\n' > /etc/apt/preferences.d/nodesource
cheie_apt https://dl.cloudsmith.io/public/caddy/stable/gpg.key "$AMPRENTA_CADDY" /usr/share/keyrings/caddy-stable-archive-keyring.gpg
echo 'deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main' \
  > /etc/apt/sources.list.d/caddy-stable.list

apt-get update -q
"${APT[@]}" install nodejs postgresql-16 caddy
[[ $(node --version) == v22.* ]] || opreste "node --version arată $(node --version), nu 22.x"
echo "Node $(node --version), $(psql --version), $(caddy version | cut -d' ' -f1)"

# ---- 5. PostgreSQL ----
pas "PostgreSQL 16: doar local, roluri separate, setări pentru 4 GB / 2 vCPU"
[[ -d $PG_ETC ]] || opreste "nu găsesc $PG_ETC (clusterul PostgreSQL 16 „main”)"
[[ -f $PG_ETC/pg_hba.conf.original ]] || cp -p "$PG_ETC/pg_hba.conf" "$PG_ETC/pg_hba.conf.original"
[[ -f $PG_ETC/pg_ident.conf.original ]] || cp -p "$PG_ETC/pg_ident.conf" "$PG_ETC/pg_ident.conf.original"
pg_schimbat=0
copiaza "$DIR/postgresql/pg_hba.conf" "$PG_ETC/pg_hba.conf" postgres:postgres 640; pg_schimbat=$((pg_schimbat | SCHIMBAT))
copiaza "$DIR/postgresql/pg_ident.conf" "$PG_ETC/pg_ident.conf" postgres:postgres 640; pg_schimbat=$((pg_schimbat | SCHIMBAT))
copiaza "$DIR/postgresql/cafenea.conf" "$PG_ETC/conf.d/cafenea.conf" postgres:postgres 644; pg_schimbat=$((pg_schimbat | SCHIMBAT))
systemctl enable --quiet postgresql
if (( pg_schimbat )); then
  # shared_buffers și pg_stat_statements cer repornire, nu doar reîncărcare.
  systemctl restart postgresql@16-main
fi
systemctl start postgresql
for _ in $(seq 1 30); do
  runuser -u postgres -- pg_isready -q && break
  sleep 1
done
runuser -u postgres -- pg_isready -q || opreste "PostgreSQL nu pornește: journalctl -u postgresql@16-main -n 50"

psql_pg -d postgres <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cafenea_migrari') THEN CREATE ROLE cafenea_migrari LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cafenea_app') THEN CREATE ROLE cafenea_app LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cafenea_citire') THEN CREATE ROLE cafenea_citire LOGIN; END IF;
END
$$;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SQL
if [[ -z $(psql_pg -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'cafenea'") ]]; then
  psql_pg -d postgres -v baza=cafenea < "$DIR/postgresql/baza-noua.sql"
  echo "Baza „cafenea” a fost creată."
fi
psql_pg -d cafenea < "$DIR/postgresql/roluri.sql"

# ---- 6. Secretele din /etc/cafenea ----
pas "Fișierele de configurare din $ETC (nu se suprascriu dacă există)"
if [[ ! -f $ETC/server.env ]]; then
  parola=$(openssl rand -hex 24)
  (umask 077 && sed "s/PAROLA_GENERATA_DE_INSTALEAZA/$parola/" "$DIR/server.env.example" > "$ETC/server.env")
  echo "Creat $ETC/server.env (cu parola rolului de migrații generată acum)."
fi
chown root:root "$ETC/server.env"
chmod 600 "$ETC/server.env"
parola=$(sed -n 's#^DATABASE_URL_MIGRARI=postgresql://cafenea_migrari:\([A-Za-z0-9]*\)@.*#\1#p' "$ETC/server.env")
[[ -n $parola && $parola != PAROLA_GENERATA_DE_INSTALEAZA ]] \
  || opreste "nu găsesc parola rolului cafenea_migrari în DATABASE_URL_MIGRARI din $ETC/server.env"
# Parola trece prin stdin, nu prin linia de comandă (unde s-ar vedea în lista proceselor).
printf "ALTER ROLE cafenea_migrari PASSWORD '%s';\n" "$parola" | psql_pg -d postgres
unset parola

for f in backup/backup.env backup/backup-destinatari.txt verificari/verificari.env; do
  dest=$ETC/$(basename "$f")
  if [[ ! -f $dest ]]; then
    (umask 077 && cp "$DIR/$f.example" "$dest")
    echo "Creat $dest (de completat)."
  fi
  chown root:root "$dest"
  chmod 600 "$dest"
done
# Cheile publice age le citește backup.sh (ca cafenea-backup); nu sunt secrete, dar nici de modificat.
chgrp cafenea-backup "$ETC/backup-destinatari.txt"
chmod 640 "$ETC/backup-destinatari.txt"

# ---- 7. Jurnalele ----
pas "journald: cel mult 30 de zile și 1 GB"
copiaza "$DIR/sistem/journald-cafenea.conf" /etc/systemd/journald.conf.d/cafenea.conf root:root 644
if (( SCHIMBAT )); then systemctl restart systemd-journald; fi

# ---- 8. Serviciile POS ----
pas "Serviciile systemd și scripturile"
copiaza "$DIR/backup/backup.sh" "$LIB/backup.sh" root:root 755
copiaza "$DIR/backup/restaureaza.sh" "$LIB/restaureaza.sh" root:root 755
copiaza "$DIR/verificari/verificari.sh" "$LIB/verificari.sh" root:root 755
copiaza "$DIR/postgresql/baza-noua.sql" "$LIB/postgresql/baza-noua.sql" root:root 644
copiaza "$DIR/postgresql/roluri.sql" "$LIB/postgresql/roluri.sql" root:root 644
unitate_schimbata=0
for u in cafenea.service backup/cafenea-backup.service backup/cafenea-backup.timer \
         verificari/cafenea-verificari.service verificari/cafenea-verificari.timer; do
  copiaza "$DIR/$u" "/etc/systemd/system/$(basename "$u")" root:root 644
  if [[ $u == cafenea.service ]]; then unitate_schimbata=$SCHIMBAT; fi
done
systemctl daemon-reload
systemctl enable --quiet cafenea.service
if [[ -e $BAZA/curent ]] && (( unitate_schimbata )); then
  systemctl try-restart cafenea.service
fi

configurat() { [[ -f $1 ]] && ! grep -q 'COMPLETATI' "$1"; }
if configurat "$ETC/backup.env" && grep -q '^age1' "$ETC/backup-destinatari.txt"; then
  systemctl enable --now --quiet cafenea-backup.timer
  echo "Copiile de siguranță la 15 minute: pornite."
  copii_pornite=1
else
  copii_pornite=0
fi
if configurat "$ETC/verificari.env"; then
  systemctl enable --now --quiet cafenea-verificari.timer
  echo "Verificările la 5 minute: pornite."
  verificari_pornite=1
else
  verificari_pornite=0
fi

# ---- 9. Caddy ----
pas "Caddy pentru $DOMENIU"
tmp=$(mktemp)
sed -e "s/pos\.exemplu\.md/$DOMENIU/g" -e "s/admin@exemplu\.md/$EMAIL/g" "$DIR/Caddyfile" > "$tmp"
caddy validate --adapter caddyfile --config "$tmp" >/dev/null 2>&1 \
  || { caddy validate --adapter caddyfile --config "$tmp"; rm -f "$tmp"; opreste "Caddyfile invalid"; }
copiaza "$tmp" /etc/caddy/Caddyfile root:caddy 640
rm -f "$tmp"
systemctl enable --quiet caddy
if (( SCHIMBAT )); then systemctl reload-or-restart caddy; else systemctl start caddy; fi

# ---- 10. Ce urmează ----
ip=$(hostname -I | awk '{ print $1 }')
cat <<TEXT

==========================================================================================
Serverul e pregătit. Pașii următori (detaliați în deploy/README.md):

 1. DNS: înregistrarea A „$DOMENIU” → $ip (TTL 300). Caddy cere certificatul HTTPS singur
    imediat ce numele arată spre acest server.
 2. Completați $ETC/server.env: ADMIN_PAROLA (doar pentru prima pornire) și POSLINK_API_KEY.
      sudo nano $ETC/server.env
 3. Pe calculatorul de dezvoltare, din pos-cafenea/:
      bash deploy/actualizeaza.sh UTILIZATOR@$ip
 4. După ce intrați în panou: ștergeți ADMIN_PAROLA din server.env și reporniți serviciul
      sudo systemctl restart cafenea
TEXT
if (( ! copii_pornite )); then
  cat <<TEXT
 5. COPIILE DE SIGURANȚĂ NU SUNT ÎNCĂ PORNITE: completați $ETC/backup.env și
    $ETC/backup-destinatari.txt, apoi rulați din nou: sudo bash $DIR/instaleaza.sh
TEXT
fi
if (( ! verificari_pornite )); then
  cat <<TEXT
 6. Verificările la 5 minute nu sunt pornite: completați $ETC/verificari.env și rulați din nou scriptul.
TEXT
fi
if (( ! are_chei )); then
  echo " !  SSH acceptă încă parole: adăugați o cheie și rulați din nou scriptul."
fi
echo "=========================================================================================="
