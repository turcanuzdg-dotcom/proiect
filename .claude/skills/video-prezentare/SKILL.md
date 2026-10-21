---
name: video-prezentare
description: Montează un video modern de prezentare a unui proiect (lucrări, investiții, evenimente, proiecte finanțate) din fotografii și texte, cu șablonul Remotion din video/. Folosește-l ori de câte ori utilizatorul cere un video, clip, reel, montaj, slideshow sau prezentare video din imagini, în format orizontal (site, YouTube, ecran) sau vertical (Facebook/Instagram Reels, TikTok, Shorts), chiar dacă nu spune „Remotion”.
---

# Video de prezentare din fotografii

Șablonul din `video/` (Remotion 4, React) produce un MP4 animat: titluri care apar
cuvânt cu cuvânt, fotografii cu mișcare de cameră (Ken Burns), comparație înainte/după,
cifre care se numără, linie a timpului, tranziții și granulație de film. Totul e
condus de un singur fișier JSON cu scenele. Pentru cod Remotion nou, încarcă și
skill-ul oficial `remotion-markup`; pentru opțiuni de randare, `remotion-render`.

## 1. Pregătire (o dată pe sesiune)

```bash
cd video && [ -d node_modules ] || npm ci
```

În cloud, Chromium-ul preinstalat e folosit automat (`remotion.config.ts`). Nu rula
`npx remotion browser ensure` și nu deschide Studio: utilizatorul nu-l poate vedea
din sesiunea cloud. Arată-i rezultatul prin cadre-cheie și MP4 (pașii 5–6).

## 2. Materialele

- **Fotografiile** intră în `video/public/media/` (ignorat de git; nu se urcă niciodată).
  Le iei din fișierele încărcate în chat, cu `curl -sSL -o video/public/media/X.jpg <link>`,
  sau din Google Drive prin conector. Nume simple, fără spații și diacritice
  (`01-santier.jpg`).
- Imaginile foarte mari se micșorează înainte (randarea e mai rapidă):
  `convert X.jpg -resize '2400x2400>' -quality 85 X.jpg`.
- **Persoane identificabile, copii, numere de mașini:** întreabă utilizatorul dacă
  fotografiile pot fi publicate așa (Legea 133/2011).
- **Muzica** doar dacă o dă utilizatorul (drepturi de autor); intră tot în `public/media/`.

## 3. Textele

- Voce oficială a primăriei: skill-ul `comunicare-bacioi`. Material de ziar:
  `redactare-ziar-bacioi`.
- Pe ecran textul se citește în 2–3 secunde: titluri de cel mult ~45 de caractere,
  texte de cel mult ~60. Cifrele, scurte și verificate (nu inventa sume sau suprafețe:
  întreabă).

## 4. Fișierul proiectului

Scrie `video/out/proiect.json` (ignorat de git). Căile imaginilor sunt relative la
`video/public/`. `durata` (secunde) e opțională la fiecare scenă.

```json
{
  "stil": "modern",
  "culori": { "principala": "#2F7CF6", "accent": "#FFC23D" },
  "muzica": "media/fundal.mp3",
  "scene": [
    { "tip": "intro", "eticheta": "Comuna Exemplu · 2026", "titlu": "Parcul central, renovat",
      "subtitlu": "Un spațiu verde nou pentru comunitate", "imagine": "media/01.jpg" },
    { "tip": "foto", "imagine": "media/02.jpg", "titlu": "Alei noi", "text": "48 de corpuri LED" },
    { "tip": "inainte-dupa", "inainte": "media/03a.jpg", "dupa": "media/03b.jpg", "titlu": "Înainte și după" },
    { "tip": "cifre", "titlu": "În cifre", "cifre": [
      { "valoare": 12500, "sufix": " m²", "eticheta": "suprafață amenajată" } ] },
    { "tip": "etape", "titlu": "Etapele", "etape": [
      { "data": "Aprilie 2025", "text": "Începerea lucrărilor" },
      { "data": "Mai 2026", "text": "Recepția" } ] },
    { "tip": "final", "titlu": "Împreună construim comunitatea", "text": "Mulțumim!",
      "logouri": ["media/logo.png"], "contact": "exemplu.md" }
  ]
}
```

| Scenă | Câmpuri (cu `?` = opțional) | Durată implicită |
|---|---|---|
| `intro` | `titlu`, `eticheta?`, `subtitlu?`, `imagine?` | 5 s |
| `foto` | `imagine`, `titlu?`, `text?` | 4,5 s |
| `inainte-dupa` | `inainte`, `dupa`, `titlu?`, `etichetaInainte?`, `etichetaDupa?` (implicit ÎNAINTE / DUPĂ; de ex. „2023” / „2026”) | 6 s |
| `cifre` | `cifre[1–4]` (`valoare`, `prefix?`, `sufix?`, `eticheta`), `titlu?` | 5,5 s |
| `etape` | `etape[2–5]` (`data?`, `text`), `titlu?` | 7 s |
| `final` | `titlu`, `text?`, `logouri?`, `contact?` (site, e-mail, telefon sau orice alt text, de ex. instituția: primește pictograma potrivită) | 5 s |

