"""Hasurarea propriu-zisă, verificarea și raportul."""

from __future__ import annotations

import io
import json
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageDraw

from .detectie import Reguli, detecteaza
from .pagina import (Zona, cuvinte_din_ocr, cuvinte_din_text, este_scanata, tesseract_disponibil,
                     zone_de_acoperit, zone_semnaturi)

DPI_SCAN = 200
CALITATE_JPEG = 70
MIN_CUVINTE_STRAT = 15


@dataclass
class RaportPagina:
    numar: int
    scanata: bool
    surse: list[str] = field(default_factory=list)
    zone: list[Zona] = field(default_factory=list)
    semnaturi: list[fitz.Rect] = field(default_factory=list)
    atentionari: list[str] = field(default_factory=list)


def analizeaza_pagina(page: fitz.Page, reguli: Reguli, ocr: bool = True) -> RaportPagina:
    rp = RaportPagina(page.number + 1, este_scanata(page))
    texte = []
    tp = cuvinte_din_text(page)
    if len(tp.cuvinte) >= (MIN_CUVINTE_STRAT if rp.scanata else 1):
        texte.append(tp)
    # Pe scanuri rulăm și OCR-ul nostru, chiar dacă există strat OCR vechi: unul îl
    # poate prinde pe ce ratează celălalt.
    if rp.scanata or not texte:
        if ocr and tesseract_disponibil():
            texte.append(cuvinte_din_ocr(page))
        else:
            rp.atentionari.append("Pagină scanată fără OCR disponibil: doar verificare vizuală.")
    for t in texte:
        rp.surse.append(t.sursa)
        rp.zone += zone_de_acoperit(t, reguli)
        rp.semnaturi += zone_semnaturi(t)
    return rp


def _zone_manuale(cale: Path | None) -> dict[int, list[Zona]]:
    """Fișier JSON: [{"pagina": 1, "rect": [x0, y0, x1, y1], "motiv": "semnătură"}],
    coordonate în puncte PDF (1 punct = 1/72 inch, originea stânga-sus)."""
    if not cale:
        return {}
    rez: dict[int, list[Zona]] = {}
    for z in json.loads(Path(cale).read_text(encoding="utf-8")):
        rez.setdefault(int(z["pagina"]), []).append(
            Zona(fitz.Rect(z["rect"]), z.get("categorie", "manual"), z.get("motiv", "zonă manuală"),
                 "", "manual"))
    return rez


def _pagina_ca_imagine(page: fitz.Page, zone: list[Zona]) -> bytes:
    pix = page.get_pixmap(dpi=DPI_SCAN)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    k = DPI_SCAN / 72
    desen = ImageDraw.Draw(img)
    for z in zone:
        ox, oy = page.rect.x0, page.rect.y0
        r = z.rect
        desen.rectangle([(r.x0 - ox) * k, (r.y0 - oy) * k, (r.x1 - ox) * k, (r.y1 - oy) * k],
                        fill="black")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=CALITATE_JPEG, optimize=True)
    return buf.getvalue()


def hasureaza(intrare: Path, iesire: Path, reguli: Reguli, zone_manuale: Path | None = None,
              ocr: bool = True) -> list[RaportPagina]:
    src = fitz.open(intrare)
    manuale = _zone_manuale(zone_manuale)
    out = fitz.open()
    rapoarte = []
    for page in src:
        rp = analizeaza_pagina(page, reguli, ocr)
        rp.zone += manuale.get(rp.numar, [])
        rapoarte.append(rp)
        if rp.scanata:
            # Reconstruim pagina doar din imagine: dispare orice strat de text vechi.
            jpeg = _pagina_ca_imagine(page, rp.zone)
            noua = out.new_page(width=page.rect.width, height=page.rect.height)
            noua.insert_image(noua.rect, stream=jpeg)
        else:
            for z in rp.zone:
                page.add_redact_annot(z.rect, fill=(0, 0, 0))
            # Șterge textul de sub casete și pixelii imaginilor de sub ele.
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
            out.insert_pdf(src, from_page=page.number, to_page=page.number)
    out.set_metadata({})
    out.del_xml_metadata()
    iesire.parent.mkdir(parents=True, exist_ok=True)
    out.save(iesire, garbage=4, deflate=True, clean=True)
    return rapoarte


