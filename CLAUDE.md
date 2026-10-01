# Proiect: hasurarea datelor personale (Primăria Băcioi)

Instrument care acoperă datele cu caracter personal din PDF-urile destinate publicării
pe bacioi.md (Legea nr. 133/2011). Regulile vin din skill-ul `hasurare-pdf-bacioi`.
Încarcă skill-ul la orice sarcină de hasurare.

## Reguli pe scurt

- **Se acoperă:** IDNP/cod personal, data nașterii, domiciliul persoanei fizice, seria și
  numărul actului de identitate (și data eliberării), telefonul și emailul personal,
  **toate semnăturile olografe** (inclusiv ale primarului și secretarului).
- **Rămâne:** numele solicitantului, funcționarii în exercițiu, profesioniștii atestați cu
  contactele de serviciu, nr. cadastral, adresa și suprafața **terenului**, persoanele
  juridice (IDNO, sediu, contacte), numerele și datele actelor, ștampilele.
- Domiciliul persoanei se acoperă, adresa terenului rămâne. Când ai dubii, întreabă.

## Fluxul pentru fiecare document

1. Pune PDF-ul în `intrari/` (ignorat de git; documentele reale nu se urcă niciodată).
2. `python -m hasurare hasureaza intrari/X.pdf` produce în `iesiri/` fișierul `-hasurat.pdf`,
   raportul `-raport.md` și previzualizările PNG.
3. **Privește fiecare PNG cu Read.** Semnăturile nu se detectează automat. Locurile probabile
   sunt încadrate cu roșu. Caută și cifre sau margini rămase la vedere.
4. Pentru ce lipsește, scrie `iesiri/X-zone.json` (`[{"pagina": 1, "rect": [x0,y0,x1,y1],
   "motiv": "semnătură"}]`, în puncte PDF = pixeli PNG × 0,72) și rulează din nou cu `--zone`.
5. Raportul trebuie să spună „curat”. Livrează fișierul cu lista, pe pagini, a zonelor acoperite.
6. Dacă utilizatorul trimite un PDF „de verificat”, rulează doar `verifica` și raportează.

## Învățarea: obligatoriu după fiecare document

Proiectul se îmbunătățește doar dacă fiecare greșeală devine regulă și test:

- **Ratat** (trebuia acoperit și n-a fost, prins de tine la pasul 3 sau de utilizator):
  `python -m hasurare invata ratat --context "<propoziția, cu nume/străzi INVENTATE>"
  --fragment "<ce trebuia acoperit>" --nota "<de ce>"`
- **Exces** (acoperit, dar trebuia să rămână): `invata exces ...`. Adaugă `--exceptie` doar
  dacă fragmentul e o dată publică fixă (de ex. telefonul primăriei).
- Apoi **generalizează regula** până trec toate cazurile: `invata declansator --categorie
  domiciliu "<regex>"`, `invata tipar --categorie X "<regex cu grup (?P<v>...)>"`,
  `invata profesional "<regex>"`, `invata domeniu bacioi.md`, sau modifică direct
  `hasurare/detectie.py` când e nevoie de logică nouă.
- Nu șterge și nu slăbi un caz ca să treacă testele. Cazurile sunt memoria proiectului.
- `python -m pytest -q` trebuie să treacă. Apoi commit cu mesajul „Lecție: ...”.
- Problemele tehnice (casete prea scurte, OCR greșit) se notează în `cunostinte/jurnal.md`.

## Confidențialitate

- Niciun PDF real, raport sau previzualizare în git (`.gitignore` le blochează; verifică
  `git status` înainte de commit).
- În `cunostinte/` intră doar date fictive. `invata` schimbă automat cifrele, dar numele și
  străzile trebuie inventate de tine.
- Rapoartele arată doar primele 2 caractere ale fiecărei zone.

## Structura

- `hasurare/detectie.py` regulile de bază (regex) pe text simplu
- `hasurare/pagina.py` cuvinte cu coordonate (strat de text sau OCR Tesseract ron+rus)
- `hasurare/proces.py` hasurarea (pagini text: ștergere reală; scanuri: refacere din imagine),
  verificarea finală, previzualizările, raportul
- `hasurare/cunostinte.py` + `cunostinte/` ce s-a învățat
- `tests/` cazurile învățate și testele cap-coadă pe PDF
