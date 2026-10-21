---
name: film-produs
description: Face un film scurt de produs, fără text, din fotografii sau mockup-uri statice (o carte, o broșură, un obiect, un design), cu efect 3D: hărți de adâncime AI și o cameră virtuală care orbitează, se apropie și trece între planuri prin whip pan, zoom sau lumină, în buclă perfectă pentru o pagină web. Folosește-l când utilizatorul vrea un „video din animații”, un „showreel”, o „prezentare video a lucrării” sau un element vizual pentru site sau portofoliu din imagini, mai ales când spune că nu vrea texte. Pentru video cu titluri, cifre și etape, folosește video-prezentare.
---

# Film de produs din fotografii (2.5D, fără text)

`video/produs/` transformă fotografii statice într-un film care pare filmat. Pentru
fiecare imagine, un model AI (Depth Anything V2) estimează adâncimea. Apoi o cameră
virtuală se mișcă prin scenă: prim-planul se deplasează altfel decât fundalul, iar
planul imaginii se înclină în perspectivă. Planurile se leagă prin treceri, iar
filmul se termină exact unde începe, ca să ruleze în buclă pe o pagină.

**Întreabă întâi ce vrea utilizatorul:** un film de produs fără text (acest skill) sau
o prezentare cu titluri și cifre (`video-prezentare`). „Video din imagini” poate
însemna oricare dintre ele. Pentru portofoliu sau site, de obicei e primul.

## 1. Pregătire (o dată pe sesiune)

```bash
P=$SCRATCH/pylib                       # $SCRATCH = directorul scratchpad al sesiunii
pip install -q --target $P -r video/produs/requirements.txt
curl -sSL -o $SCRATCH/da2-small.onnx \
  https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
```

Rulează scripturile cu `PYTHONPATH=$P python3 ...`.

## 2. Imaginile și adâncimea

- Imaginile intră în `video/public/media/<proiect>/` (ignorat de git; o arhivă se
  despachetează acolo, cu `unzip -j`). Fă o foaie de contact cu `montage`, ca să le vezi
  pe toate dintr-o privire.
- `python3 video/produs/adancime.py $SCRATCH/da2-small.onnx video/public/media/<proiect>`
  scrie `adancime/<nume>.png` (16 biți, alb = aproape), în ~2 s pe imagine. Verifică o
  foaie de contact a hărților: produsul trebuie să se desprindă clar de fundal.

## 3. Scenariul

Scrie `video/out/film-<proiect>.json` (format complet în antetul `film.py`). Reguli
care au dat rezultate bune:

- **Ordinea logică a unui produs:** cadru de deschidere spectaculos (produsul pe fond
  închis) → produsul întreg din alte unghiuri → materiale și detalii (cotor, teanc,
  textură) → produsul deschis → detalii din interior → imagine de ansamblu → închidere
  pe coperta sau fața produsului, care se leagă în buclă cu deschiderea.
- **Durate:** 3–3,4 s pentru planurile principale, 2,5 s pentru detalii; în total
  25–35 s pentru 10–12 planuri.
- **Mișcare cu efect 3D vizibil, dar fără deformări:**

  | Parametru | Plan principal | Detaliu macro |
  |---|---|---|
  | `orbita` | ±0,045–0,055 | ±0,02–0,03 |
  | `pan` | — | ±0,035–0,045 |
  | `perspectiva` | ±3–5° | — |
  | `dolly` | 0,2–0,35 | — |
  | `zoom` | 1,05 → 1,2 | — |

  Alternează apropierea cu depărtarea și sensurile, ca planurile vecine să nu se miște
  la fel. `reflexie: true` pe planurile cu coperta (un reflex de lumină trece peste produs).