def verifica(cale: Path, reguli: Reguli, ocr: bool = True) -> list[str]:
    """Caută din nou date personale în fișierul final. Lista goală = curat."""
    probleme = []
    doc = fitz.open(cale)
    for k, v in (doc.metadata or {}).items():
        if v and k not in ("format", "encryption", "producer", "creator", "creationDate", "modDate"):
            probleme.append(f"Metadate: {k} = {v!r}")
    for page in doc:
        text = page.get_text()
        for g in detecteaza(text, reguli):
            probleme.append(f"p.{page.number + 1}: text extractabil [{g.categorie}] „{g.text}”")
        if ocr and este_scanata(page) and tesseract_disponibil():
            tp = cuvinte_din_ocr(page, dpi=DPI_SCAN)
            for g in detecteaza(tp.text, reguli):
                probleme.append(f"p.{page.number + 1}: vizibil la OCR [{g.categorie}] „{g.text}”")
    return probleme


def previzualizari(cale: Path, dir_iesire: Path, semnaturi: dict[int, list[fitz.Rect]] | None = None,
                   dpi: int = 100) -> list[Path]:
    """PNG-uri ale paginilor finale, pentru verificarea vizuală. Zonele unde probabil
    sunt semnături se încadrează cu roșu."""
    dir_iesire.mkdir(parents=True, exist_ok=True)
    fisiere = []
    doc = fitz.open(cale)
    k = dpi / 72
    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        desen = ImageDraw.Draw(img)
        for r in (semnaturi or {}).get(page.number + 1, []):
            desen.rectangle([r.x0 * k, r.y0 * k, r.x1 * k, r.y1 * k], outline="red", width=2)
        f = dir_iesire / f"pagina-{page.number + 1:02d}.png"
        img.save(f)
        fisiere.append(f)
    return fisiere


def mascheaza(text: str) -> str:
    """Raportul nu repetă datele: arată doar începutul fragmentului."""
    text = " ".join(text.split())
    return text[:2] + "…" + f" ({len(text)} caractere)" if len(text) > 2 else "…"


def raport_markdown(nume: str, rapoarte: list[RaportPagina], probleme: list[str],
                    previz: list[Path]) -> str:
    rand = [f"# Raport hasurare: {nume}", ""]
    total = sum(len(r.zone) for r in rapoarte)
    rand.append(f"Zone acoperite: **{total}** pe {len(rapoarte)} pagini.")
    rand.append("Verificare finală: " + ("**curat**, nimic extractabil." if not probleme
                                         else f"**{len(probleme)} probleme** (vezi mai jos)."))
    rand.append("")
    for r in rapoarte:
        tip = "scanată" if r.scanata else "text"
        rand.append(f"## Pagina {r.numar} ({tip}; surse: {', '.join(r.surse) or 'niciuna'})")
        for z in r.zone:
            x = z.rect
            rand.append(f"- [{z.categorie}] {z.motiv}: {mascheaza(z.text) if z.text else '—'} "
                        f"@ ({x.x0:.0f}, {x.y0:.0f}, {x.x1:.0f}, {x.y1:.0f}) [{z.sursa}]")
        if not r.zone:
            rand.append("- nimic detectat automat")
        if r.semnaturi:
            rand.append(f"- **De verificat vizual**: {len(r.semnaturi)} loc(uri) probabile de "
                        f"semnătură (încadrate cu roșu în previzualizare).")
        for a in r.atentionari:
            rand.append(f"- **Atenție**: {a}")
        rand.append("")
    if probleme:
        rand += ["## Probleme la verificarea finală", ""] + [f"- {p}" for p in probleme] + [""]
    if previz:
        rand += ["## Previzualizări", "", f"În `{previz[0].parent}` (100 dpi; puncte PDF = "
                 "pixeli × 0,72)."]
    rand += ["", "Semnăturile olografe NU se detectează automat. Privește fiecare pagină și "
             "adaugă zonele lipsă într-un fișier de zone manuale (vezi README)."]
    return "\n".join(rand) + "\n"
