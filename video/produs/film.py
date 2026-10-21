"""Film de produs din fotografii statice: cameră virtuală 2.5D pe hărți de adâncime.

    python film.py <scenariu.json> <ieșire.mp4> [--previzualizare] [--crf=18]
    python film.py <scenariu.json> - --previzualizare --cadre=planuri|tranzitii|capete|0,30,60 --foaie=x.jpg [--coloane=4]

Fiecare cadru (plan) e o fotografie cu harta ei de adâncime (vezi adancime.py).
Camera se mișcă liniar pe durata planului, în spațiu: apropiere cu paralaxă
(obiectele apropiate cresc mai repede decât fundalul), orbită (fundalul alunecă
față de produs), panoramare, înclinare de perspectivă și rotire ușoară.
Planurile se leagă prin treceri (dizolvare, whip pan cu blur de mișcare, zoom
prin cadru, flash de lumină). Filmul e o buclă: după ultimul plan revine primul,
deci se poate rula la nesfârșit pe o pagină web.

Scenariul (JSON), cu toate valorile opționale în afară de `imagine`:
{
  "latime": 1920, "inaltime": 1080, "fps": 30,
  "imagini": "../public/media/proiect", "adancime": "../public/media/proiect/adancime",
  "gradare": {"caldura": 0.03, "contrast": 0.06, "vineta": 0.22, "granulatie": 2.5},
  "planuri": [
    {"imagine": "foto.jpg", "durata": 3.2,
     "zoom": [1.08, 1.18],          // de la -> la (1 = imaginea acoperă exact cadrul)
     "dolly": [0, 0.25],            // apropiere cu paralaxă: cât cresc în plus obiectele apropiate
     "orbita": [-0.02, 0.02],       // paralaxă orizontală (fracțiuni din lățime pe unitate de adâncime)
     "macara": [0, 0],              // paralaxă verticală
     "pan": [[0, 0], [-0.02, 0]],   // deplasarea cadrului (fracțiuni din lățime)
     "rotire": [0, 0],              // grade
     "perspectiva": [-3, 3],        // rotirea planului imaginii în jurul axei verticale (grade)
     "centru": [0.5, 0.5],          // punctul de interes din fotografie (fracțiuni)
     "pivot": null,                 // adâncimea care stă pe loc (implicit: produsul, percentila 80)
     "reflexie": false,             // un reflex de lumină care trece peste produs
     "tranzitie": {"tip": "whip", "durata": 0.5, "directie": 1}}  // spre planul următor
  ]
}
Tipuri de tranziție: dizolvare, whip (directie 1 = cadrul fuge spre stânga / în sus,
-1 = invers; "axa": "y" pentru panoramare verticală), zoom, lumina, taietura.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

# ---------------------------------------------------------------- utilitare


def lin(a, b, t):
    return a + (b - a) * t


def pereche(v, implicit):
    """[de_la, la] din valoare sau listă; o valoare singură înseamnă constantă."""
    if v is None:
        return (implicit, implicit)
    if isinstance(v, (int, float)):
        return (float(v), float(v))
    return (v[0], v[1])


def lisa(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def lisa_intre(a, b, t):
    return lisa((t - a) / max(1e-6, b - a))


# ---------------------------------------------------------------- plan


@dataclass
class Plan:
    imagine: np.ndarray  # float32 BGR 0..1
    adancime: np.ndarray  # float32 0..1, 1 = aproape
    durata: float
    cfg: dict
    pivot: float

    @staticmethod
    def incarca(cfg: dict, dir_img: Path, dir_ad: Path) -> "Plan":
        cale = dir_img / cfg["imagine"]
        img = cv2.imread(str(cale), cv2.IMREAD_COLOR)
        if img is None:
            raise SystemExit(f"Nu găsesc imaginea {cale}")
        ad = cv2.imread(str(dir_ad / (Path(cfg["imagine"]).stem + ".png")), cv2.IMREAD_UNCHANGED)
        if ad is None:
            raise SystemExit(f"Lipsește harta de adâncime pentru {cfg['imagine']} (rulează adancime.py)")
        ad = ad.astype(np.float32) / 65535.0
        pivot = cfg.get("pivot")
        if pivot is None:
            pivot = float(np.percentile(ad, 80))
        return Plan(img.astype(np.float32) / 255.0, ad, float(cfg.get("durata", 3.0)), cfg, pivot)

    def parametri(self, tau: float) -> dict:
        """Parametrii camerei la timpul local tau (secunde); liniari, deci se prelungesc firesc."""
        c = self.cfg
        t = tau / self.durata
        z0, z1 = pereche(c.get("zoom"), 1.1)
        pan = c.get("pan") or [[0, 0], [0, 0]]
        return {
            # zoom-ul crește geometric, ca viteza aparentă să fie constantă
            "zoom": z0 * (z1 / z0) ** t,
            "dolly": lin(*pereche(c.get("dolly"), 0.0), t),
            "orbita": lin(*pereche(c.get("orbita"), 0.0), t),
            "macara": lin(*pereche(c.get("macara"), 0.0), t),
            "pan": (lin(pan[0][0], pan[1][0], t), lin(pan[0][1], pan[1][1], t)),
            "rotire": lin(*pereche(c.get("rotire"), 0.0), t),
            "perspectiva": lin(*pereche(c.get("perspectiva"), 0.0), t),
            "t": t,
        }


# ---------------------------------------------------------------- randare


class Randator:
    def __init__(self, latime: int, inaltime: int):
        self.W, self.H = latime, inaltime
        xs = np.arange(latime, dtype=np.float32) - latime / 2 + 0.5
        ys = np.arange(inaltime, dtype=np.float32) - inaltime / 2 + 0.5
        self.X, self.Y = np.meshgrid(xs, ys)
        r = np.sqrt((self.X / (latime / 2)) ** 2 + (self.Y / (inaltime / 2)) ** 2) / math.sqrt(2)
        self.vineta_baza = np.clip(r, 0, 1) ** 2.2

    def cadru(self, plan: Plan, tau: float, extra: dict | None = None) -> np.ndarray:
        """Randează planul la timpul local tau. `extra` adaugă mișcări de tranziție."""
        p = plan.parametri(tau)
        if extra:
            p["zoom"] *= extra.get("zoom", 1.0)
            p["pan"] = (p["pan"][0] + extra.get("pan_x", 0.0), p["pan"][1] + extra.get("pan_y", 0.0))
        Hs, Ws = plan.adancime.shape
        cfg = plan.cfg
        cx, cy = cfg.get("centru", [0.5, 0.5])
        cx, cy = cx * Ws, cy * Hs
        s0 = max(self.W / Ws, self.H / Hs)
        S = s0 * p["zoom"]
        W = self.W

        # 1. perspectiva: din cadrul de ieșire înapoi pe planul imaginii (rotire în jurul axei verticale)
        x, y = self.X, self.Y
        phi = math.radians(p["perspectiva"])
        if abs(phi) > 1e-5:
            f = 1.6 * W
            X = x * f / (f * math.cos(phi) - x * math.sin(phi))
            y = y * (f + X * math.sin(phi)) / f
            x = X
        # 2. rotirea în planul cadrului și panoramarea
        th = math.radians(-p["rotire"])
        ct, st = math.cos(th), math.sin(th)
        ox = x - W * p["pan"][0]
        oy = y - W * p["pan"][1]
        rx = ct * ox - st * oy
        ry = st * ox + ct * oy
        # 3. paralaxa: căutăm punctul sursă q cu adâncimea lui (iterație de punct fix)
        dp = plan.pivot
        d = np.full_like(rx, dp)
        for _ in range(3):
            dd = d - dp
            scala = S * (1.0 + p["dolly"] * dd)
            qx = cx + (rx - W * p["orbita"] * dd) / scala
            qy = cy + (ry - W * p["macara"] * dd) / scala
            d = cv2.remap(plan.adancime, qx, qy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT101)
        img = cv2.remap(plan.imagine, qx, qy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT101)

        # 4. reflexul de lumină peste produs (doar pe zonele apropiate)
        if cfg.get("reflexie"):
            unghi = math.radians(28)
            pozitie = lin(-1.1, 1.1, p["t"]) * (W / 2 + self.H / 2)
            banda = (self.X * math.cos(unghi) + self.Y * math.sin(unghi)) - pozitie
            lumina = np.exp(-(banda**2) / (2 * (0.07 * W) ** 2))
            masca = np.clip((d - (dp - 0.12)) / 0.12, 0, 1)
            k = (0.16 * lumina * masca)[..., None]
            img = img + k * (1.0 - img)
        return np.clip(img, 0, 1)


def blur_directional(img: np.ndarray, lungime: float, unghi: float = 0.0) -> np.ndarray:
    n = int(round(abs(lungime)))
    if n < 2:
        return img
    k = np.zeros((n, n), np.float32)
    k[n // 2, :] = 1.0
    if unghi:
        R = cv2.getRotationMatrix2D((n / 2 - 0.5, n / 2 - 0.5), unghi, 1.0)
        k = cv2.warpAffine(k, R, (n, n))
    k /= k.sum()
    return cv2.filter2D(img, -1, k, borderType=cv2.BORDER_REFLECT101)


def blur_radial(img: np.ndarray, putere: float) -> np.ndarray:
    """Blur de zoom: media câtorva copii mărite din centru."""
    if putere < 0.004:
        return img
    H, W = img.shape[:2]
    acc = img.copy()
    pasi = 6
    for i in range(1, pasi + 1):
        s = 1.0 + putere * i / pasi
        M = cv2.getRotationMatrix2D((W / 2, H / 2), 0, s)
        acc += cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT101)
    return acc / (pasi + 1)


# ---------------------------------------------------------------- tranziții


def tranzitie(rand: Randator, A: Plan, B: Plan, tA: float, tB: float, u: float, tz: dict, fps: int) -> np.ndarray:
    """Cadrul de la progresul u (0..1) al trecerii de la A la B."""
    tip = tz.get("tip", "dizolvare")
    W = rand.W
    if tip == "taietura":
        return rand.cadru(A if u < 0.5 else B, tA if u < 0.5 else tB)
    if tip == "whip":
        # Panoramare foarte rapidă: A pleacă accelerând, B sosește frânând; schimbul
        # se face în vârful blurului de mișcare, unde ochiul nu mai distinge imaginea.
        sens = float(tz.get("directie", 1))
        dur = float(tz.get("durata", 0.5))
        vertical = tz.get("axa") == "y"
        cheie, unghi = ("pan_y", 90.0) if vertical else ("pan_x", 0.0)
        amp = 1.2 * (rand.H / W if vertical else 1.0)  # deplasarea la capăt, din lățime (un sfert la mijloc)
        a = rand.cadru(A, tA, {cheie: -sens * amp * u**2})
        b = rand.cadru(B, tB, {cheie: sens * amp * (1 - u) ** 2})
        pe_cadru = amp * W / (dur * fps)  # pixeli pe cadru la viteza maximă / 2
        lim = 0.12 * (rand.H if vertical else W)
        a = blur_directional(a, min(lim, 2 * u * pe_cadru), unghi)
        b = blur_directional(b, min(lim, 2 * (1 - u) * pe_cadru), unghi)
        m = lisa_intre(0.44, 0.56, u)
        return a * (1 - m) + b * m
    if tip == "zoom":
        # Camera „intră” în A cu blur radial și iese din B, care se așază la loc.
        za = 1.0 + 1.2 * u**3
        zb = 1.0 + 0.8 * (1 - u) ** 3
        a = blur_radial(rand.cadru(A, tA, {"zoom": za}), 0.22 * u**2)
        b = blur_radial(rand.cadru(B, tB, {"zoom": zb}), 0.18 * (1 - u) ** 2)
        m = lisa_intre(0.45, 0.55, u)
        return a * (1 - m) + b * m
    if tip == "lumina":
        # Un val de lumină caldă care supraexpune cadrul; schimbul se face la vârf.
        a = rand.cadru(A, tA)
        b = rand.cadru(B, tB)
        m = lisa_intre(0.4, 0.6, u)
        out = a * (1 - m) + b * m
        g = math.exp(-((u - 0.5) ** 2) / (2 * 0.13**2))
        cald = np.array([0.62, 0.84, 1.0], np.float32)  # BGR: piersică
        stralucire = cv2.GaussianBlur(out, (0, 0), 0.02 * W) * cald
        return np.clip(out + g * (0.7 * stralucire + 0.2 * cald) * (1 - out), 0, 1)
    a = rand.cadru(A, tA)
    b = rand.cadru(B, tB)
    m = lisa(u)
    return a * (1 - m) + b * m


# ---------------------------------------------------------------- gradare


def gradeaza(img: np.ndarray, rand: Randator, gr: dict, nr_cadru: int) -> np.ndarray:
    c = float(gr.get("contrast", 0.06))
    if c:
        img = img + c * (img - 0.5) * (1 - np.abs(2 * img - 1))  # curbă în S, blândă
    cald = float(gr.get("caldura", 0.03))
    if cald:
        img = img * np.array([1 - cald, 1.0, 1 + cald * 0.7], np.float32)
    v = float(gr.get("vineta", 0.22))
    if v:
        img = img * (1 - v * rand.vineta_baza)[..., None]
    g = float(gr.get("granulatie", 2.5))
    if g:
        rng = np.random.default_rng(nr_cadru // 2)  # determinist; se schimbă la 2 cadre
        zgomot = rng.normal(0, g / 255.0, (rand.H // 2, rand.W // 2)).astype(np.float32)
        zgomot = cv2.resize(zgomot, (rand.W, rand.H), interpolation=cv2.INTER_LINEAR)
        img = img + zgomot[..., None]
    return np.clip(img, 0, 1)


# ---------------------------------------------------------------- cronologia


def cronologie(planuri: list[Plan]):
    """Începutul global al fiecărui plan; filmul e circular (după ultimul vine primul)."""
    starts, t = [], 0.0
    for p in planuri:
        starts.append(t)
        t += p.durata
    return starts, t


def cadru_global(g: float, planuri: list[Plan], starts, total, rand: Randator, fps: int) -> np.ndarray:
    n = len(planuri)
    for i in range(n):
        A, B = planuri[i], planuri[(i + 1) % n]
        tz = A.cfg.get("tranzitie", {"tip": "dizolvare", "durata": 0.6})
        T = float(tz.get("durata", 0.6))
        granita = starts[i] + A.durata  # momentul tăieturii dintre A și B
        # distanța circulară până la tăietură
        dt = (g - granita + total / 2) % total - total / 2
        if -T / 2 <= dt < T / 2:
            u = (dt + T / 2) / T
            return tranzitie(rand, A, B, A.durata + dt, dt, u, tz, fps)
    for i in range(n):
        tau = (g - starts[i]) % total
        if tau < planuri[i].durata:
            return rand.cadru(planuri[i], tau)
    return rand.cadru(planuri[0], 0.0)


# ---------------------------------------------------------------- main


def main() -> None:
    argumente = [a for a in sys.argv[1:] if not a.startswith("--")]
    optiuni = dict(a[2:].split("=", 1) if "=" in a else (a[2:], "1") for a in sys.argv[1:] if a.startswith("--"))
    scenariu_cale = Path(argumente[0])
    sc = json.loads(scenariu_cale.read_text(encoding="utf-8"))
    baza = scenariu_cale.parent
    fps = int(sc.get("fps", 30))
    W, H = int(sc.get("latime", 1920)), int(sc.get("inaltime", 1080))
    if "previzualizare" in optiuni:
        W, H = W // 2, H // 2
    dir_img = (baza / sc["imagini"]).resolve()
    dir_ad = (baza / sc["adancime"]).resolve()
    planuri = [Plan.incarca(p, dir_img, dir_ad) for p in sc["planuri"]]
    rand = Randator(W, H)
    starts, total = cronologie(planuri)
    nr = int(round(total * fps))
    gr = sc.get("gradare", {})
    # Filmul începe imediat după trecerea de la ultimul plan la primul, ca prima
    # imagine să fie curată; bucla rămâne perfectă (ultimul cadru duce în primul).
    decalaj = float(planuri[-1].cfg.get("tranzitie", {}).get("durata", 0.6)) / 2

    if "cadre" in optiuni:  # doar câteva cadre, pe o foaie de verificare
        mod = optiuni["cadre"]
        if mod == "planuri":  # mijlocul fiecărui plan
            momente = [s + p.durata / 2 for s, p in zip(starts, planuri)]
        elif mod == "tranzitii":  # cinci cadre din fiecare trecere
            momente = []
            for s, p in zip(starts, planuri):
                T = float(p.cfg.get("tranzitie", {}).get("durata", 0.6))
                momente += [s + p.durata + (u - 0.5) * T for u in (0.15, 0.4, 0.5, 0.6, 0.85)]
        elif mod == "capete":  # începutul și sfârșitul părții curate a fiecărui plan (mișcarea 3D)
            momente = []
            for s, p in zip(starts, planuri):
                momente += [s + 0.45, s + p.durata - 0.45]
        else:
            momente = None
        lista = (
            [int(x) for x in mod.split(",")]
            if momente is None
            else [int(round((m - decalaj) * fps)) % nr for m in momente]
        )
        imagini = []
        for k in lista:
            img = gradeaza(cadru_global(k / fps + decalaj, planuri, starts, total, rand, fps), rand, gr, k)
            img = (img * 255).astype(np.uint8)
            cv2.putText(img, f"{k}", (12, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
            imagini.append(img)
        coloane = int(optiuni.get("coloane", 4))
        while len(imagini) % coloane:
            imagini.append(np.zeros_like(imagini[0]))
        randuri = [np.hstack(imagini[i : i + coloane]) for i in range(0, len(imagini), coloane)]
        cv2.imwrite(optiuni.get("foaie", "foaie.jpg"), np.vstack(randuri), [cv2.IMWRITE_JPEG_QUALITY, 85])
        print(optiuni.get("foaie", "foaie.jpg"))
        return

    iesire = argumente[1]
    ff = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps),
         "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", optiuni.get("crf", "18"), "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", "-an", iesire],
        stdin=subprocess.PIPE,
    )
    for k in range(nr):
        img = gradeaza(cadru_global(k / fps + decalaj, planuri, starts, total, rand, fps), rand, gr, k)
        ff.stdin.write((img * 255 + 0.5).astype(np.uint8).tobytes())
        if k % 60 == 0:
            print(f"{k}/{nr}", flush=True)
    ff.stdin.close()
    ff.wait()
    print(f"{iesire}: {nr} cadre, {total:.1f} s")


if __name__ == "__main__":
    main()