- **Treceri:**
  - `whip`: energie între unghiuri ale aceluiași obiect; alternează `directie` și `axa`.
  - `zoom`: intrarea dintr-un plan larg într-un detaliu.
  - `lumina`: un accent cald, cel mult de două ori.
  - `taietura`: între două planuri statice înrudite.
  - `pagina`: răsfoire. Pagina din dreapta se ridică în jurul cotorului, se curbează și
    se întoarce, iar pe spatele ei apare imaginea următoare. Durează 1–1,1 s. **Doar
    între două mockup-uri suprapuse la pixel**, adică aceeași scenă și aceeași carte,
    doar cu alte pagini. Le găsești cu o imagine-diferență, unde totul în afară de pagini
    se anulează la negru (aici: `Deschisa_p4-5` și `Deschisa_p22-23`). Ambele planuri
    primesc aceeași cameră: același `centru`, aceeași `rotire` care aduce cotorul vertical
    pe axa întoarcerii, un `zoom` care continuă în același ritm, fără orbită sau dolly.
    Zoom-ul trebuie să fie destul de mare ca jumătatea dreaptă a cadrului să fie numai
    pagină. Între două fotografii diferite, la mijlocul întoarcerii ar apărea o pagină
    dublă care nu există și o bucată de masă care se întoarce odată cu pagina.
  - `dizolvare`: lentă, doar la bucla de la final. Mai multe dizolvări la rând fac din film un slideshow.
- **Stilul „macro” (ca în videourile AI de tip Flow sau Veo, dar exact):** planuri scurte
  de 1,5–2 s legate prin tăieturi seci. Camera e foarte aproape: `zoom` 1,5–2,3 pe un
  detaliu (titlul copertei, desenul, o linie a timpului). Profunzimea de câmp e mică:
  `dof` cu `punct` pe detaliul care trebuie să fie clar (autofocus pe ce se află acolo),
  `plaja` 0,03–0,04, `putere` 12–16 și `cadere` 0,12. Raza de lumină de fereastră
  (`raza`) trece peste copertă, iar finalul se retrage de pe un detaliu până la tot
  produsul (`zoom` [2,3, 1,05] cu `curba: "iesire"` și `dof` care se deschide:
  `putere` [16, 5]). Folosește-l când utilizatorul arată un asemenea video ca
  referință. Mockup-urile la care coperta e frontală și mare (cartea sprijinită,
  variantele verticale) dau macro-urile cele mai clare.
  - **Focusul** (`punct`) se pune pe ce e deja clar în fotografie: multe mockup-uri au
    profunzimea lor de câmp „coaptă” în imagine, iar blurul sintetic peste blurul
    existent face tot cadrul moale. Pe o retragere lungă, folosește `focus` fix (de
    exemplu [0,64, 0,68]), nu autofocus: punctul alunecă pe fundal și focusul pompează.
  - **Planurile întinse pe masă** (fața și spatele, văzute de sus) nu primesc `dof`: stau
    într-un singur plan și trebuie să fie clare de la un capăt la altul.
  - **Mișcarea** e mai hotărâtă decât pare: travlingul pe cotoare `pan` ±0,11, alunecarea
    pe o pagină ±0,045, iar retragerea finală liniar, fără `curba` care o oprește devreme.
  - **Gradarea** neutru-rece, ca videourile de produs: `"expunere": 0,92, "caldura": -0,02,
    "contrast": 0,12, "vineta": 0,32`. Hârtia caldă, crem, arată mai puțin premium.
  - **Raza de lumină:** `{"unghi": 125, "latime": 0,07, "intensitate": 0,5, "drum": [-0,3, 0,1]}`,
    adică o bandă îngustă care alunecă încet. Luminează după cât de deschisă e suprafața,
    deci negrul copertei rămâne adânc.
  - Ca să compari cu o referință, măsoară: tăieturile (diferența dintre cadre), viteza
    mișcării (flux optic) și claritatea (varianța laplacianului) pe ambele videouri.
- **Exactitate:** în film apar doar imaginile reale. Spre deosebire de un generator AI
  de video, nu inventa pagini, texte sau unghiuri.
- **Sobrietate (cerința clientului):** un singur efect de lumină pe tot filmul (de
  exemplu raza de fereastră pe copertă). Fără `reflexie`, flash-uri `lumina` sau raze
  pe mai multe planuri: „prea multe jocuri cu lumina”.
- **Răsfoirea** (`pagina`), chiar și între mockup-uri suprapuse la pixel, se vede încă
  a fi grafică în prim-planurile macro. Clientul a cerut înlocuirea ei cu un cadru real
  (o tăietură spre altă pagină dublă). Folosește-o doar dacă cere explicit o întoarcere
  de pagină și acceptă cum arată.
