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
- 2026-10-06: caz nou (ratat): decizia consiliului: „a.n” fără punctul final, data nașterii rămânea vizibilă
- 2026-10-06: declanșator nou pentru data_nasterii: `a\.\s?n(?![\w.])` ()
- 2026-10-06: caz nou (exces): extras e-Cadastru: ora din antet + nr. cadastral de pe rândul următor citite ca telefon
- 2026-10-06: caz nou (exces): planșă PUD: cote de nivel pe rânduri separate citite ca telefon
- 2026-10-06: caz nou (exces): extras e-Cadastru: câmpul „Domiciliul / Sediul” e gol; nu se acoperă rândurile următoare (numele proprietarilor rămân)
- 2026-10-06: caz nou (exces): antetul primăriei: telefonul/faxul instituției rămân (022 383-525)
- 2026-10-06: caz nou (exces): antetul primăriei: telefonul/faxul instituției rămân (022 381-846)
- 2026-10-06: caz nou (exces): antetul primăriei: telefonul/faxul instituției rămân
- 2026-10-06: caz nou (exces): antetul primăriei: telefonul/faxul instituției rămân
- 2026-10-06: caz nou (ratat): extras e-Cadastru cu rubrica „Domiciliul / Sediul” completată: se acoperă doar rândul ei
- 2026-10-06: caz nou (exces): extras e-Cadastru, antet pe un singur rând la OCR: ora + nr. cadastral citite ca telefon
- 2026-10-06: caz nou (exces): antetul consiliului citit greșit de OCR (cifre și „fax” deformate): telefonul instituției rămâne
- 2026-10-06: context profesional: `primaria\W{1,3}bacioi` ()
- 2026-10-06: caz nou (ratat): telefon după „tel:” se acoperă în continuare
- 2026-10-06: DOSARE PUD (2 dosare cu planșe ARHIPRO + 2 dosare scanate: dispoziție, cerere, decizii CL,
  extrase e-Cadastru). Lecții:
  - Telefonul se căuta peste rânduri: cote de nivel pe planșe și „ora din antet + nr. cadastral” deveneau
    „telefon”. Acum telefonul stă pe un singur rând și nu începe după „19:”/„06.” și nu e urmat de „.099”.
  - Deciziile CL scriu „a.n 18.03.19..” fără punct final: declanșator nou. Pe scanul slab, OCR-ul n-a legat
    oricum „a.n” de dată; data s-a acoperit prin zonă manuală (de verificat mereu rândul cu „c/p”).
  - Extrasele e-Cadastru au rubrica „Domiciliul / Sediul” goală: acum se citește doar pe același rând.
  - Antetul primăriei/consiliului (tel. 022 383-525, fax 022 381-846) rămâne: excepții + context
    „primaria…bacioi” (OCR-ul deformează cifrele).
  - `invata --exceptie` fictionaliza și cifrele datei publice, deci excepția nu se potrivea niciodată:
    acum excepțiile păstrează cifrele reale.
  - Semnăturile primarului trec peste ștampilă și au „cozi” lungi: caseta inițială a lăsat capete
    vizibile; s-au adăugat casete mici după verificarea vizuală mărită.