Structura recomandată pentru 45–75 s: intro, 4–8 fotografii (cu o comparație
înainte/după dacă există), cifre, etape, final. Pentru Reels: 15–30 s, mai puține scene.
Tipurile exacte: `video/src/date/tipuri.ts`.

## 5. Verificare ieftină (înainte de randarea completă)

**Economie de tokeni:** nu deschide cadre unul câte unul. Randează câteva cadre și
unește-le într-o singură foaie, apoi deschide doar foaia:

```bash
cd video
node scripts/foaie.mjs out/proiect.json Prezentare --scala=0.4            # out/foaie-Prezentare.jpg
node scripts/foaie.mjs out/proiect.json PrezentareVerticala --scala=0.3   # out/foaie-PrezentareVerticala.jpg
```

Scriptul randează câte un cadru din mijlocul fiecărei scene (cu `--tranzitii`, și din
mijlocul fiecărei tranziții) dintr-un singur bundle, în ~20 s, și le pune pe o foaie.

O singură scenă se poate încerca separat cu compozițiile `Scena` / `ScenaVerticala`
(`--props='{"scena": {...}}'`). Verifică: textul încape și se citește peste fotografie,
diacriticele apar, nimic tăiat la margini (mai ales în 9:16).

## 6. Randare și livrare

```bash
cd video
npm run previzualizare -- --props=out/proiect.json     # 16:9 la jumătate de rezoluție, rapid
npm run randeaza -- --props=out/proiect.json           # out/prezentare.mp4, 1920×1080
npm run randeaza:vertical -- --props=out/proiect.json  # out/prezentare-verticala.mp4, 1080×1920
```

Trimite MP4-ul cu `SendUserFile` (și foaia de cadre, dacă ajută). Ajustările
(ordinea, duratele, textele, culorile) se fac în JSON și se randează din nou.

## Personalizare

- **Identitatea vizuală a proiectului**: dacă există materiale de brand (broșură, logo,
  mockup-uri), ia paleta din ele (eșantionează culorile din imagini cu Pillow) și
  potrivește tipografia. Video-ul trebuie să arate ca o continuare a lor.
- Culorile: `culori` în JSON (`principala`, `accent`, `fundal`, `text`, `textSecundar`,
  `suprafata` și, opțional, `lumina` = a doua lumină difuză din fundal; implicit un turcoaz
  rece, potrivit cu albastrul, dar nu cu paletele calde: acolo pune accentul).
  Accentul apare în texte mici, deci trebuie să aibă contrast bun pe `fundal`.
- Tipografia: `"stil": "modern"` (implicit, titluri în Unbounded) sau `"clasic"` (titluri
  serif în Playfair Display, la grosimea 600, cu cifre aliniate), pentru patrimoniu,
  istorie, carte, cultură. Textul mărunt rămâne în Inter. Fonturile sunt locale, în
  `public/fonturi/`, cu diacritice.
- Scenă nouă: tipul în `src/date/tipuri.ts`, componenta în `src/scene/`, cazul în
  `ScenaRandata` din `src/Prezentare.tsx`. Folosește `useFormat()` (merge în ambele
  formate), `useCulori()`, `TextAnimat`, `ImagineMiscare`, `Fundal`.
- Tranzițiile se aleg automat, după tipurile scenelor (`src/tranzitii/plan.ts`): estompare,
  cortină cu muchie de accent, glisare cu paralaxă și o lumină caldă de film după intro.
  Granulația de film se pune o singură dată peste tot filmul (în `Prezentare.tsx`), nu în scene.
- Textul se măsoară cu tabelele de glife din `src/componente/masuraText.ts` (nu cu
  `measureText`): Unbounded 800, Playfair Display 600, Inter 500/600. Dacă adaugi un font
  sau schimbi o grosime, regenerează tabelul cu fontTools (`instantiateVariableFont` la
  grosimea folosită, apoi `hmtx` pentru caracterele din `CARACTERE`).
- **Mockup-uri de carte sau de produs**: alege pentru 9:16 variantele verticale, dacă
  există (o pagină dublă orizontală se taie în 9:16). Pentru intro, o imagine în care
  produsul stă în dreapta (16:9) sau sus (9:16), ca titlul să nu se suprapună cu titlul
  de pe copertă.
- După modificări de cod: `npx tsc --noEmit && npx eslint src`.

## Reguli

- Fotografiile, randările și `out/proiect.json` nu intră în git (`.gitignore` le blochează;
  verifică `git status` înainte de commit). În `public/exemplu/` stau doar imagini fictive.
- Licența Remotion: gratuit pentru persoane fizice, organizații nonprofit și firme de
  cel mult 3 angajați; altfel e nevoie de licență (remotion.pro/license).
