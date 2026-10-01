#!/usr/bin/env bash
# Instalează dependențele (folosit și la pornirea sesiunilor Claude Code în cloud).
set -e
cd "$(dirname "$0")/.."
pip install -q -r requirements.txt 2>/dev/null || pip install -q --break-system-packages -r requirements.txt
if ! command -v tesseract >/dev/null 2>&1; then
  (apt-get install -y -qq tesseract-ocr tesseract-ocr-ron tesseract-ocr-rus >/dev/null 2>&1 \
    || sudo apt-get install -y -qq tesseract-ocr tesseract-ocr-ron tesseract-ocr-rus >/dev/null 2>&1) \
    || echo "Atenție: tesseract nu s-a putut instala; scanurile vor cere verificare vizuală."
fi
