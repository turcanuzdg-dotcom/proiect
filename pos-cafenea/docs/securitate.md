# Modelul de securitate

Ce protejează sistemul, cum, și ce riscuri rămân. Scris pentru furnizor, pentru client și pentru oricine
face o verificare tehnică. Măsurile de operare (instalare, copii, incidente) sunt detaliate în
[deploy/README.md](../deploy/README.md); datele personale în [protectia-datelor.md](protectia-datelor.md).

## Pe scurt

- Cel mai valoros lucru din sistem e **corectitudinea registrelor de bani și de stoc** și atribuirea
  fiecărei vânzări unei baristă și unei ture. Securitatea e construită în jurul lor.
- Sistemul **nu are date despre clienții cafenelei** și **nu vede niciodată datele cardului**: cardul îl
  citește terminalul băncii.
- Datele personale sunt ale **angajaților** (nume, conturi, diferențe la închiderea turei, IP-uri în
  jurnale).
- Totul trece prin HTTPS, serverul e izolat, baza de date are roluri cu drepturi minime, iar copiile
  pleacă la 15 minute, criptate, într-o stocare din UE de unde nu pot fi șterse înainte de termen.

## Ce protejăm și de cine

| Ce | De cine / de ce |
|---|---|
| Registrele de bani și stoc, turele, discrepanțele | angajat necinstit (ascunderea unei lipse), manager necinstit, atacator cu acces la panou, greșeli |
| Conturile de administrator | ghicirea parolelor din internet, parole refolosite sau scurse |
| Tokenurile tabletelor | tabletă furată, o copie a bazei care ajunge unde nu trebuie |
| Cheia POSLink (pornește plăți și restituiri pe terminal) | scurgere din server sau din cod |
| Datele angajaților | acces neautorizat, păstrare prea lungă |
| Continuitatea vânzării | căderea internetului, a serverului, a VPS-ului |
| Copiile de siguranță | pierderea lor odată cu serverul, citirea lor de către terți, ștergerea de către un atacator |

## Măsurile, pe straturi

### Rețea și transport

