"""Banc de test pentru răsfoire: înlocuiește film.rasfoire cu varianta dintr-un modul
și randează trecerea 06 -> 08 din out/film-nisporeni-flow.json.

    python produs/test_pagina.py <modul.py> foaie <ieșire.jpg> [--previzualizare]
    python produs/test_pagina.py <modul.py> clip  <ieșire.mp4> [--previzualizare]

Modulul trebuie să definească rasfoire(rand, a, b, u, tz) -> np.ndarray (float32 BGR 0..1),
cu aceeași semnătură ca film.rasfoire. tz["_du"] = cât avansează u într-un cadru.
Rulează din video/: cd /home/user/proiect/video && PYTHONPATH=<pylib> python3 produs/test_pagina.py ...
"""

import importlib.util
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import film  # noqa: E402

modul_cale, mod, iesire = sys.argv[1], sys.argv[2], sys.argv[3]
extra = sys.argv[4:]
spec = importlib.util.spec_from_file_location("varianta", modul_cale)
varianta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(varianta)
original = varianta.rasfoire
timpi = []


def cronometrat(*a, **k):
    t0 = time.time()
    r = original(*a, **k)
    timpi.append(time.time() - t0)
    return r


film.rasfoire = cronometrat
SCENARIU = "out/film-nisporeni-flow.json"
# trecerea 06 -> 08: tăietura la 4,7 s (cadrul 141), durata 1,0 s => cadrele 126..156
if mod == "foaie":
    cadre = "122,127,130,133,136,139,142,145,148,151,154,158"
    sys.argv = ["film.py", SCENARIU, "-", f"--cadre={cadre}", "--coloane=4", f"--foaie={iesire}", *extra]
else:
    sys.argv = ["film.py", SCENARIU, iesire, "--interval=114-168", "--crf=18", *extra]
film.main()
if timpi:
    print(f"rasfoire: {len(timpi)} apeluri, {sum(timpi) / len(timpi):.2f} s/cadru în medie, max {max(timpi):.2f} s")
