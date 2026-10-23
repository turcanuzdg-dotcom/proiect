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
```

Serviciul systemd (`NODE_ENV=production` stă în unitate, nu în fișierul cu variabile: dacă fișierul
lipsește sau are o greșeală, serverul refuză să pornească în loc să pornească pe o bază goală):

```ini
# /etc/systemd/system/cafenea.service
[Service]
Environment=NODE_ENV=production
EnvironmentFile=/etc/cafenea/server.env
WorkingDirectory=/srv/cafenea/pos-cafenea
ExecStart=/usr/bin/npm start
User=cafenea
Restart=always
RestartSec=2
# Fastify nu mai primește conexiuni din clipa în care începe oprirea: nu o ținem deschisă minute întregi
# pentru o plată cu cardul în curs (toate tabletele ar fi offline). Plata întreruptă se recuperează la
# reîncercare, din LastTransaction al terminalului.
TimeoutStopSec=60
```

```bash
# /etc/cafenea/server.env (drepturi 600, proprietar root)
DATABASE_URL=postgres://cafenea_app:parola@127.0.0.1/cafenea
DATABASE_URL_MIGRARI=postgres://cafenea_migrari:alta-parola@127.0.0.1/cafenea   # opțional, vezi mai jos
ADMIN_LOGIN=admin
ADMIN_PAROLA='o parolă lungă, doar la prima pornire'
PORT=3000
```

- `npm ci`, nu `npm install`: instalează exact versiunile verificate din `package-lock.json` și nu
  le schimbă. Serverul rulează TypeScript direct, prin `tsx`, care e dependență de producție.
- Serverul servește și interfața construită (`web/dist`), deci e un singur proces.
- Cu `NODE_ENV=production`: fără `DATABASE_URL` serverul nu pornește (nu folosește baza locală
  PGlite); o bază fără administrator cere `ADMIN_PAROLA` de cel puțin 12 caractere. După prima pornire,
  scoateți `ADMIN_PAROLA` din fișier. Parolele de administrator puse din panou au tot cel puțin 12 caractere.
- Cu `NODE_ENV=production` serverul ascultă doar pe `127.0.0.1` (altă adresă: `HOST`). În fața lui stă
  **Caddy**, pe aceeași mașină, cu HTTPS (fără HTTPS tableta nu poate instala aplicația și nu poate porni
  offline). `X-Forwarded-For` e crezut doar de la proxy-ul local (`TRUST_PROXY`, implicit `loopback`);
  adresa clientului contează pentru pauzele de la login și pentru jurnalul de audit.

  ```
  pos.exemplu.md {
    reverse_proxy 127.0.0.1:3000
    header Strict-Transport-Security "max-age=31536000"
  }
  ```

- Firewall: `ufw default deny incoming && ufw limit 22/tcp && ufw allow 80,443/tcp && ufw enable`.
- Serverul pune singur antetele de securitate (Content-Security-Policy strict pe pagini, `nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Cache-Control: no-store` pe API). HSTS îl pune Caddy. CSP-ul
  lasă tableta să vorbească doar cu puntea de echipamente de pe `http://127.0.0.1:8099`.
- `/api/sanatate` verifică și baza de date (503 dacă nu răspunde în 2 s): de folosit pentru o
  verificare externă la fiecare minut (de ex. UptimeRobot sau healthchecks.io).
- Migrațiile bazei de date (`server/migrari/*.sql`) se aplică automat la pornire.
- `npm run seed` (date demo) refuză să ruleze cu `NODE_ENV=production` sau cu `DATABASE_URL`, ca
  vânzările fictive să nu ajungă în registrele reale (pentru o bază de probă: `-- --accept-baza-reala`).

### Rol separat pentru schemă (opțional)

Cu `DATABASE_URL_MIGRARI`, migrațiile se aplică printr-o conexiune scurtă cu rolul care deține
tabelele, iar serverul lucrează cu un rol care are doar drepturi pe date. Cine află parola serverului
nu poate șterge tabele și nici opri declanșatorii care țin registrele de stoc și de bani nemodificabile.
Pregătirea, o singură dată, ca administrator PostgreSQL:

```sql
CREATE ROLE cafenea_migrari LOGIN PASSWORD '...';
CREATE ROLE cafenea_app LOGIN PASSWORD '...';
CREATE DATABASE cafenea OWNER cafenea_migrari;
\c cafenea
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO cafenea_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cafenea_migrari IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cafenea_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cafenea_migrari IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cafenea_app;
```

Pentru o bază existentă, creată deja de un singur rol: `ALTER DATABASE` / `REASSIGN OWNED BY` către
`cafenea_migrari` și `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public` (plus
`USAGE, SELECT ON ALL SEQUENCES`) către `cafenea_app`.

### Ce păstrează serverul pentru securitate

- Tokenurile panoului și ale tabletelor stau în bază doar ca amprentă SHA-256: o copie a bazei nu dă
  acces. O sesiune de panou ține cel mult 30 de zile. O tabletă dezactivată își pierde tokenul;
  reactivarea dă un cod nou de asociere.
- Loginul: pauze după 5 greșeli de pe aceeași adresă (IPv6 pe /64), cel mult o încercare la 10 s pe
  un cont după 20 de greșeli din orice adrese (adresele de pe care contul a intrat deja nu sunt
  încetinite) și cel mult 2 verificări de parolă în paralel.
- **Jurnalul de audit** (Setări → Jurnal): fiecare modificare din panou (cu valoarea de dinainte, unde
  se suprascrie ceva: prețuri, rețete, toleranțe, terminale, roluri), autentificările și operațiunile
  tabletelor din afara cozii (terminal, inventariere, asociere). Nu conține parole, PIN-uri sau coduri.
  Eșecurile de login pe conturi reale se scriu câte unul; cele pe nume inexistente doar se numără, cel
  mult un rând pe minut pentru fiecare adresă, ca un val de nume inventate să nu umple tabelul (ce s-a
  numărat și nu s-a scris încă ajunge în jurnal la oprirea serverului). Răspunsul la un login greșit nu așteaptă
  scrierea în jurnal, ca timpul lui să nu arate dacă un cont există. La
  inventar se păstrează doar liniile schimbate, cu valorile de dinainte, oricât de lungă e lista.
- Registrele `miscari_stoc`, `miscari_bani` și `jurnal_audit` nu se pot modifica, șterge sau goli
  nici direct în bază (declanșatori). Jurnalul crește cu fiecare modificare; păstrarea lui pe termen
  lung se decide la copiile de siguranță.

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