- **Doar HTTPS.** Caddy obține și reînnoiește singur certificatul (Let's Encrypt), redirecționează
  `http://` spre `https://` și trimite **HSTS** pe un an, deci browserul tabletei nu mai încearcă
  niciodată varianta necriptată. Fără HTTPS aplicația nici nu se poate instala pe tabletă.
- **Serverul Node ascultă doar pe 127.0.0.1:3000**, nu pe internet. Antetul `X-Forwarded-For` (adresa
  reală a clientului) e acceptat doar de la Caddy de pe aceeași mașină (`TRUST_PROXY=loopback`), deci
  adresele din jurnale și limitarea încercărilor de login nu pot fi păcălite cu un antet fals.
- **Firewall** (ufw): din internet sunt deschise doar SSH (cu limită de conexiuni), 80 și 443.
- **PostgreSQL nu ascultă în rețea**: conexiunile trec doar prin socketul local; orice conexiune TCP e
  refuzată din `pg_hba.conf`.
- **SSH doar cu chei**, fără parole.

### În browser

- **Antete de securitate** (puse de aplicație și, a doua oară, de Caddy): `Content-Security-Policy`
  strictă (doar scripturi de pe propriul domeniu, fără scripturi inline, fără încadrare în alte site-uri),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy` (fără cameră, microfon, locație, plăți din browser). Interfața nu folosește
  `innerHTML` sau `eval`; React escapează tot textul.
- **Tokenurile circulă doar în antetul `Authorization`**, niciodată în adresă (unde ar ajunge în jurnale).
  Fluxul de notificări live (SSE), care nu poate trimite antete, folosește bilete aleatoare valabile un
  minut. Jurnalul serverului scrie adresele fără parametri.
- Tokenul panoului stă în `localStorage`: cu CSP-ul de mai sus e acceptabil și elimină din start
  atacurile de tip CSRF (browserul nu-l trimite singur).

### Autentificare

- **Administratori**: login și parolă. Parolele se păstrează doar ca hash **scrypt** cu sare, comparate
  în timp constant; un login inexistent costă la fel de mult ca unul existent, deci timpul de răspuns nu
  dezvăluie conturile. După încercări greșite repetate apar pauze tot mai lungi. Sesiunea expiră după
  7 zile de neutilizare; schimbarea parolei, dezactivarea sau retrogradarea contului închid celelalte
  sesiuni.
- **Tablete**: adminul creează tableta și primește un **cod de asociere** de 8 caractere, valabil o
  singură dată; tableta îl schimbă pe un token aleator de 192 de biți. În bază tokenurile (ale
  tabletelor și sesiunile panoului) se păstrează ca **amprentă SHA-256**, nu în clar: o copie a bazei nu
  dă acces la panou sau la tablete. O tabletă dezactivată e refuzată imediat.
- **Baristele**: PIN de 4 cifre, verificat **local pe tabletă** (ca să meargă offline). Servește la
  **atribuirea** vânzărilor, nu e o protecție puternică (vezi „Riscuri rămase”).

### Autorizare

- Rolurile sunt **admin** (panoul) și **barista** (doar prin tabletă). O tabletă poate declara doar
  bariste din locația ei, iar evenimentele ei se aplică doar locației ei.
- Puntea locală de echipamente (`punte/`, nefolosită cu terminalul PAX prin POSLink) cere un secret și
  verifică originea paginii.

### Integritatea datelor

- **Registre care nu se rescriu.** Stocul și banii sunt jurnale de mișcări (`miscari_stoc`,
  `miscari_bani`): nicio operație din aplicație nu modifică sau șterge o mișcare; o corecție e o mișcare
  nouă. Orice cifră se urmărește până la documentul care a produs-o.
- **Jurnal de audit** pentru acțiunile din panou (prețuri, rețete, toleranțe, utilizatori, tablete,
  verificarea turelor, evenimente marcate rezolvate) și pentru autentificări: cine, când, de la ce adresă.
- **Coada offline a tabletei**: fiecare operație e un eveniment cu identificator unic (UUID), salvat în
  tabletă în aceeași tranzacție cu operația. Serverul le aplică în ordine și **idempotent**: un eveniment
  primit de două ori se aplică o singură dată. De aceea, după o restaurare, tabletele pot retrimite
  liniștite ultimele 7 zile. Un eveniment pe care serverul nu-l poate aplica ajunge la admin (Setări →
  Erori de sincronizare) și nu blochează restul cozii.
- **Închiderea oarbă a turei**: barista declară ce a numărat fără să vadă cifrele sistemului;
  discrepanțele se calculează pe server și se semnalează peste pragurile din Setări.

### Baza de date: drepturi minime

| Rol PostgreSQL | Cine îl folosește | Ce poate |
|---|---|---|
| `cafenea_app` | serverul POS (utilizatorul de sistem `cafenea`, fără parolă: autentificare „peer”) | doar `SELECT`, `INSERT`, `UPDATE`, `DELETE` pe rânduri |
| `cafenea_migrari` | aplicarea migrațiilor la actualizare (parolă în `/etc/cafenea/server.env`, mod 600) | proprietarul schemei |
| `cafenea_citire` | copiile de siguranță și verificările (utilizatorul de sistem `cafenea-backup`) | doar citire |

Ce câștigăm: o eroare în aplicație sau o injecție SQL nu poate șterge tabele, schimba schema, goli
registrele cu `TRUNCATE` sau dezactiva triggerele; copiile nu pot scrie nimic.
Ce **nu** câștigăm: cine execută cod în procesul serverului (de ex. printr-o dependență npm compromisă)
vede mediul procesului, inclusiv adresa rolului proprietar. Împotriva acestui caz lucrează izolarea
procesului, dependențele minime și copiile pe care nu le poate șterge (mai jos).

### Plăți

- **Datele cardului nu ajung niciodată în sistem.** Cardul îl citește terminalul PAX (certificat de
  bancă). Serverul trimite suma la POSLink și primește doar rezultatul: aprobat/refuzat, RRN, codul de
  autorizare și identificatorul operației. Nu se păstrează numărul cardului (PAN), data expirării, CVV
  sau numele titularului.
- **Cheia API POSLink stă doar pe server** (`/etc/cafenea/server.env`); tabletele vorbesc doar cu
  serverul nostru, iar serverul cu POSLink, prin HTTPS.
- O plată cu răspuns pierdut se reia cu aceeași referință, după verificarea ultimei tranzacții de pe
  terminal, ca să nu se încaseze de două ori.

### Serverul

- Serviciul rulează ca utilizatorul fără privilegii `cafenea`, izolat de systemd: sistem de fișiere doar
  de citire (codul e al lui root), fără capabilități, fără acces la `/home`, `/dev` și la alte procese,
  doar rețea IP și socketuri locale, apeluri de sistem filtrate, memorie limitată la 1 GB, repornire
  automată.
- Pe server ajung doar dependențele de producție, exact cele din `package-lock.json`, instalate fără
  scripturi (`npm ci --omit=dev --ignore-scripts`); `npm audit` trebuie să arate 0 vulnerabilități.
- Actualizările de securitate Ubuntu se instalează singure; ceasul e sincronizat prin NTP; jurnalele se
  păstrează 30 de zile.

### Copii de siguranță

- La **15 minute**, întreaga bază, **criptată cu age** pentru cheile publice ale furnizorului și ale
  clientului; cheile private nu sunt pe server.
- Stocare S3 **în UE**, cu **versionare și Object Lock** (30 de zile); cheia de pe VPS nu are drept de
  ștergere. Un atacator care ar controla serverul poate strica baza vie, dar nu și istoria copiilor.
- Alertă dacă o copie lipsește mai mult de 45 de minute; probă de restaurare lunară.

## Riscuri rămase

Le spunem deschis, cu ce le ține în frâu.

1. **PIN-ul de 4 cifre e atribuire, nu autentificare.** Cine vede PIN-ul unei colege poate vinde în
   numele ei. Hash-urile PIN-urilor sunt pe tabletă (ca să meargă offline), iar 10 000 de combinații se
   încearcă instantaneu de oricine are datele tabletei. *În frâu*: PIN personal, schimbat la orice
   suspiciune; ecranul tabletei blocat; discrepanțele unei ture nu se folosesc singure ca dovadă într-o
   sancțiune (vezi principiul exactității în [protectia-datelor.md](protectia-datelor.md)).
2. **O tabletă furată deblocată** funcționează până e dezactivată: se pot înregistra vânzări false, se
   văd catalogul și numele baristelor din locația ei, iar vânzările ei încă netrimise se pierd. *În frâu*:
   ecran de blocare, mod kiosk, dezactivare imediată din panou ([tableta.md](tableta.md)).
3. **Plata cu cardul fără POSLink.** Când serverul sau internetul nu răspunde, terminalul se poate folosi
   separat; acele plăți nu sunt legate automat de comenzi. *În frâu*: reconcilierea zilnică a totalului
   „card” pe ture cu raportul Z al terminalului și cu extrasul băncii.
4. **Ceasul tabletei.** Momentul unei vânzări vine de la tabletă (ca să fie corect și offline). Un ceas
   greșit, sau dat înapoi intenționat, mută vânzarea în altă tură sau perioadă. Serverul respinge sau
   semnalează momentele imposibile, dar nu poate ghici o abatere mică. *În frâu*: „Data și ora
   automate” blocate pe tabletă, setările tabletei inaccesibile baristelor.
5. **Compromiterea serverului** (de ex. o dependență npm rău intenționată): procesul are acces la bază
   și la cheia POSLink. *În frâu*: izolarea procesului, actualizări, jurnalul de audit, alertele și
   copiile pe care atacatorul nu le poate șterge; la incident, serverul se reface de la zero
   ([deploy/README.md](../deploy/README.md), secțiunea 9).
6. **Furnizorul VPS-ului** are acces fizic la discul pe care stă baza necriptată. *În frâu*: furnizor din
   Moldova cu ISO 27001, contract și inclus în lista subîmputerniciților; criptarea discului n-ar ajuta
   (cheia ar sta pe aceeași mașină).
7. **Contul de administrator poate tot** și nu are încă al doilea factor (TOTP). *În frâu*: parole
   lungi, unice, din managerul de parole; puțini administratori; jurnalul de audit; revizuirea lunară.
8. **Fereastra offline.** Ce s-a vândut și nu s-a trimis încă există doar pe tabletă; resetarea tabletei
   sau ștergerea datelor din Chrome înainte de sincronizare le pierde.
9. **Datele introduse în panou** după ultima copie (cel mult 15 minute) se pot pierde la un dezastru și
   se reintroduc de mână.
10. **Un singur server.** Fără protecție specială la atacuri de blocare (DDoS) în afara celei a
    furnizorului; tabletele vând totuși offline cât serverul nu răspunde.

## Ce ține de client

- Parole lungi și unice pentru administratori, fiecare cu contul lui; dezactivarea imediată a celor
  plecați.
- PIN personal pentru fiecare barista, schimbat când cineva l-ar fi putut vedea.
- Tabletele pregătite după [tableta.md](tableta.md); anunțarea imediată a unei tablete pierdute.
- Plicul (sau managerul de parole) cu cheia privată a copiilor, păstrat separat de server.
- Verificarea discrepanțelor de tură și reconcilierea cardului cu banca.
- Notificarea CNPDCP în 72 de ore, când e cazul ([protectia-datelor.md](protectia-datelor.md)).
