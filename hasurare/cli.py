"""Linia de comandă: python -m hasurare <comandă> ...

  hasureaza  FISIER.pdf      hasurează, verifică, scrie raport și previzualizări
  verifica   FISIER.pdf      doar raportează ce ar trebui acoperit (nu modifică nimic)
  invata     ...             înregistrează o lecție (vezi `invata -h`)
  testeaza                   rulează toate cazurile învățate
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import cunostinte
from .proces import hasureaza, previzualizari, raport_markdown, verifica, analizeaza_pagina
from .vizual import foaie_de_verificare

RADACINA = cunostinte.RADACINA
IESIRI = RADACINA / "iesiri"


def _cmd_hasureaza(a: argparse.Namespace) -> int:
    intrare = Path(a.fisier)
    reguli = cunostinte.incarca_reguli()
    iesire = Path(a.iesire) if a.iesire else IESIRI / f"{intrare.stem}-hasurat.pdf"
    rapoarte = hasureaza(intrare, iesire, reguli, Path(a.zone) if a.zone else None, ocr=not a.fara_ocr)
    probleme = verifica(iesire, reguli, ocr=not a.fara_ocr)
    foaie = foaie_de_verificare(iesire, [d for r in rapoarte for d in r.de_verificat()],
                                iesire.parent / f"{iesire.stem}-de-verificat.png")
    previz = []
    if a.previzualizari:
        semnaturi = {r.numar: r.semnaturi for r in rapoarte}
        previz = previzualizari(iesire, iesire.parent / f"{iesire.stem}-previzualizare", semnaturi)
    raport = iesire.parent / f"{iesire.stem}-raport.md"
    raport.write_text(raport_markdown(intrare.name, rapoarte, probleme, previz, foaie), encoding="utf-8")
    print(f"Fișier hasurat: {iesire}")
    print(f"Raport:         {raport}")
    print(f"Zone acoperite: {sum(len(r.zone) for r in rapoarte)}")
    print(f"De privit:      {foaie or 'nimic (nicio semnătură sau pată de cerneală găsită)'}")
    if probleme:
        print("ATENȚIE, verificarea finală a găsit probleme:")
        for p in probleme:
            print("  -", p)
        return 2
    print("Verificare finală: curat. Urmează verificarea vizuală (semnături!).")
    return 0


def _cmd_verifica(a: argparse.Namespace) -> int:
    import pymupdf as fitz
    reguli = cunostinte.incarca_reguli()
    doc = fitz.open(a.fisier)
    total, decupaje, stricate, goale = 0, [], [], 0
    for page in doc:
        rp = analizeaza_pagina(page, reguli, ocr=not a.fara_ocr)
        decupaje += rp.de_verificat()
        goale += rp.semnaturi_goale
        if any("stricat" in at for at in rp.atentionari):
            stricate.append(rp.numar)
        if not (rp.zone or rp.semnaturi or rp.pete):
            continue  # pagina curată nu se mai afișează (economie)
        tip = "scanată" if rp.scanata else "text"
        print(f"Pagina {rp.numar} ({tip}): {len(rp.zone)} zone, {len(rp.semnaturi)} semnături "
              f"cu cerneală, {len(rp.pete)} pete de cerneală nerecunoscută")
        for z in rp.zone:
            print(f"  [{z.categorie}] {z.motiv}: „{' '.join(z.text.split())}”")
        total += len(rp.zone)
    if stricate:
        print(f"Text cu codificare stricată (citit cu OCR): paginile {stricate}")
    nume = Path(a.fisier).stem
    foaie = foaie_de_verificare(Path(a.fisier), decupaje, IESIRI / f"{nume}-de-verificat.png")
    print(f"Zone de semnătură verificate și găsite goale: {goale}")
    print(f"Pagini: {doc.page_count}. Date de acoperit: {total}. "
          f"De privit: {foaie or 'nimic'}" + (f" ({len(decupaje)} decupaje)" if foaie else ""))
    return 1 if total or foaie else 0


def _arata_rezultat_cazuri() -> int:
    total, esecuri = cunostinte.ruleaza_cazuri()
    print(f"Cazuri: {total - len(esecuri)}/{total} trec.")
    for caz, probleme in esecuri:
        print(f"\n✗ {caz.get('nota', '')}\n  context: {caz['context']}")
        for p in probleme:
            print("   ", p)
    return 1 if esecuri else 0


def _cmd_invata(a: argparse.Namespace) -> int:
    if a.tip in ("ratat", "exces"):
        de_hasurat = a.fragment if a.tip == "ratat" else []
        ramane = a.fragment if a.tip == "exces" else []
        caz = cunostinte.adauga_caz(a.context, de_hasurat, ramane, a.nota)
        cunostinte.noteaza(f"caz nou ({a.tip}): {a.nota}")
        print("Caz salvat (cifre fictive):", caz["context"])
        if getattr(a, "exceptie", False):
            for f in caz["ramane"]:
                cunostinte.adauga_in_lista("exceptii", f)
    elif a.tip == "declansator":
        cunostinte.adauga_in_lista("declansatori", a.valoare, a.categorie)
        cunostinte.noteaza(f"declanșator nou pentru {a.categorie}: `{a.valoare}` ({a.nota})")
    elif a.tip == "tipar":
        cunostinte.adauga_tipar(a.valoare, a.categorie, a.nota)
        cunostinte.noteaza(f"tipar nou pentru {a.categorie}: `{a.valoare}` ({a.nota})")
    elif a.tip == "exceptie":
        cunostinte.adauga_in_lista("exceptii", a.valoare)
        cunostinte.noteaza(f"excepție nouă (dată publică): {a.nota}")
    elif a.tip == "domeniu":
        cunostinte.adauga_in_lista("domenii_institutionale", a.valoare)
        cunostinte.noteaza(f"domeniu email instituțional: {a.valoare}")
    elif a.tip == "profesional":
        cunostinte.adauga_in_lista("context_profesional", a.valoare)
        cunostinte.noteaza(f"context profesional: `{a.valoare}` ({a.nota})")
    return _arata_rezultat_cazuri()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="hasurare", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="comanda", required=True)

    h = sub.add_parser("hasureaza", help="hasurează un PDF")
    h.add_argument("fisier")
    h.add_argument("-o", "--iesire", help="fișierul rezultat (implicit iesiri/<nume>-hasurat.pdf)")
    h.add_argument("--zone", help="JSON cu zone manuale (semnături etc.)")
    h.add_argument("--fara-ocr", action="store_true")
    h.add_argument("--previzualizari", action="store_true",
                   help="PNG pentru fiecare pagină (de obicei nu e nevoie: vezi foaia de verificare)")
    h.set_defaults(f=_cmd_hasureaza)

    v = sub.add_parser("verifica", help="raportează fără să modifice")
    v.add_argument("fisier")
    v.add_argument("--fara-ocr", action="store_true")
    v.set_defaults(f=_cmd_verifica)

    i = sub.add_parser("invata", help="înregistrează o lecție")
    isub = i.add_subparsers(dest="tip", required=True)
    for tip, ajutor in (("ratat", "un fragment care trebuia acoperit și n-a fost"),
                        ("exces", "un fragment acoperit care trebuia să rămână")):
        x = isub.add_parser(tip, help=ajutor)
        x.add_argument("--context", required=True, help="propoziția întreagă (date FICTIVE)")
        x.add_argument("--fragment", action="append", required=True)
        x.add_argument("--nota", required=True, help="ce s-a întâmplat, pe scurt")
        if tip == "exces":
            x.add_argument("--exceptie", action="store_true",
                           help="adaugă fragmentul și la excepții (doar date publice!)")
    for tip in ("declansator", "tipar"):
        x = isub.add_parser(tip)
        x.add_argument("--categorie", required=True)
        x.add_argument("valoare", help="fragment regex")
        x.add_argument("--nota", default="")
    for tip in ("exceptie", "domeniu", "profesional"):
        x = isub.add_parser(tip)
        x.add_argument("valoare")
        x.add_argument("--nota", default="")
    i.set_defaults(f=_cmd_invata)

    t = sub.add_parser("testeaza", help="rulează cazurile învățate")
    t.set_defaults(f=lambda a: _arata_rezultat_cazuri())

    a = p.parse_args(argv)
    return a.f(a)


if __name__ == "__main__":
    sys.exit(main())