- `centru` mută punctul de interes când zoom-ul ar tăia produsul. Ține-l aproape de
  0,5: fiecare abatere consumă rezerva de imagine și forțează zoom de siguranță.
- **`pivot`** (adâncimea care stă pe loc) e implicit percentila 80, de obicei masa din
  față. Dacă produsul e la altă adâncime, pune pivotul pe produs, altfel apropierea
  (dolly) îl micșorează exact cât îl mărește zoom-ul și planul pare plat. Două cazuri:
  o carte sprijinită de perete are adâncimea peretelui (~0,05), iar o pagină dublă
  care stă pe masă, ~0,58. Citește adâncimea din hartă, în punctul produsului.
- **Zoom de siguranță:** `film.py` calculează singur, pentru fiecare plan, cât trebuie
  mărit ca să nu iasă din fotografie (altfel la margini apare conținut oglindit) și îl
  afișează („planul 5: zoom +21%”). Dacă trece de ~10%, micșorează `orbita`, `dolly`,
  `perspectiva` sau abaterea lui `centru`: fundalul îndepărtat consumă cel mai mult.
- **Reflexia** cade doar pe produs, într-o bandă de adâncime din jurul lui. Banda se
  calculează implicit din `centru`; altfel o dai cu `reflexie_adancime`, iar
  `reflexie_zona` [x0,y0,x1,y1] o restrânge când produsul are aceeași adâncime ca
  fundalul (cartea lipită de perete).
- **Logica trecerilor:** un `zoom` intră într-un detaliu care se vede în planul de
  dinainte (pagina dublă → prim-planul aceleiași pagini). Nu pune la rând două planuri
  cu aceeași compoziție (două evantaie de coperte). La bucla de final, între un plan
  luminos și unul întunecat, o `taietura` e mai curată decât o dizolvare.

## 4. Verificare (fără să deschizi videoul)

```bash
F="PYTHONPATH=$P python3 video/produs/film.py video/out/film-<proiect>.json -"
$F --previzualizare --cadre=planuri   --foaie=video/out/f-planuri.jpg     # mijlocul planurilor
$F --previzualizare --cadre=capete    --foaie=video/out/f-capete.jpg      # mișcarea 3D din fiecare plan
$F --previzualizare --cadre=tranzitii --coloane=5 --foaie=video/out/f-tr.jpg
```

Micșorează foile cu `convert -resize 2000x` înainte să le deschizi. Mișcările mari se
verifică la rezoluție completă, pe un decupaj din jurul marginilor produsului
(`--cadre=15,95 --foaie=...`, fără `--previzualizare`). Acolo s-ar vedea întinderile.
Tot la rezoluție completă se verifică vârful fiecărui whip pan. Pentru bucla de final,
compară ultimul cadru cu primul: diferența trebuie să fie cât între două cadre vecine.

Merită și o critică independentă, cu doi agenți: unul pe regie (ordinea și logica
planurilor, cât se vede efectul 3D, repetiții) și unul pe artefacte (margini oglindite,
întinderi, reflexii, imagini fantomă). La primul film, criticii au găsit probleme pe
care foile de verificare nu le arătau.

## 5. Randare și livrare pentru web

```bash
PYTHONPATH=$P python3 video/produs/film.py video/out/film-<proiect>.json video/out/film-master.mp4 --crf=16
```

Randarea durează ~10 min pentru 35 s în Full HD. Din master se fac apoi versiunile
pentru web: MP4 H.264 cu `faststart` (crf 23–24), WebM VP9, o variantă de 1280 px
pentru mobil și un poster JPG din primul cadru. Fără pistă audio. Dă-i utilizatorului
și codul de inserare:

```html
<video autoplay muted loop playsinline preload="metadata" poster="film-poster.jpg">
  <source src="film.webm" type="video/webm">
  <source src="film.mp4" type="video/mp4">
</video>
```

## Reguli

- Imaginile, hărțile de adâncime, scenariile și videourile nu intră în git (stau în
  `public/media/` și `out/`). Modelul se descarcă în scratchpad, nu în repo.
- Nu inventa unghiuri pe care fotografiile nu le au: camera se mișcă doar în jurul
  unghiului fiecărei fotografii. Pentru alte unghiuri e nevoie de alte mockup-uri.
