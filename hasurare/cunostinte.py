"""Memoria proiectului: ce s-a învățat din documentele reale.

- `cunostinte/reguli.json`  declanșatori, tipare și excepții învățate
- `cunostinte/cazuri.jsonl` fiecare greșeală găsită devine un caz de test (date fictive)
- `cunostinte/jurnal.md`    istoricul lecțiilor, în cuvinte

Datele reale nu se salvează niciodată aici: cifrele din cazuri se înlocuiesc
automat cu cifre fictive, iar numele și străzile trebuie inventate.
"""

from __future__ import annotations

import datetime as dt
import json
import random
import re
from pathlib import Path

from .detectie import Reguli, detecteaza, normalizeaza

RADACINA = Path(__file__).resolve().parent.parent
DIR = RADACINA / "cunostinte"
REGULI = DIR / "reguli.json"
CAZURI = DIR / "cazuri.jsonl"
JURNAL = DIR / "jurnal.md"


def incarca_reguli(cale: Path = REGULI) -> Reguli:
    if not cale.exists():
        return Reguli()
    date = json.loads(cale.read_text(encoding="utf-8"))
    return Reguli(
        declansatori=date.get("declansatori", {}),
        tipare=date.get("tipare", []),
        exceptii=date.get("exceptii", []),
        domenii_institutionale=date.get("domenii_institutionale", []),
        context_profesional=date.get("context_profesional", []),
    )


def _citeste_json(cale: Path = REGULI) -> dict:
    return json.loads(cale.read_text(encoding="utf-8")) if cale.exists() else {}


def _scrie_json(date: dict, cale: Path = REGULI) -> None:
    cale.write_text(json.dumps(date, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def noteaza(lectie: str) -> None:
    azi = dt.date.today().isoformat()
    with JURNAL.open("a", encoding="utf-8") as f:
        f.write(f"- {azi}: {lectie}\n")


def _inlocuieste_sir(sir: str) -> str:
    """Cifre noi, la întâmplare, păstrând ce contează pentru formă: 0 de la început
    (telefoane, zile, luni), prefixul 373 și secolul anilor (19.., 20..)."""
    if sir == "373":
        return sir
    pastrate = 2 if len(sir) == 4 and sir[:2] in ("19", "20") else (1 if sir[0] == "0" else 0)
    return sir[:pastrate] + "".join(random.choice("123456789") if i == 0 and pastrate == 0
                                    else random.choice("0123456789")
                                    for i in range(len(sir) - pastrate))


def fictionalizeaza(*texte: str) -> list[str]:
    """Înlocuiește fiecare șir de cifre cu altul fictiv, la fel în toate textele,
    ca fragmentul să se regăsească în context și formatul să rămână același."""
    harta: dict[str, str] = {}

    def inlocuieste(m: re.Match) -> str:
        return harta.setdefault(m.group(), _inlocuieste_sir(m.group()))

    return [re.sub(r"\d+", inlocuieste, t) for t in texte]


def adauga_caz(context: str, de_hasurat: list[str], ramane: list[str], nota: str,
               public: bool = False) -> dict:
    """`public`: fragmentul e o dată publică fixă (excepție), deci cifrele rămân reale,
    altfel excepția învățată n-ar mai corespunde documentelor."""
    texte = [context, *de_hasurat, *ramane]
    toate = texte if public else fictionalizeaza(*texte)
    caz = {
        "context": toate[0],
        "de_hasurat": toate[1:1 + len(de_hasurat)],
        "ramane": toate[1 + len(de_hasurat):],
        "nota": nota,
        "data": dt.date.today().isoformat(),
    }
    for fragment in caz["de_hasurat"] + caz["ramane"]:
        if fragment not in caz["context"]:
            raise ValueError(f"Fragmentul „{fragment}” nu apare în context.")
    with CAZURI.open("a", encoding="utf-8") as f:
        f.write(json.dumps(caz, ensure_ascii=False) + "\n")
    return caz


def incarca_cazuri(cale: Path = CAZURI) -> list[dict]:
    if not cale.exists():
        return []
    return [json.loads(r) for r in cale.read_text(encoding="utf-8").splitlines() if r.strip()]


def adauga_in_lista(cheie: str, valoare: str, categorie: str | None = None) -> None:
    date = _citeste_json()
    if categorie:
        lista = date.setdefault(cheie, {}).setdefault(categorie, [])
    else:
        lista = date.setdefault(cheie, [])
    if valoare not in lista:
        lista.append(valoare)
    _scrie_json(date)


def adauga_tipar(regex: str, categorie: str, motiv: str) -> None:
    re.compile(regex)  # aruncă eroare dacă tiparul e greșit
    date = _citeste_json()
    date.setdefault("tipare", []).append({"regex": regex, "categorie": categorie, "motiv": motiv})
    _scrie_json(date)


def verifica_caz(caz: dict, reguli: Reguli) -> list[str]:
    """Întoarce problemele (gol = cazul trece)."""
    text = caz["context"]
    gasiri = detecteaza(text, reguli)
    acoperit = [False] * len(text)
    for g in gasiri:
        for i in range(g.start, g.end):
            acoperit[i] = True
    probleme = []
    for fragment in caz.get("de_hasurat", []):
        for m in re.finditer(re.escape(fragment), text):
            neacoperit = [text[i] for i in range(m.start(), m.end())
                          if not acoperit[i] and text[i].isalnum()]
            if neacoperit:
                probleme.append(f"RATAT: „{fragment}” (rămâne vizibil: „{''.join(neacoperit)}”)")
    for fragment in caz.get("ramane", []):
        for m in re.finditer(re.escape(fragment), text):
            if any(acoperit[i] for i in range(m.start(), m.end())):
                probleme.append(f"EXCES: „{fragment}” a fost acoperit, dar trebuie să rămână")
    return probleme


def ruleaza_cazuri() -> tuple[int, list[tuple[dict, list[str]]]]:
    reguli = incarca_reguli()
    cazuri = incarca_cazuri()
    esecuri = [(c, p) for c in cazuri if (p := verifica_caz(c, reguli))]
    return len(cazuri), esecuri


__all__ = ["incarca_reguli", "adauga_caz", "incarca_cazuri", "adauga_in_lista", "adauga_tipar",
           "verifica_caz", "ruleaza_cazuri", "noteaza", "fictionalizeaza", "normalizeaza"]
