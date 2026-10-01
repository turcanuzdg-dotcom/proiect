# Jurnal de învățare

Fiecare greșeală găsită la verificare (ratată sau acoperită în plus) se notează
aici, într-un rând, împreună cu ce s-a schimbat în reguli. Comanda
`python -m hasurare invata ...` adaugă rândurile automat.

- 2026-10-01: pornire. Reguli de bază după practica Primăriei Băcioi (IDNP, a.n., domiciliu,
  act de identitate, telefon și email personale). Caz cunoscut: Decizia nr. 4/27 din
  06.10.2025, punctul 1, unde „a.n.” și „c/p” au rămas în clar în mijlocul frazei.
- 2026-10-01: verificarea vizuală pe scanul de probă: la „tel. 069…​.” ultima cifră și o margine
  a datei nașterii rămâneau vizibile, pentru că OCR-ul lipește punctuația de cuvânt și caseta
  tăia proporțional prea scurt. Corectat în `pagina.dreptunghiuri`: un caracter în plus pe
  partea tăiată, margine 2 pt.
- 2026-10-01: caz nou (ratat): „viza de reședință” nu era recunoscută ca domiciliu
- 2026-10-01: declanșator nou pentru domiciliu: `(?:cu\s+)?viza\s+de\s+re[șs]edin[țt][ăa]` (formulare din cererile de urbanism)
- 2026-10-01: STUDIU bd. DACIA (PUZ, 31 planșe A3 din AutoCAD, publicat pe bacioi.md). Rezultat: nicio
  dată personală, coloanele „Semnătura” goale, beneficiar Primăria (persoană juridică), proiectanți
  în calitate profesională. Lecții:
  - Textul din PDF-urile AutoCAD are codificare stricată („%ăFLRL” = „Băcioi”): detectat automat
    (`text_stricat`), iar paginile se citesc cu OCR.
  - Pe hărți/planșe OCR-ul citește hașurile ca cifre („5909505059059”, încredere 0-37%): 4 IDNP false.
    Acum, pe paginile colorate, se păstrează doar cuvintele cu încredere ≥50%.
  - „BENEFICIAR” din cartuș nu e loc de semnătură; antetul „Semnătura” se verifică doar dedesubt.
  - Planșele cu fundal alb nu sunt hârtie scrisă: deosebirea se face după culoare, nu după numărul
    de cuvinte (ultima pagină a unei decizii poate avea doar semnăturile).
  - Limită: în cartușele mici OCR-ul a găsit „Semnătura” doar pe 12 din 28 de planșe; restul s-au
    verificat vizual, din decupaje ale cartușului.
- 2026-10-01: economie de tokeni: verificarea vizuală se face pe o singură foaie cu decupaje
  (`*-de-verificat.png`), doar unde algoritmul găsește cerneală, nu pe pagini întregi.
