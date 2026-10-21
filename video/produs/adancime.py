"""Hărți de adâncime pentru filmul de produs (Depth Anything V2, ONNX, pe procesor).

    python adancime.py <model.onnx> <folder imagini> [<folder ieșire>]

Pentru fiecare imagine scrie <nume>.png pe 16 biți, la rezoluția imaginii:
0 = cel mai departe, 65535 = cel mai aproape (disparitate relativă, normalizată).
Modelul: https://huggingface.co/onnx-community/depth-anything-v2-small (onnx/model.onnx).
"""

import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

LATURA_MICA = 518  # rezoluția de lucru a modelului; laturile trebuie să fie multipli de 14
MEDIE = np.array([0.485, 0.456, 0.406], dtype=np.float32)
ABATERE = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def multiplu14(x: float) -> int:
    return max(14, int(round(x / 14)) * 14)


def adancime(sesiune: ort.InferenceSession, bgr: np.ndarray) -> np.ndarray:
    h, w = bgr.shape[:2]
    f = LATURA_MICA / min(h, w)
    lw, lh = multiplu14(w * f), multiplu14(h * f)
    rgb = cv2.cvtColor(cv2.resize(bgr, (lw, lh), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
    x = ((rgb.astype(np.float32) / 255.0 - MEDIE) / ABATERE).transpose(2, 0, 1)[None]
    iesire = sesiune.run(None, {sesiune.get_inputs()[0].name: x})[0]
    d = np.squeeze(iesire).astype(np.float32)
    # normalizare robustă (fără valorile extreme), apoi la rezoluția imaginii
    jos, sus = np.percentile(d, 1), np.percentile(d, 99.5)
    d = np.clip((d - jos) / max(1e-6, sus - jos), 0, 1)
    d = cv2.resize(d, (w, h), interpolation=cv2.INTER_CUBIC)
    # netezire care păstrează marginile obiectelor: mai puține artefacte la deformare
    d = cv2.bilateralFilter(d, 9, 0.08, 7)
    return np.clip(d, 0, 1)


def main() -> None:
    model, intrare = Path(sys.argv[1]), Path(sys.argv[2])
    iesire = Path(sys.argv[3]) if len(sys.argv) > 3 else intrare / "adancime"
    iesire.mkdir(parents=True, exist_ok=True)
    sesiune = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    for cale in sorted(intrare.glob("*.jpg")) + sorted(intrare.glob("*.png")):
        bgr = cv2.imread(str(cale), cv2.IMREAD_COLOR)
        if bgr is None:
            continue
        d = adancime(sesiune, bgr)
        cv2.imwrite(str(iesire / f"{cale.stem}.png"), (d * 65535).astype(np.uint16))
        print(cale.name)


if __name__ == "__main__":
    main()
