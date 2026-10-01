"""Verificare vizuală economică.

În loc să fie privite pagini întregi, algoritmul caută cerneală acolo unde poate fi
o semnătură sau o ștampilă și pune pe o singură foaie doar bucățile care contează:
  - zonele de semnătură (lângă „Semnătura”, „Primar”, „Secretar”...) care NU sunt goale;
  - pe paginile de tip document scanat, petele de cerneală care nu sunt text recunoscut;
  - marginile fiecărei casete negre, ca să se vadă că nu rămâne nimic la vedere.
Dacă nu e nimic de privit, foaia nu se creează deloc.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pymupdf as fitz
from PIL import Image, ImageDraw

PRAG_INTUNECAT = 140      # nivel de gri sub care un pixel e „cerneală”
PRAG_LINIE = 0.4          # rând/coloană mai plin de atât = linie de tabel, nu scris
PRAG_CERNEALA = 0.004     # fracțiune minimă de cerneală într-o zonă de semnătură
PRAG_HARTIE_ALBA = 0.6    # pagină „document”: cel puțin atâta hârtie albă
PRAG_COLOR = 0.02         # ...și aproape fără culoare (planșele și hărțile sunt colorate)
CELULA = 36               # puncte; grila pentru petele de cerneală
PRAG_CELULA = 0.03


@dataclass
class Decupaj:
    pagina: int
    rect: fitz.Rect
    eticheta: str


def _gri(page: fitz.Page, clip: fitz.Rect | None, dpi: int) -> np.ndarray:
    pix = page.get_pixmap(dpi=dpi, clip=clip, colorspace=fitz.csGRAY)
    a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)
    return a[:, :pix.width]


def _cerneala(page: fitz.Page, rect: fitz.Rect, cuvinte: list[fitz.Rect], dpi: int = 72) -> np.ndarray:
    """Masca de cerneală din `rect`, fără textul recunoscut și fără liniile de tabel."""
    rect = rect & page.rect
    if rect.is_empty:
        return np.zeros((0, 0), dtype=bool)
    m = _gri(page, rect, dpi) < PRAG_INTUNECAT
    k = dpi / 72
    for c in cuvinte:
        r = (c + (-1.5, -1.5, 1.5, 1.5)) & rect
        if not r.is_empty:
            m[int((r.y0 - rect.y0) * k):int((r.y1 - rect.y0) * k) + 1,
              int((r.x0 - rect.x0) * k):int((r.x1 - rect.x0) * k) + 1] = False
    if m.size:
        m[m.mean(axis=1) > PRAG_LINIE, :] = False
        m[:, m.mean(axis=0) > PRAG_LINIE] = False
    return m


def este_document(page: fitz.Page) -> bool:
    """Hârtie scrisă (merită căutate pete de cerneală), nu hartă, planșă sau fotografie.
    Nu depinde de câte cuvinte a citit OCR-ul: ultima pagină a unei decizii poate avea
    doar semnăturile, iar OCR-ul poate rata tocmai rândul semnat."""
    if float((_gri(page, None, 20) > 200).mean()) <= PRAG_HARTIE_ALBA:
        return False
    pix = page.get_pixmap(dpi=20)
    hsv = np.asarray(Image.frombytes("RGB", (pix.width, pix.height), pix.samples).convert("HSV"))
    colorat = float(((hsv[..., 1] > 60) & (hsv[..., 2] > 50)).mean())
    return colorat < PRAG_COLOR


def semnaturi_cu_cerneala(page: fitz.Page, zone: list[fitz.Rect], cuvinte: list[fitz.Rect]) -> list[fitz.Rect]:
    """Dintre zonele probabile de semnătură, doar cele care chiar conțin cerneală."""
    return [z for z in zone if (m := _cerneala(page, z, cuvinte)).size and m.mean() > PRAG_CERNEALA]


def pete_necunoscute(page: fitz.Page, cuvinte: list[fitz.Rect]) -> list[fitz.Rect]:
    """Pe documente scanate: grupuri de cerneală care nu sunt text recunoscut
    (semnături, ștampile, scris de mână). Pe hărți și fotografii nu se caută."""
    if not este_document(page):
        return []
    dpi = 36
    m = _cerneala(page, page.rect, cuvinte, dpi)
    pas = int(CELULA * dpi / 72)
    rows, cols = m.shape[0] // pas, m.shape[1] // pas
    grila = m[:rows * pas, :cols * pas].reshape(rows, pas, cols, pas).mean(axis=(1, 3)) > PRAG_CELULA
    vazut = np.zeros_like(grila)
    rez = []
    for i in range(rows):
        for j in range(cols):
            if not grila[i, j] or vazut[i, j]:
                continue
            stiva, celule = [(i, j)], []
            vazut[i, j] = True
            while stiva:
                a, b = stiva.pop()
                celule.append((a, b))
                for da in (-1, 0, 1):
                    for db in (-1, 0, 1):
                        x, y = a + da, b + db
                        if 0 <= x < rows and 0 <= y < cols and grila[x, y] and not vazut[x, y]:
                            vazut[x, y] = True
                            stiva.append((x, y))
            ii = [c[0] for c in celule]
            jj = [c[1] for c in celule]
            ox, oy = page.rect.x0, page.rect.y0
            rez.append(fitz.Rect(ox + min(jj) * CELULA, oy + min(ii) * CELULA,
                                 ox + (max(jj) + 1) * CELULA, oy + (max(ii) + 1) * CELULA))
    return rez


def foaie_de_verificare(cale_pdf: Path, decupaje: list[Decupaj], iesire: Path,
                        dpi: int = 90, latime: int = 1500) -> Path | None:
    """Pune decupajele unul sub altul (pe coloane) într-un singur PNG."""
    if not decupaje:
        return None
    doc = fitz.open(cale_pdf)
    imagini = []
    for d in decupaje:
        page = doc[d.pagina - 1]
        r = (d.rect + (-10, -10, 10, 10)) & page.rect
        pix = page.get_pixmap(dpi=dpi, clip=r)
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        if im.width > latime:
            im = im.resize((latime, int(im.height * latime / im.width)))
        cadru = Image.new("RGB", (im.width + 4, im.height + 18), "white")
        cadru.paste(im, (2, 16))
        ImageDraw.Draw(cadru).text((2, 2), f"p.{d.pagina}: {d.eticheta}", fill="red")
        imagini.append(cadru)
    # Așezare pe rânduri, cât încap pe lățime.
    randuri, rand, w = [], [], 0
    for im in imagini:
        if rand and w + im.width > latime:
            randuri.append(rand)
            rand, w = [], 0
        rand.append(im)
        w += im.width
    randuri.append(rand)
    inaltime = sum(max(i.height for i in r) for r in randuri)
    foaie = Image.new("RGB", (latime, inaltime), "white")
    y = 0
    for r in randuri:
        x = 0
        for im in r:
            foaie.paste(im, (x, y))
            x += im.width
        y += max(i.height for i in r)
    iesire.parent.mkdir(parents=True, exist_ok=True)
    foaie.save(iesire)
    return iesire
