# Video de prezentare (Remotion)

Șablon pentru un video modern de prezentare a unui proiect, din fotografii și texte.
Scenele se descriu într-un fișier JSON; formatele: 16:9 (`Prezentare`) și 9:16
(`PrezentareVerticala`). Instrucțiunile complete: `.claude/skills/video-prezentare/SKILL.md`.

```bash
npm ci                                                  # o dată
npm run previzualizare -- --props=out/proiect.json      # rapid, jumătate de rezoluție
npm run randeaza -- --props=out/proiect.json            # out/prezentare.mp4
npm run randeaza:vertical -- --props=out/proiect.json   # out/prezentare-verticala.mp4
```

Fără `--props` se randează exemplul fictiv din `src/date/exemplu.ts`.
Fotografiile reale stau în `public/media/` și nu intră în git.

Remotion e gratuit pentru persoane fizice, organizații nonprofit și firme de cel mult
3 angajați; altfel: https://www.remotion.pro/license
