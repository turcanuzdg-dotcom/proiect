"""Fiecare lecție din cunostinte/cazuri.jsonl e un test. Dacă unul pică,
regulile trebuie generalizate (vezi CLAUDE.md), nu cazul șters."""

import pytest

from hasurare import cunostinte

REGULI = cunostinte.incarca_reguli()
CAZURI = cunostinte.incarca_cazuri()


@pytest.mark.parametrize("caz", CAZURI, ids=[c["nota"][:50] for c in CAZURI])
def test_caz(caz):
    assert cunostinte.verifica_caz(caz, REGULI) == []


def test_fictionalizare_pastreaza_forma():
    ctx, frag = cunostinte.fictionalizeaza("tel. 069123456, a.n. 09.06.1964", "069123456")
    assert frag in ctx and frag.startswith("0") and len(frag) == 9
    assert "069123456" not in ctx or frag == "069123456"
    assert ".19" in ctx
