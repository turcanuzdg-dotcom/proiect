# POS și gestiune pentru cafenea

Soft în două părți, sincronizate în timp real:

- **Ecranul de vânzare (POS)**: `/pos.html`, pe tableta de la tejghea. Comenzi, plăți numerar/card,
  casări fără încasare, istoric și anulări, plăți mărunte, inventariere, închiderea turei.
  Funcționează **și fără internet** (o zi întreagă și mai mult): totul se salvează în tabletă și se
  trimite la server când revine conexiunea.
- **Panoul de administrare**: `/admin.html`. Stocuri pe fiecare locație, depozit central, recepții de
  marfă, transferuri, inventarieri, flux de bani, rețetar, ture cu discrepanțe și rapoarte.

Detalii despre cum e construit și ce mai trebuie aflat de la client: [docs/arhitectura.md](docs/arhitectura.md).

## Pornire rapidă (dezvoltare)

Este nevoie doar de Node.js 22. Baza de date pornește singură (PGlite, PostgreSQL în WebAssembly,
salvată în `date/`).

```bash
npm install
npm run seed          # rețea demo: depozit + 2 cafenele, rețetar, 120 de zile de istoric (~1–2 min)
npm run dev           # server API pe :3000 și interfața pe http://localhost:5173
```

- Panou: http://localhost:5173/admin.html, utilizator `admin`, parola `schimba-ma`
- POS: http://localhost:5173/pos.html, cu codul de asociere afișat de `npm run seed`
  (sau creați o tabletă nouă din Setări → Tablete). Bariste demo: Ana (PIN 1111), Ion (2222), Maria (3333).

`npm run seed -- 30` încarcă doar 30 de zile de istoric (mai repede).

## Producție

Interfața se construiește pe calculatorul de dezvoltare (sau în CI), nu pe server: uneltele de build
și de test (Vite, Vitest, TypeScript) sunt devDependencies și nu ajung pe serverul care ține banii.

```bash
# pe calculatorul de dezvoltare: construiește web/dist/, care se copiază pe server lângă cod
npm ci && npm run build

# pe server: doar dependențele de producție, exact versiunile din package-lock.json
npm ci --omit=dev --ignore-scripts
DATABASE_URL=postgres://utilizator:parola@gazda/cafenea \
ADMIN_LOGIN=admin ADMIN_PAROLA='o parolă lungă' \
PORT=3000 npm start
```

- `npm ci`, nu `npm install`: instalează exact versiunile verificate din `package-lock.json` și nu
  le schimbă. Serverul rulează TypeScript direct, prin `tsx`, care e dependență de producție.
- Serverul servește și interfața construită (`web/dist`), deci e un singur proces.
- Trebuie pus în spatele unui **HTTPS** (de ex. Caddy sau nginx): fără HTTPS tableta nu poate instala
  aplicația și nu poate porni offline.
- La prima pornire se creează contul de administrator din `ADMIN_LOGIN` / `ADMIN_PAROLA`; cu
  `DATABASE_URL` setat, serverul refuză să pornească fără `ADMIN_PAROLA` dacă nu există niciun admin.
- Migrațiile bazei de date (`server/migrari/*.sql`) se aplică automat la pornire.

### Terminalul fiscal (POSLink / Intelectsoft)

Pentru un terminal bancar Android în regim fiscal (de ex. PAX A930 cu IS Fiscal), plata cu cardul și
bonul fiscal merg prin API-ul POSLink, din server:

```bash
POSLINK_API_KEY=<cheia din cabinetul POSLink> npm start     # opțional POSLINK_URL
```

Apoi, în panou, la Setări → Tablete, se trece pentru fiecare tabletă `DeviceID`-ul terminalului ei,
iar la Setări → Terminal fiscal, litera cotei de TVA implicite. Tableta alege singură „Terminal fiscal
prin server” când are un terminal legat.

### Puntea de echipamente

Browserul tabletei nu poate vorbi direct cu terminalul băncii sau cu casa de marcat. Pentru ele rulează
`punte/` pe tabletă sau pe un calculator din cafenea:

```bash
ORIGINE=https://adresa-serverului npm start -w punte   # ascultă pe http://127.0.0.1:8099
```

La pornire puntea afișează un **secret** (din `PUNTE_SECRET` sau generat o dată și păstrat în
`punte/.secret`). În POS: Meniu → Echipamente și tabletă → Punte locală, cu adresa și secretul.
Fără secret, puntea refuză orice comandă, deci o altă pagină din browser sau un calculator din rețea
nu pot porni plăți sau bonuri. Până se scriu driverele pentru modelele reale, atât puntea cât și
POS-ul au un simulator.

## Simularea în browser

O pagină statică în care tot softul rulează în browser, fără server: serverul real (pe PGlite),
tableta, panoul de administrare și un terminal PAX simulat, cu un ghid pas cu pas pentru client.

```bash
npm run simulare      # generează datele demo (~2 min) și construiește simulare/dist/
```

`simulare/dist/` e pentru găzduirea de artefacte: pagina `index.html` nu are `<html>` și `<head>`,
pe care gazda le adaugă singură. Pentru un site public obișnuit:

```bash
npm run simulare:site   # simulare/dist-site/, document complet + previzualizarea linkului
```

`dist-site/` se publică pe ramura `gh-pages` (GitHub Pages servește
https://turcanuzdg-dotcom.github.io/proiect/). Browserul trebuie să permită WebAssembly
(`'wasm-unsafe-eval'` dacă gazda trimite Content-Security-Policy).

## Teste

```bash
npm test                 # logică comună, server (pe PGlite), punte
npm run typecheck
TEST_DATABASE_URL=postgres://postgres@localhost/postgres npm test   # aceleași teste pe un PostgreSQL real
npm audit                # trebuie să arate 0 vulnerabilități
```

La actualizarea dependențelor, `package-lock.json` se regenerează cu `npx npm@11 install`: npm 10.9,
cel din Node 22, se oprește cu o eroare internă (`edgesOut`) la unele actualizări.

## Structura

| Director | Ce conține |
|---|---|
| `shared/` | Tipuri și calcule comune: rețetar cu modificatori, bani, SHA-256 pentru PIN |
| `server/` | API Fastify, migrații SQL, servicii (vânzări, ture, stoc, bani, inventar, rapoarte, sincronizare), date demo |
| `web/src/pos/` | Aplicația de tabletă: IndexedDB, coada offline, sincronizare, echipamente, ecrane |
| `web/src/admin/` | Panoul de administrare |
| `punte/` | Serviciul local pentru alte echipamente (terminal/imprimantă pe USB sau rețea), când nu se folosește POSLink |
| `simulare/` | Simularea în browser: serverul real pe PGlite, tableta, panoul și terminalul PAX simulat |
| `docs/` | Arhitectura, maparea cerințelor, întrebări deschise |
