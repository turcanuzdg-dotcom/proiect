"""Detectarea datelor cu caracter personal într-un text.

Lucrează pe text simplu și întoarce intervale (start, end) din text. Maparea
intervalelor pe coordonatele din PDF se face în `pagina.py`.

Regulile de bază sunt aici, în cod. Ce s-a învățat din cazuri reale stă în
`cunostinte/reguli.json` (declanșatori suplimentari, tipare, excepții) și se
încarcă prin `cunostinte.py`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Diacritice cu sedilă -> cu virgulă. Aceeași lungime, deci pozițiile rămân valabile.
_NORMALIZARE = str.maketrans("şţŞŢ", "șțȘȚ")

DATA = r"\d{1,2}\s?[./-]\s?\d{1,2}\s?[./-]\s?\d{2,4}"

# Declanșatori de bază, ca fragmente regex. Cei învățați se adaugă din reguli.json.
DECLANSATORI = {
    "idnp": [
        r"IDNP",
        r"c\s?/\s?p",
        r"c\.\s?p\.",
        r"cod(?:ul)?\s+personal",
        r"cod(?:ul)?\s+de\s+identificare\s+personal[ăa]?",
        r"num[ăa]r(?:ul)?\s+de\s+identificare\s+personal",
        r"CNP",
    ],
    "data_nasterii": [
        r"a\.\s?n\.",
        r"anul\s+na[șs]terii",
        r"data\s+na[șs]terii",
        r"n[ăa]scut[ăa]?",
        r"d\.\s?n\.",
    ],
    "domiciliu": [
        r"domiciliat[ăa]?",
        r"cu\s+domiciliul",
        r"domiciliul",
        r"domiciliu",
        r"locuitor(?:oare)?(?:\s+a[l]?)?",
        r"cu\s+re[șs]edin[țt]a",
        r"re[șs]edin[țt]a",
        r"adresa\s+de\s+domiciliu",
        r"cu\s+adresa",
    ],
    "act_identitate": [
        r"buletin(?:ul)?(?:\s+de\s+identitate)?",
        r"b\.\s?i\.",
        r"pa[șs]aport(?:ul)?",
        r"act(?:ul)?\s+de\s+identitate",
        r"carte(?:a)?\s+de\s+identitate",
    ],
}

# Cuvinte care, aflate înaintea unui număr de 13 cifre, arată că e o firmă (IDNO).
CONTEXT_FIRMA = r"IDNO|cod(?:ul)?\s+fiscal|S\.?R\.?L|S\.?A\.|[ÎI]\.?\s?I\.|[ÎI]ntreprinderea"

# Cuvinte care arată că o adresă e a terenului/obiectului, nu domiciliul unei persoane.
CONTEXT_TEREN = r"teren|amplasat|situat|lot(?:ul)?|obiect|imobil|construc[țt]|parcel|cadastral"

# Unde se oprește o adresă de domiciliu.
_STOP_ADRESA = re.compile(
    r";|\n\n|\)|\b(?:IDNP|c\s?/\s?p|cod\s+personal|a\.\s?n\.|n[ăa]scut|posesor|identificat|"
    r"[îi]n\s+calitate|solicit|privind|prin\s+care|care|tel\.?|telefon|e-?mail|"
    r"cu\s+privire|referitor|[îi]n\s+temeiul|conform|buletin|pa[șs]aport|seria|ce\s+)\b",
    re.IGNORECASE,
)
_ABREVIERI = {"str", "nr", "ap", "bd", "bl", "et", "s", "or", "com", "mun", "r", "r-l", "r-nul",
              "sat", "sc", "of", "sect", "cart", "d", "dl", "dna", "dnei", "dlui", "cet", "jud",
              "loc", "șos", "sos", "pr", "prosp", "c", "fl", "f"}

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_TELEFON = re.compile(r"(?<![\w])(?:\+\s?373|00\s?373|0)[\d\s\-()]{6,14}\d")
_IDNP_SIMPLU = re.compile(r"(?<!\d)\d{13}(?!\d)")
_ACT_MD = re.compile(r"(?<![\w])[ABC]\s?\d{8}(?!\d)")
_SERIA = re.compile(
    r"\bseria\s*:?\s*(?P<v>[A-Z]{1,3}\s*(?:nr\.?|№|n\.)?\s*\d{5,9})", re.IGNORECASE)
_ELIBERAT = re.compile(
    r"\beliberat[ăa]?\s+(?:de\s+[^;\n]{1,60}?\s+)?(?:la|din|pe|[îi]n)\s+(?:data\s+(?:de\s+)?)?"
    r"(?P<v>" + DATA + r")", re.IGNORECASE)


@dataclass
class Gasire:
    start: int
    end: int
    categorie: str
    motiv: str
    text: str = ""


@dataclass
class Reguli:
    """Reguli efective = baza din cod + ce s-a învățat (vezi cunostinte.py)."""
    declansatori: dict = field(default_factory=dict)       # categorie -> [regex]
    tipare: list = field(default_factory=list)             # [{"regex","categorie","motiv"}]
    exceptii: list = field(default_factory=list)           # texte publice care nu se acoperă
    domenii_institutionale: list = field(default_factory=list)
    context_profesional: list = field(default_factory=list)

    def toti_declansatorii(self, categorie: str) -> list[str]:
        return DECLANSATORI.get(categorie, []) + list(self.declansatori.get(categorie, []))


def normalizeaza(text: str) -> str:
    return text.translate(_NORMALIZARE)


def _alt(fragmente: list[str]) -> str:
    return "(?:" + "|".join(fragmente) + ")"


def _cheie(text: str) -> str:
    return re.sub(r"[\s\-().]", "", text).casefold()


def _context_profesional(text: str, start: int, end: int, reguli: Reguli) -> bool:
    if not reguli.context_profesional:
        return False
    fereastra = text[max(0, start - 60):end + 60]
    return re.search(_alt(reguli.context_profesional), fereastra, re.IGNORECASE) is not None


def _idnp(text: str, reguli: Reguli) -> list[Gasire]:
    rez = []
    for m in _IDNP_SIMPLU.finditer(text):
        inainte = text[max(0, m.start() - 30):m.start()]
        if re.search(CONTEXT_FIRMA, inainte, re.IGNORECASE):
            continue
        rez.append(Gasire(m.start(), m.end(), "idnp", "13 cifre consecutive"))
    # Cu prefix: prinde și variantele cu spații sau cu erori de OCR (O în loc de 0 etc.).
    tipar = re.compile(r"(?<![\w])" + _alt(reguli.toti_declansatorii("idnp")) +
                       r"\s*[:.\-–]?\s*(?P<v>[\dOoIl|][\dOoIl| ]{8,18}[\dOoIl|])", re.IGNORECASE)
    for m in tipar.finditer(text):
        if sum(c.isdigit() for c in m.group("v")) >= 8:
            rez.append(Gasire(m.start("v"), m.end("v"), "idnp", "cod personal după prefix"))
    return rez


def _data_nasterii(text: str, reguli: Reguli) -> list[Gasire]:
    tipar = re.compile(r"(?<![\w])" + _alt(reguli.toti_declansatorii("data_nasterii")) +
                       r"\s*[:,]?\s*(?:(?:la|pe|din|[îi]n)\s+)?(?:data\s+(?:de\s+)?)?(?:anul\s+)?"
                       r"(?P<v>" + DATA + r"|(?:19|20)\d{2}(?!\d))", re.IGNORECASE)
    return [Gasire(m.start("v"), m.end("v"), "data_nasterii", "dată lângă „a.n.”/„născut”")
            for m in tipar.finditer(text)]


def _sfarsit_adresa(text: str, start: int) -> int:
    limita = min(len(text), start + 140)
    bucata = text[start:limita]
    capat = len(bucata)
    m = _STOP_ADRESA.search(bucata)
    if m:
        capat = m.start()
    # Sfârșit de propoziție: punct + spațiu + majusculă, dacă nu e după o abreviere.
    for p in re.finditer(r"\.\s+(?=[A-ZĂÂÎȘȚ])", bucata[:capat]):
        cuvant = re.findall(r"[\w-]+$", bucata[:p.start()])
        if not cuvant or cuvant[0].casefold() not in _ABREVIERI:
            capat = p.start() + 1
            break
    sf = start + capat
    while sf > start and text[sf - 1] in " ,\n\t":
        sf -= 1
    return sf


def _domiciliu(text: str, reguli: Reguli) -> list[Gasire]:
    rez = []
    tipar = re.compile(r"(?<![\w])" + _alt(reguli.toti_declansatorii("domiciliu")) +
                       r"(?![\w])\s*[:,]?\s*(?:(?:[îi]n|la|pe|din)\s+)?", re.IGNORECASE)
    for m in tipar.finditer(text):
        inainte = text[max(0, m.start() - 30):m.start()]
        if re.search(CONTEXT_TEREN, inainte, re.IGNORECASE):
            continue
        sf = _sfarsit_adresa(text, m.end())
        valoare = text[m.end():sf]
        if len(valoare.strip()) >= 3 and re.search(r"\w", valoare):
            rez.append(Gasire(m.end(), sf, "domiciliu", "adresă după „domiciliat”"))
    return rez


def _act_identitate(text: str, reguli: Reguli) -> list[Gasire]:
    rez = []
    for m in _SERIA.finditer(text):
        rez.append(Gasire(m.start("v"), m.end("v"), "act_identitate", "serie și număr act"))
    tipar = re.compile(r"(?<![\w])" + _alt(reguli.toti_declansatorii("act_identitate")) +
                       r"\b[^;\n]{0,25}?(?:nr\.?|№|seria)\s*:?\s*(?P<v>[A-Z]{0,3}\s*(?:nr\.?\s*)?\d{5,9})",
                       re.IGNORECASE)
    for m in tipar.finditer(text):
        rez.append(Gasire(m.start("v"), m.end("v"), "act_identitate", "număr buletin/pașaport"))
    for m in _ACT_MD.finditer(text):
        rez.append(Gasire(m.start(), m.end(), "act_identitate", "număr act MD (literă + 8 cifre)"))
    for m in _ELIBERAT.finditer(text):
        rez.append(Gasire(m.start("v"), m.end("v"), "act_identitate", "data eliberării actului"))
    return rez


def _telefon(text: str, reguli: Reguli) -> list[Gasire]:
    rez = []
    for m in _TELEFON.finditer(text):
        cifre = re.sub(r"\D", "", m.group())
        if cifre.startswith("00373"):
            cifre = cifre[2:]
        valid = (cifre.startswith("373") and len(cifre) == 11) or \
                (cifre.startswith("0") and len(cifre) == 9)
        if not valid or _context_profesional(text, m.start(), m.end(), reguli):
            continue
        rez.append(Gasire(m.start(), m.end(), "telefon", "număr de telefon"))
    return rez


def _email(text: str, reguli: Reguli) -> list[Gasire]:
    rez = []
    domenii = [d.casefold() for d in reguli.domenii_institutionale]
    for m in _EMAIL.finditer(text):
        domeniu = m.group().split("@", 1)[1].casefold()
        if any(domeniu == d or domeniu.endswith("." + d) for d in domenii):
            continue
        if _context_profesional(text, m.start(), m.end(), reguli):
            continue
        rez.append(Gasire(m.start(), m.end(), "email", "adresă de email"))
    return rez


def _tipare_invatate(text: str, reguli: Reguli) -> list[Gasire]:
    rez = []
    for t in reguli.tipare:
        for m in re.finditer(t["regex"], text, re.IGNORECASE):
            grup = "v" if "v" in m.re.groupindex else 0
            if m.end(grup) > m.start(grup):
                rez.append(Gasire(m.start(grup), m.end(grup), t.get("categorie", "invatat"),
                                  t.get("motiv", "tipar învățat")))
    return rez


DETECTORI = [_idnp, _data_nasterii, _domiciliu, _act_identitate, _telefon, _email, _tipare_invatate]


def detecteaza(text: str, reguli: Reguli | None = None) -> list[Gasire]:
    """Întoarce zonele de acoperit, sortate și fără suprapuneri."""
    reguli = reguli or Reguli()
    norm = normalizeaza(text)
    gasiri = [g for detector in DETECTORI for g in detector(norm, reguli)]

    exceptii = {_cheie(e) for e in reguli.exceptii}
    gasiri = [g for g in gasiri if _cheie(norm[g.start:g.end]) not in exceptii]

    gasiri.sort(key=lambda g: (g.start, -g.end))
    unite: list[Gasire] = []
    for g in gasiri:
        if unite and g.start <= unite[-1].end:
            ultim = unite[-1]
            if g.end > ultim.end:
                ultim.end = g.end
            continue
        unite.append(g)
    for g in unite:
        g.text = text[g.start:g.end]
    return unite


def semnaturi_probabile(text: str) -> list[tuple[int, int]]:
    """Locuri unde probabil e o semnătură olografă. Nu se acoperă automat:
    semnăturile se confirmă doar vizual (vezi CLAUDE.md)."""
    tipar = re.compile(r"semn[ăa]tur|\bL\.?\s?[ȘS]\.|(?:^|\n)\s*(?:Primar(?:ul)?|Secretar(?:ul|a)?|"
                       r"Pre[șs]edinte(?:le)?|Consilier|Solicitant|Beneficiar)\b", re.IGNORECASE)
    return [(m.start(), m.end()) for m in tipar.finditer(normalizeaza(text))]
