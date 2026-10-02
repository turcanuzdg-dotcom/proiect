# Audit de design și accesibilitate — octombrie 2026

Evaluare făcută cu skill-urile din `.claude/skills/` (design-critique, accessibility-audit, ux-writing,
interaction-design, design-elevation), pe aplicația rulată cu date demonstrative, pe desktop (1280 px),
pe mobil (390 px) și la 320 px.

Severitate: 4 = blochează, 3 = majoră, 2 = minoră, 1 = cosmetică. Țintă de accesibilitate: WCAG 2.2 AA.

## Constatări și corecturi

| #   | Constatare                                                                                            | Principiu                                            | Sev. | Corectură                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| 1   | Conturul câmpurilor, al căsuțelor de bifat și al comutatoarelor oprite avea contrast 1,54:1           | WCAG 1.4.11 (min. 3:1)                               | 3    | Token nou `--color-control` (#808c9e): 3,2–3,4:1 pe toate fundalurile                                    |
| 2   | Cifra „0” din sumar avea contrast 2,49:1                                                              | WCAG 1.4.3 (min. 4,5:1)                              | 3    | Culoarea textului secundar (5,7:1)                                                                       |
| 3   | Elementul focalizat putea rămâne sub antetul fix la navigarea cu Tab                                  | WCAG 2.4.11                                          | 2    | `scroll-padding-top: 5rem`                                                                               |
| 4   | Butonul central de pe mobil nu avea etichetă vizibilă, deși specificația cere „Adaugă” în bara de jos | Iconițe cu text (IA, etichetare)                     | 2    | Etichetă vizibilă „Adaugă” sub buton                                                                     |
| 5   | Pe mobil existau două butoane dominante pentru aceeași acțiune (bara de jos și butonul din panou)     | Un singur CTA dominant, legea lui Hick               | 2    | Rămâne butonul central din bara de jos                                                                   |
| 6   | Bannerul demo ocupa mult spațiu și împingea sumarul termenelor sub pliu                               | Ierarhie vizuală, atenție selectivă                  | 2    | Banner compact, pe un rând                                                                               |
| 7   | Plăcuța „Mai târziu” și secțiunea „În regulă” arătau numere diferite fără explicație                  | H4 Consecvență                                       | 2    | Subtitlu: „3 cu termen peste 30 de zile · 1 fără termen”                                                 |
| 8   | Filtrul de status folosea „Urgent / Urmează” fără intervale                                           | H6 Recunoaștere, nu memorare                         | 2    | „Urgent (0–7 zile)”, „Urmează (8–30 de zile)”, „În regulă (peste 30 de zile)”                            |
| 9   | Butonul „Finalizat” părea un status, nu o acțiune                                                     | UX writing: verb + obiect                            | 2    | „Marchează rezolvat” (nume accesibil cu titlul reminderului)                                             |
| 10  | Rezolvarea unui reminder nu putea fi anulată                                                          | H3 Control și libertate; „undo în loc de confirmare” | 2    | Mesaj cu butonul „Anulează”                                                                              |
| 11  | Fiecare card de reminder repeta aceeași frază lungă                                                   | H8 Design minimalist                                 | 1    | Pentru remindere de document: „Termen: 6 ianuarie 2027”                                                  |
| 12  | Pe pagina documentului, reminderele repetau numele documentului                                       | H8, excise cognitiv                                  | 1    | „Cu 45 de zile înainte”, „Cu o zi înainte”                                                               |
| 13  | Mesaje de eroare vagi („Ceva n-a mers bine”, „Fișier invalid.”)                                       | H9; UX writing: ce s-a întâmplat, de ce, ce faci     | 2    | Ex.: „Acțiunea nu a reușit. Probabil conexiunea s-a întrerupt. Verifică internetul și încearcă din nou.” |
| 14  | Confirmări lungi la timpul trecut compus                                                              | UX writing: concis, specific                         | 1    | „Document adăugat. Reminderele sunt programate.”, „Reînnoire salvată. Reminderele au fost recalculate.”  |
| 15  | Butonul „+ Document” din Familie era vag                                                              | UX writing: verb + obiect                            | 1    | „Adaugă document”                                                                                        |
| 16  | Iconul de fișier atașat avea `aria-label` direct pe SVG                                               | WCAG 1.1.1, robustețe                                | 1    | Text ascuns vizual „Are fișier atașat”                                                                   |

## Verificat și în regulă

- Contrastul culorilor de status pe fundalurile lor: 5,2–6,1:1. Statusul nu este transmis niciodată doar prin culoare
  (icon + text).
- `lang="ro"`, link „Sari la conținut”, repere `header` / `nav` / `main`, ierarhia titlurilor.
- Toate câmpurile au etichete vizibile; erorile apar lângă câmp, cu `role="alert"` și `aria-describedby`.
- Dialogurile (Radix) păstrează focusul și îl returnează la închidere; Esc închide dialogurile și meniurile.
- Ținte tactile ≥ 32 px (minim 24 px); `prefers-reduced-motion` respectat.
- Fără derulare orizontală la 320 px pe: panou, documente, document nou, detaliu, remindere, familie, setări.

## De urmărit (necesită testare cu utilizatori)

- Pragurile de status (7 / 30 de zile) și cele de reminder (45 / 30 / 14 / 7 / 1) — de validat cu utilizatori reali.
- Formularul în 5 pași pentru documente simple: de măsurat timpul de completare; poate fi nevoie de o variantă rapidă.
- Testare cu cititoare de ecran reale (NVDA, VoiceOver, TalkBack) pe dispozitive fizice.
- Câmpurile de dată folosesc formatul sistemului de operare al utilizatorului.

Titlurile rămân scrise cu majusculă doar la început (convenția limbii române), nu în „Title Case” englezesc.
