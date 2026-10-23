#!/usr/bin/env bash
# Publică pe VPS versiunea din git. Se rulează pe CALCULATORUL DE DEZVOLTARE, din pos-cafenea/:
#
#   bash deploy/actualizeaza.sh utilizator@pos.domeniu.md
#
# 1. Aici: verifică că nu există modificări necomise, instalează exact dependențele din
#    package-lock.json (npm ci), rulează testele și verificarea de tipuri, construiește interfața
#    (web/dist) și face o arhivă doar cu fișierele din git + web/dist.
# 2. Pe VPS (deploy/activeaza-versiune.sh, prin ssh + sudo): copie de siguranță, dependențele de
#    producție (npm ci --omit=dev --ignore-scripts), comutarea pe versiunea nouă, repornirea
#    (migrațiile se aplică la pornire, cu rolul proprietar) și verificarea /api/sanatate. Dacă
#    serverul nu pornește, revine singur la versiunea anterioară.
#
# Opțiuni:
#   --fara-teste   sare peste npm test și typecheck (doar pentru o corecție urgentă, testată altfel)
#
# Uneltele de build (Vite, Vitest, TypeScript) rămân pe calculatorul de dezvoltare; pe serverul care
# ține banii ajung doar dependențele de producție.
set -euo pipefail

opreste() { printf '\nEROARE: %s\n' "$*" >&2; exit 1; }
pas() { printf '\n==> %s\n' "$*"; }

FARA_TESTE=0
GAZDA=
for a in "$@"; do
  case $a in
    --fara-teste) FARA_TESTE=1 ;;
    -h | --help) sed -n '2,20p' "$0"; exit 0 ;;
    -*) opreste "opțiune necunoscută: $a" ;;
    *) GAZDA=$a ;;
  esac
done
[[ -n $GAZDA ]] || opreste "lipsește serverul. Exemplu: bash deploy/actualizeaza.sh root@pos.cafenea.md"

cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f package-lock.json && -d server/migrari ]] || opreste "rulați scriptul din depozitul pos-cafenea"
for c in git npm node ssh scp tar; do command -v "$c" >/dev/null || opreste "lipsește comanda $c"; done
[[ $(node --version) == v22.* ]] || opreste "e nevoie de Node 22 (aici: $(node --version)), aceeași versiune ca pe server"

if [[ -n $(git status --porcelain -- .) ]]; then
  git status --short -- .
  opreste "există modificări necomise sau fișiere noi. Pe server ajunge doar ce e în git: faceți commit (sau git stash) și reluați."
fi
VERSIUNE=$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short=10 HEAD)
pas "Versiunea $VERSIUNE ($(git log -1 --format=%s))"

pas "Dependențele exacte din package-lock.json (npm ci)"
npm ci --no-audit --no-fund

if (( FARA_TESTE )); then
  echo "Testele sunt sărite (--fara-teste)."
else
  pas "Verificarea de tipuri și testele"
  npm run typecheck
  npm test
fi

pas "Construiesc interfața (web/dist)"
rm -rf web/dist
npm run build
[[ -f web/dist/pos.html && -f web/dist/admin.html && -f web/dist/sw.js ]] || opreste "web/dist e incomplet după build"

lucru=$(mktemp -d)
trap 'rm -rf "$lucru"' EXIT
arhiva=$lucru/cafenea-$VERSIUNE.tar.gz
pas "Arhiva: fișierele din git + web/dist"
# COPYFILE_DISABLE: pe macOS, tar nu mai adaugă fișierele ascunse „._*”.
{ git ls-files -z -- .; find web/dist -type f -print0; } | COPYFILE_DISABLE=1 tar --null -czf "$arhiva" -T -
echo "$(( ($(wc -c < "$arhiva") + 1023) / 1024 )) kB"

pas "Trimit pe $GAZDA"
scp -q "$arhiva" "$GAZDA:cafenea-$VERSIUNE.tar.gz"
scp -q deploy/activeaza-versiune.sh "$GAZDA:cafenea-activeaza-$VERSIUNE.sh"

pas "Activez versiunea pe server (cere parola sudo dacă nu sunteți root)"
# shellcheck disable=SC2029  # variabilele se expandează aici, intenționat
ssh -t "$GAZDA" "sudo bash ~/cafenea-activeaza-$VERSIUNE.sh ~/cafenea-$VERSIUNE.tar.gz $VERSIUNE"
