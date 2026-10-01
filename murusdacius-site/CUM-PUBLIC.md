# Cum public o lucrare nouă pe site

Totul se face din browser (sau din aplicația GitHub pe telefon). Site-ul se
actualizează singur în 1–2 minute după fiecare salvare.

## 1. Datele firmei (o singură dată)

Deschide `_config.yml` → creionul ✏️ (Edit) → completează `idno`, `sediu`,
`email`, `telefon`, `facebook`, `linkedin` → **Commit changes**.
Tot acolo poți schimba sloganul, textul „despre” și lista de servicii.

## 2. Adaugă o lucrare

1. Intră în folderul `_proiecte` → **Add file → Create new file**.
2. Numele fișierului: `AAAA-LL-nume-scurt.md`, fără diacritice și spații,
   de ex. `2026-10-ziar-bacioi-nr5.md`. Din el se face adresa paginii.
3. Copiază modelul de mai jos, completează-l → **Commit changes**.

```markdown
---
title: "Titlul lucrării"
data: 2026-10-01
categorie: Producție media
rezumat: "O frază despre lucrare; apare pe card și în Google."
beneficiar: "Pentru cine ai lucrat"
finantator: "Cine a finanțat (dacă e cazul)"
rol: "Ce ai făcut tu"
imagine: /assets/img/lucrari/numele-pozei.jpg
link: https://adresa-unde-e-publicat-materialul
galerie:
  - /assets/img/lucrari/poza1.jpg
  - /assets/img/lucrari/poza2.jpg
---
Aici scrii descrierea. Poți folosi **îngroșat**, liste cu „- ”
și subtitluri cu „## ”.
```

Câmpurile de care nu ai nevoie (beneficiar, finanțator, imagine, link, galerie)
se șterg pur și simplu. Obligatorii sunt doar `title`, `data` și `categorie`.

**Categoriile** sunt libere: ce scrii la `categorie` devine automat buton de
filtrare pe pagina „Lucrări”. Folosește aceeași formulare pentru lucrări din
aceeași categorie (de ex. mereu „Producție media”, nu o dată „Media”).

## 3. Adaugă imagini

1. Intră în `assets/img/lucrari` → **Add file → Upload files** → trage pozele.
2. Nume fără diacritice și spații: `ziar-nr5-coperta.jpg`.
3. Ideal sub 500 KB fiecare (lățime ~1600 px), ca site-ul să se încarce repede.
4. În fișierul lucrării scrie calea: `/assets/img/lucrari/ziar-nr5-coperta.jpg`.

## 4. Modifică sau șterge o lucrare

Deschide fișierul din `_proiecte` → ✏️ pentru modificare sau
`⋯ → Delete file` pentru ștergere. Lucrările-exemplu (cu „[Exemplu]” în
titlu) se șterg după ce adaugi primele lucrări reale.

## 5. Domeniu propriu (opțional, ex. murusdacius.md)

1. Cumpără domeniul (pentru .md: registratorii acreditați de MoldData).
2. La registrator, adaugă înregistrări DNS de tip `A` către
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   și un `CNAME` pentru `www` către `NUMELE-TAU.github.io`.
3. În GitHub: **Settings → Pages → Custom domain** → scrie domeniul → Save,
   apoi bifează **Enforce HTTPS** când devine disponibil.

## Dacă ceva nu apare

**Actions** (tab-ul de sus) arată fiecare actualizare. Un ✗ roșu înseamnă de
obicei o greșeală în antetul dintre `---`: lipsesc ghilimele la un text care
conține `:`, sau data nu e în forma `AAAA-LL-ZZ`.
