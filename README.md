# Hasurare documente: Primăria Băcioi

Acoperă datele cu caracter personal din PDF-urile care se publică pe bacioi.md:
IDNP, data nașterii, domiciliul, actul de identitate, telefonul și emailul personal.
Numele solicitantului, adresa terenului, nr. cadastral și datele firmelor rămân vizibile.

Hasurarea e **reală**: pe paginile cu text, textul de sub casete e șters din fișier;
paginile scanate sunt refăcute din imagine, deci nu rămâne niciun strat de text ascuns.

## Instalare

```bash
./scripts/instaleaza.sh      # PyMuPDF, Pillow, pytesseract, Tesseract (ron+rus)
```

## Folosire

```bash
python -m hasurare hasureaza intrari/Dispozitie.pdf          # hasurează + verifică + raport
python -m hasurare hasureaza intrari/Dispozitie.pdf --zone iesiri/Dispozitie-zone.json
python -m hasurare verifica intrari/Dispozitie.pdf           # doar raportează, nu modifică
```

Rezultatele apar în `iesiri/`: `*-hasurat.pdf`, `*-raport.md` și previzualizările PNG.
**Semnăturile olografe nu se găsesc automat:** privește previzualizările (locurile
probabile sunt încadrate cu roșu) și adaugă-le într-un fișier de zone:

```json
[{"pagina": 2, "rect": [380, 640, 520, 690], "motiv": "semnătura primarului"}]
```

Coordonatele sunt în puncte PDF (pixel din PNG × 0,72).

## Cum învață

Fiecare greșeală devine un caz de test (cu cifre fictive) în `cunostinte/cazuri.jsonl`,
iar regula se generalizează până trec toate cazurile:

```bash
python -m hasurare invata ratat --context "cet. Popa Ion, cu viza de reședință în s. X, str. Y 3" \
    --fragment "s. X, str. Y 3" --nota "formulare nouă"
python -m hasurare invata declansator --categorie domiciliu "viza\s+de\s+re[șs]edin[țt][ăa]"
python -m hasurare testeaza
python -m pytest -q
```

Reguli învățate: `cunostinte/reguli.json`. Istoric: `cunostinte/jurnal.md`.
Instrucțiunile pentru Claude: `CLAUDE.md`.

Documentele reale (`intrari/`, `iesiri/`, orice `.pdf`) nu intră în git.

## Alte proiecte din depozit

- [`in-termen/`](in-termen/README.md) — **În Termen**, aplicație web (Next.js + Supabase) pentru urmărirea
  termenelor de expirare ale documentelor personale. Independentă de instrumentul de hasurare.
