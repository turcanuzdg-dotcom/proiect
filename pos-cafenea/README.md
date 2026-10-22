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

```bash
npm install && npm run build
DATABASE_URL=postgres://utilizator:parola@gazda/cafenea \
ADMIN_LOGIN=admin ADMIN_PAROLA='o parolă lungă' \
PORT=3000 npm start
```

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

## Teste

```bash
npm test                 # logică comună, server (pe PGlite), punte
npm run typecheck
TEST_DATABASE_URL=postgres://postgres@localhost/postgres npm test   # aceleași teste pe un PostgreSQL real
```

## Structura

| Director | Ce conține |
|---|---|
| `shared/` | Tipuri și calcule comune: rețetar cu modificatori, bani, SHA-256 pentru PIN |
| `server/` | API Fastify, migrații SQL, servicii (vânzări, ture, stoc, bani, inventar, rapoarte, sincronizare), date demo |
| `web/src/pos/` | Aplicația de tabletă: IndexedDB, coada offline, sincronizare, echipamente, ecrane |
| `web/src/admin/` | Panoul de administrare |
| `punte/` | Serviciul local pentru alte echipamente (terminal/imprimantă pe USB sau rețea), când nu se folosește POSLink |
| `docs/` | Arhitectura, maparea cerințelor, întrebări deschise |
