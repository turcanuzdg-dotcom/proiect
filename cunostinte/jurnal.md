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
