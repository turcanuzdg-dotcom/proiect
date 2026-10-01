"""Cuvinte cu coordonate pe o pagină PDF (din stratul de text sau din OCR) și
maparea zonelor găsite în text înapoi pe dreptunghiuri din pagină."""

from __future__ import annotations

from dataclasses import dataclass

import pymupdf as fitz

from .detectie import Gasire, Reguli, detecteaza, semnaturi_probabile

DPI_OCR = 300


@dataclass
class Cuvant:
    rect: fitz.Rect
    text: str
    linie: tuple  # cheie de grupare pe rânduri
    bloc: int


@dataclass
class TextPagina:
    text: str
    cuvinte: list[Cuvant]
    pozitii: list[tuple[int, int]]  # (start, end) în text pentru fiecare cuvânt
    sursa: str


def construieste(cuvinte: list[Cuvant], sursa: str) -> TextPagina:
    """Lipește cuvintele într-un text: spațiu între cuvinte, „\\n” între rânduri,
    „\\n\\n” între blocuri. Ține minte unde e fiecare cuvânt."""
    parti, pozitii, poz = [], [], 0
    linie_ant, bloc_ant = None, None
    for c in cuvinte:
        if linie_ant is not None:
            sep = " " if c.linie == linie_ant else ("\n" if c.bloc == bloc_ant else "\n\n")
            parti.append(sep)
            poz += len(sep)
        parti.append(c.text)
        pozitii.append((poz, poz + len(c.text)))
        poz += len(c.text)
        linie_ant, bloc_ant = c.linie, c.bloc
    return TextPagina("".join(parti), cuvinte, pozitii, sursa)


def cuvinte_din_text(page: fitz.Page) -> TextPagina:
    cuvinte = [Cuvant(fitz.Rect(w[:4]), w[4], (w[5], w[6]), w[5])
               for w in page.get_text("words", sort=True)]
    return construieste(cuvinte, "strat de text")


def tesseract_disponibil() -> bool:
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _limbi_ocr() -> str:
    import pytesseract
    disponibile = set(pytesseract.get_languages(config=""))
    alese = [l for l in ("ron", "rus", "eng") if l in disponibile]
    return "+".join(alese) or "eng"


def cuvinte_din_ocr(page: fitz.Page, dpi: int = DPI_OCR) -> TextPagina:
    import pytesseract
    from PIL import Image

    pix = page.get_pixmap(dpi=dpi)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    d = pytesseract.image_to_data(img, lang=_limbi_ocr(), output_type=pytesseract.Output.DICT)
    k = 72 / dpi
    cuvinte = []
    for i, txt in enumerate(d["text"]):
        if not txt.strip() or float(d["conf"][i]) < 0:
            continue
        x, y, w, h = d["left"][i], d["top"][i], d["width"][i], d["height"][i]
        ox, oy = page.rect.x0, page.rect.y0
        rect = fitz.Rect(ox + x * k, oy + y * k, ox + (x + w) * k, oy + (y + h) * k)
        cuvinte.append(Cuvant(rect, txt.strip(),
                              (d["block_num"][i], d["par_num"][i], d["line_num"][i]),
                              d["block_num"][i]))
    return construieste(cuvinte, "OCR")


def dreptunghiuri(tp: TextPagina, start: int, end: int, margine: float = 2.0) -> list[fitz.Rect]:
    """Dreptunghiurile care acoperă intervalul [start, end), câte unul pe rând.
    Dacă intervalul prinde doar o parte dintr-un cuvânt, acoperă proporțional acea parte,
    plus încă un caracter pe partea tăiată: lățimea literelor variază, iar un caracter de
    punctuație acoperit în plus e mai bine decât o cifră rămasă la vedere."""
    pe_linii: dict[tuple, fitz.Rect] = {}
    for c, (s, e) in zip(tp.cuvinte, tp.pozitii):
        if e <= start or s >= end:
            continue
        r = fitz.Rect(c.rect)
        lung = max(1, e - s)
        car = c.rect.width / lung
        if start > s:
            r.x0 = max(c.rect.x0, c.rect.x0 + car * (start - s) - car)
        if end < e:
            r.x1 = min(c.rect.x1, c.rect.x0 + car * (end - s) + car)
        cheie = c.linie
        pe_linii[cheie] = pe_linii[cheie] | r if cheie in pe_linii else r
    return [fitz.Rect(r.x0 - margine, r.y0 - margine, r.x1 + margine, r.y1 + margine)
            for r in pe_linii.values()]


@dataclass
class Zona:
    rect: fitz.Rect
    categorie: str
    motiv: str
    text: str
    sursa: str


def zone_de_acoperit(tp: TextPagina, reguli: Reguli) -> list[Zona]:
    zone = []
    for g in detecteaza(tp.text, reguli):
        for r in dreptunghiuri(tp, g.start, g.end):
            zone.append(Zona(r, g.categorie, g.motiv, g.text, tp.sursa))
    return zone


def zone_semnaturi(tp: TextPagina) -> list[fitz.Rect]:
    """Rândurile unde probabil se semnează, extinse spre dreapta/jos: de privit vizual."""
    zone = []
    for s, e in semnaturi_probabile(tp.text):
        for r in dreptunghiuri(tp, s, e, margine=0):
            zone.append(fitz.Rect(r.x0, r.y0 - 25, r.x1 + 250, r.y1 + 35))
    return zone


def este_scanata(page: fitz.Page) -> bool:
    """Pagina e o imagine (scan) dacă imaginile acoperă mare parte din ea."""
    suprafata = abs(page.rect) or 1
    acoperit = sum(abs(fitz.Rect(i["bbox"]) & page.rect) for i in page.get_image_info())
    return acoperit / suprafata > 0.6


__all__ = ["Gasire", "TextPagina", "Zona", "cuvinte_din_text", "cuvinte_din_ocr", "dreptunghiuri",
           "zone_de_acoperit", "zone_semnaturi", "este_scanata", "tesseract_disponibil"]
