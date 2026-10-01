import pymupdf as fitz
import pytest

from hasurare import cunostinte
from hasurare.pagina import tesseract_disponibil
from hasurare.proces import hasureaza, verifica

REGULI = cunostinte.incarca_reguli()
RANDURI = [
    "DISPOZITIA nr. 45 din 12.09.2025",
    "Se elibereaza certificatul cet. Bivol Ion, a.n. 09.06.1964,",
    "c/p 0912345678901, domiciliat in s. Bacioi, str. Pacii 12;",
    "tel. 069123456. Terenul cu nr. cadastral 5501101.123.",
]
SECRETE = ["09.06.1964", "0912345678901", "Pacii 12", "069123456"]
PUBLICE = ["Bivol Ion", "5501101.123", "DISPOZITIA"]


def _pdf_text(cale):
    doc = fitz.open()
    page = doc.new_page()
    for i, r in enumerate(RANDURI):
        page.insert_text((60, 80 + 22 * i), r, fontsize=12)
    doc.set_metadata({"author": "Bivol Ion", "title": "Cerere 0912345678901"})
    doc.save(cale)


def _pdf_scanat(cale):
    _pdf_text(cale.with_suffix(".tmp.pdf"))
    pix = fitz.open(cale.with_suffix(".tmp.pdf"))[0].get_pixmap(dpi=200)
    doc = fitz.open()
    page = doc.new_page()
    page.insert_image(page.rect, pixmap=pix)
    doc.save(cale)


def test_pdf_cu_text(tmp_path):
    intrare, iesire = tmp_path / "a.pdf", tmp_path / "a-hasurat.pdf"
    _pdf_text(intrare)
    hasureaza(intrare, iesire, REGULI, ocr=False)
    text = fitz.open(iesire)[0].get_text()
    for s in SECRETE:
        assert s not in text
    for p in PUBLICE:
        assert p in text
    assert verifica(iesire, REGULI, ocr=False) == []


@pytest.mark.skipif(not tesseract_disponibil(), reason="tesseract lipsește")
def test_pdf_scanat(tmp_path):
    intrare, iesire = tmp_path / "s.pdf", tmp_path / "s-hasurat.pdf"
    _pdf_scanat(intrare)
    rapoarte = hasureaza(intrare, iesire, REGULI)
    assert rapoarte[0].scanata
    categorii = {z.categorie for z in rapoarte[0].zone}
    assert {"idnp", "data_nasterii", "domiciliu", "telefon"} <= categorii
    doc = fitz.open(iesire)
    assert doc[0].get_text().strip() == ""  # pagina e doar imagine
    assert verifica(iesire, REGULI) == []
