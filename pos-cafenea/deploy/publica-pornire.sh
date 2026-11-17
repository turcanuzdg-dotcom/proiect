#!/usr/bin/env bash
# Pregătește instalarea dintr-o singură comandă (deploy/pornire-rapida.sh). Se rulează pe
# calculatorul de dezvoltare, din pos-cafenea/:
#
#   bash deploy/publica-pornire.sh DOSAR_IESIRE
#
# Construiește aceeași arhivă ca deploy/actualizeaza.sh (fișierele din git + web/dist, după teste) și
# scrie în DOSAR_IESIRE: cafenea-VERSIUNE.tar.gz și pornire.sh (cu versiunea și amprenta SHA-256
# completate). Conținutul dosarului se publică pe site la /instalare/.
set -euo pipefail

opreste() { printf '\nEROARE: %s\n' "$*" >&2; exit 1; }
pas() { printf '\n==> %s\n' "$*"; }

IESIRE=${1:-}
[[ -n $IESIRE ]] || opreste "exemplu: bash deploy/publica-pornire.sh /tmp/instalare"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f package-lock.json && -d server/migrari ]] || opreste "rulați scriptul din depozitul pos-cafenea"
if [[ -n $(git status --porcelain -- .) ]]; then
  git status --short -- .
  opreste "există modificări necomise: faceți commit și reluați"
fi

VERSIUNE=$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short=10 HEAD)
pas "Versiunea $VERSIUNE"
npm ci --no-audit --no-fund
npm run typecheck
npm test
rm -rf web/dist
npm run build
[[ -f web/dist/pos.html && -f web/dist/admin.html && -f web/dist/sw.js ]] || opreste "web/dist e incomplet după build"

mkdir -p "$IESIRE"
rm -f "$IESIRE"/cafenea-*.tar.gz
arhiva=$IESIRE/cafenea-$VERSIUNE.tar.gz
{ git ls-files -z -- .; find web/dist -type f -print0; } | COPYFILE_DISABLE=1 tar --null -czf "$arhiva" -T -
amprenta=$(sha256sum "$arhiva" | cut -d' ' -f1)
sed -e "s/^VERSIUNE=__VERSIUNE__$/VERSIUNE=$VERSIUNE/" -e "s/^AMPRENTA=__AMPRENTA__$/AMPRENTA=$amprenta/" \
  deploy/pornire-rapida.sh > "$IESIRE/pornire.sh"
grep -q "^AMPRENTA=$amprenta$" "$IESIRE/pornire.sh" || opreste "nu am putut completa pornire.sh"
pas "Gata: $IESIRE ($(( $(wc -c < "$arhiva") / 1024 )) kB, sha256 $amprenta)"
