# Serverul POS în producție: instalare, actualizări, copii, incidente

Ghid pas cu pas pentru cine pune în funcțiune și întreține serverul POS. Nu presupune experiență
anterioară cu servere: fiecare comandă e scrisă întreagă. Unde scrie `pos.domeniu.md`, puneți
domeniul real; unde scrie `IP`, adresa IP a VPS-ului.

Documente înrudite: [securitate](../docs/securitate.md) (ce protejăm și cum),
[protecția datelor](../docs/protectia-datelor.md) (Legea 195/2024, șabloane),
[procedura pentru tablete](../docs/tableta.md) (pentru client).

## Cuprins

1. [Cum arată producția](#1-cum-arată-producția)
2. [Ce vă trebuie înainte](#2-ce-vă-trebuie-înainte)
3. [Prima instalare, pas cu pas](#3-prima-instalare-pas-cu-pas)
4. [Actualizări](#4-actualizări)
5. [Copii de siguranță și restaurare](#5-copii-de-siguranță-și-restaurare)
6. [Monitorizare și alerte](#6-monitorizare-și-alerte)
7. [Rotirea secretelor](#7-rotirea-secretelor)
8. [Tabletă pierdută sau furată](#8-tabletă-pierdută-sau-furată)
9. [Incident de securitate](#9-incident-de-securitate)
10. [Verificarea lunară](#10-verificarea-lunară)
11. [Comenzi utile](#11-comenzi-utile)

## 1. Cum arată producția

```
Tablete (Chrome, PWA) ─┐                          ┌─ Node 22: serverul POS (127.0.0.1:3000)
Panou admin (browser) ─┼─ HTTPS ─▶ Caddy :443 ────┤      │ socket local
Monitorizare externă ──┘   (certificat automat)   │      ▼
                                                  └─ PostgreSQL 16 (doar local)
                                                            │ la 15 minute
                                                            ▼
                               pg_dump → age (criptare) → rclone → bucket S3 în UE (Object Lock)
```

- **VPS**: IPHOST, „VPS Launch MD” (2 vCPU, 4 GB RAM, 60 GB), centrul de date din Chișinău,
  Ubuntu 24.04. Fără copii de siguranță incluse: le facem noi (secțiunea 5).
- **Caddy** ține HTTPS-ul (Let's Encrypt, reînnoire automată), adaugă antetele de securitate și
  trimite cererile la Node. Din internet se ajunge doar la porturile 22 (SSH), 80 și 443.
- **Node** rulează ca utilizatorul de sistem `cafenea`, izolat de systemd, fără drept de scriere pe disc.
- **PostgreSQL** nu ascultă în rețea. Serverul lucrează cu rolul `cafenea_app` (doar citire/scriere de
  rânduri); schema e a rolului `cafenea_migrari`, folosit doar la actualizări.
- **Copiile** pleacă la 15 minute, criptate cu cheia publică age; cheia privată nu e pe server.

Fișierele din acest director:

| Fișier | Rol |
|---|---|
| `instaleaza.sh` | pregătește VPS-ul (o dată; se poate rula oricând din nou) |
| `actualizeaza.sh` | publică o versiune nouă (rulat pe calculatorul de dezvoltare) |
| `activeaza-versiune.sh` | partea de pe server a actualizării; și revenirea la versiunea anterioară |
| `Caddyfile` | HTTPS, antete de securitate, cache, proxy spre Node |
| `cafenea.service` | serviciul systemd al serverului POS |
| `server.env.example` | modelul pentru `/etc/cafenea/server.env` (secretele serverului) |
| `postgresql/` | `pg_hba.conf`, `pg_ident.conf` (cine se conectează), `cafenea.conf` (setări 4 GB / 2 vCPU), `baza-noua.sql`, `roluri.sql` |
| `sistem/` | SSH doar cu chei, actualizări automate, limitele jurnalului |
| `backup/` | copia la 15 minute (`backup.sh` + timer), restaurarea (`restaureaza.sh`), modelele de configurare |
| `verificari/` | verificările la 5 minute (server, disc, ceas, tablete, erori de sincronizare) |

## 2. Ce vă trebuie înainte

Conturi (la toate: parolă unică din managerul de parole și autentificare în doi pași, unde există):

- **IPHOST** (iphost.md): VPS Launch MD cu **Ubuntu 24.04**. Plata anuală e mai ieftină; cereți în scris
  confirmarea prețului la reînnoire.
- **Domeniu `.md`** (registrul nic.md, cumpărat de la un registrar acreditat) și acces la zona DNS.
  Atenție la prețul de reînnoire, nu doar la primul an.
- **Stocare S3 în UE cu Object Lock** pentru copii, de exemplu Backblaze B2, regiunea EU Central
  (Amsterdam). Alternative: Scaleway, OVHcloud, Wasabi (regiuni UE).
- **healthchecks.io** (planul gratuit ajunge: 20 de verificări) pentru alertele despre copii și server.
- **Un serviciu de verificare HTTP din exterior**: Better Stack Uptime (are plan gratuit, verificare la
  3 minute) sau UptimeRobot (planul gratuit e doar pentru uz necomercial; pentru client e nevoie de
  planul plătit). Citiți condițiile planului ales înainte.
- **Telegram** (opțional, recomandat): un grup „POS alerte” cu furnizorul și administratorul clientului.

Pe calculatorul vostru: Node.js 22, git, un client SSH (pe Windows: PowerShell sau WSL), `age`
(github.com/FiloSottile/age, pentru cheile copiilor).

## 3. Prima instalare, pas cu pas

### 3.1 Cheia SSH

Pe calculatorul vostru (o singură dată):

```bash
ssh-keygen -t ed25519 -C "nume@calculator"     # apăsați Enter la cale; puneți o parolă pe cheie
cat ~/.ssh/id_ed25519.pub                       # asta e cheia PUBLICĂ: o lipiți la IPHOST
```

La comanda VPS-ului, adăugați cheia publică (sau, dacă ați primit o parolă de root:
`ssh-copy-id root@IP`). Verificați că intrați: `ssh root@IP`.

### 3.2 DNS

În zona DNS a domeniului, o înregistrare **A**: `pos` → `IP`, cu TTL 300 (5 minute: dacă vreodată mutați
serverul, schimbarea se propagă repede). Dacă VPS-ul are și IPv6, și o înregistrare **AAAA**.
Verificare: `nslookup pos.domeniu.md` arată IP-ul VPS-ului.

### 3.3 Pregătirea serverului

De pe calculatorul vostru, din directorul `pos-cafenea/`:

```bash
scp -r deploy root@IP:
ssh root@IP
sudo bash deploy/instaleaza.sh pos.domeniu.md admin@domeniu.md
```

Al doilea argument e adresa la care Let's Encrypt trimite avertismente despre certificat. Scriptul
durează 5–10 minute și face: actualizări de sistem și actualizări automate de securitate (cu repornire
la 04:30 dacă un nucleu nou o cere), fusul orar Europe/Chisinau și sincronizarea ceasului, firewall
(intră doar SSH, 80, 443), SSH doar cu chei, utilizatorii `cafenea` și `cafenea-backup`, swap de
2 GB, Node.js 22 (NodeSource), PostgreSQL 16 (doar local, cu rolurile separate), Caddy, limitele
jurnalului (30 de zile), serviciile systemd. La final afișează pașii următori.

> **Important:** după ce scriptul dezactivează parolele SSH, **deschideți o a doua fereastră** și
> verificați că intrați cu cheia (`ssh root@IP`) înainte să o închideți pe prima.

Dacă scriptul se oprește cu o eroare, citiți mesajul, corectați și rulați-l din nou: e făcut să poată fi
rulat de mai multe ori.

### 3.4 Configurarea serverului

```bash
sudo nano /etc/cafenea/server.env
```

- `ADMIN_PAROLA`: parola contului de administrator, generată în managerul de parole (minimum 12
  caractere). E folosită o singură dată, la prima pornire.
- `POSLINK_API_KEY`: cheia din cabinetul POSLink (Intelectsoft). Fără ea, plata cu cardul prin
  terminal nu merge.
- Restul e deja completat (inclusiv parola rolului de migrații, generată de script).

Salvați cu Ctrl+O, Enter, ieșiți cu Ctrl+X.

### 3.5 Prima versiune

Pe calculatorul vostru, din `pos-cafenea/` (codul trebuie să fie comis în git):

```bash
bash deploy/actualizeaza.sh root@IP
```

Scriptul rulează testele, construiește interfața, o trimite pe server și pornește serviciul. La final
trebuie să vedeți „Serverul răspunde la /api/sanatate” și „https://pos.domeniu.md răspunde”. Dacă
HTTPS nu răspunde încă, DNS-ul nu s-a propagat sau certificatul nu e emis: așteptați câteva minute și
verificați `sudo journalctl -u caddy -n 30`.

### 3.6 Primul login și ștergerea parolei inițiale

1. Deschideți `https://pos.domeniu.md/admin.html` și intrați cu `admin` și parola din `ADMIN_PAROLA`.
2. Pe server ștergeți valoarea: `sudo nano /etc/cafenea/server.env` → `ADMIN_PAROLA=` (gol), apoi
   `sudo systemctl restart cafenea`. Contul rămâne; parola nu mai stă în fișier.

### 3.7 Configurarea rețelei de cafenele

În panou: Setări → Locații (depozitul și cafenelele), Utilizatori (bariste cu PIN, doar pentru locația
lor), Tablete (câte una pentru fiecare tabletă, cu `DeviceID`-ul terminalului PAX din cabinetul
POSLink), Terminal fiscal, Toleranțe. Tabletele se pregătesc după [docs/tableta.md](../docs/tableta.md).

### 3.8 Copiile de siguranță și verificările

**Obligatoriu înainte de prima zi de vânzări**: secțiunile 5.2 și 6. Apoi rulați din nou
`sudo bash /opt/cafenea/curent/deploy/instaleaza.sh`, care pornește timerele, și faceți prima probă de
restaurare (5.5).

### 3.9 Lista de verificare înainte de pilot

- [ ] `https://pos.domeniu.md/admin.html` se deschide cu lacăt; `http://` redirecționează spre `https://`.
- [ ] `ssh -o PubkeyAuthentication=no root@IP` e refuzat (parolele SSH sunt oprite).
- [ ] `curl -m 5 http://IP:3000/api/sanatate` de pe calculatorul vostru **nu** răspunde (Node e doar local).
- [ ] `ADMIN_PAROLA` e gol în `/etc/cafenea/server.env`; `sudo ls -l /etc/cafenea` arată `-rw-------` la fișierele `.env`.
- [ ] O copie de siguranță a ajuns în bucket, iar healthchecks.io arată „up” pentru `cafenea-backup`.
- [ ] Proba de restaurare a reușit și e trecută în jurnal (5.5).
- [ ] Verificarea externă a `/api/sanatate` e configurată și ați primit o alertă de test.
- [ ] Clientul are cheia privată age în plic sigilat / în managerul lui de parole (5.2).
- [ ] Clientul a primit documentele din [protectia-datelor.md](../docs/protectia-datelor.md) și
      procedura pentru tablete.
- [ ] O plată cu cardul de test, un bon fiscal și un raport X pe terminalul real (cu Intelectsoft).

## 4. Actualizări

### 4.1 O versiune nouă a POS-ului

Pe calculatorul de dezvoltare, cu codul comis:

```bash
bash deploy/actualizeaza.sh root@pos.domeniu.md
```

Ce se întâmplă, în ordine:

1. **Local**: refuză dacă aveți modificări necomise; `npm ci` (exact versiunile din
   `package-lock.json`); `npm run typecheck` și `npm test`; `npm run build`; arhiva cu fișierele din git
   și `web/dist`.
2. **Pe server** (`activeaza-versiune.sh`): despachetează în `/opt/cafenea/versiuni/<versiune>`
   (fișiere ale lui root, serviciul doar le citește); `npm ci --omit=dev --ignore-scripts` (doar
   dependențele de producție, fără scripturi de instalare); **o copie de siguranță chiar atunci**;
   comută `/opt/cafenea/curent` pe versiunea nouă și repornește serviciul. La pornire serverul aplică
   migrațiile noi ale bazei cu rolul `cafenea_migrari`. Apoi verifică `/api/sanatate` (90 de secunde)
   și reaplică drepturile rolurilor.
3. Dacă versiunea nouă nu răspunde, **revine singur** la cea anterioară și afișează jurnalul.

Faceți actualizările în afara orelor de vârf: repornirea durează câteva secunde, timp în care tabletele
lucrează offline, iar o plată cu cardul pornită exact atunci trebuie reîncercată la tejghea.

Dacă la final scrie „Fișierele din deploy/ s-au schimbat”, rulați și
`sudo bash /opt/cafenea/curent/deploy/instaleaza.sh` (aplică noile setări de sistem).

### 4.2 Revenire la versiunea anterioară

```bash
sudo bash /opt/cafenea/curent/deploy/activeaza-versiune.sh --revino
```

Codul vechi rulează pe schema bazei așa cum a lăsat-o versiunea nouă. Migrațiile proiectului doar
adaugă (tabele, coloane, indexuri), deci de regulă codul vechi merge. Dacă nu merge și problema e
gravă, ultima soluție e restaurarea copiei făcute automat chiar înainte de actualizare (5.6): se pierde
ce s-a introdus în panou după actualizare, iar tabletele retrimit ce au vândut.

### 4.3 Actualizările de sistem

- Actualizările de **securitate** Ubuntu (inclusiv PostgreSQL) se instalează singure, zilnic; dacă e
  nevoie de repornire, serverul repornește la 04:30. Schimbați ora în
  `/etc/apt/apt.conf.d/52cafenea-unattended-upgrades` dacă vreo cafenea lucrează noaptea.
- **Node.js** (NodeSource) și **Caddy** se actualizează la verificarea lunară:
  `sudo apt update && sudo apt upgrade`, apoi `sudo systemctl restart cafenea`.

## 5. Copii de siguranță și restaurare

### 5.1 Cum funcționează și ce se poate pierde

- La fiecare 15 minute, `cafenea-backup.timer` rulează `backup.sh`: `pg_dump` al întregii baze, criptat
  pe loc cu **age** pentru cheile publice din `/etc/cafenea/backup-destinatari.txt`, trimis cu **rclone**
  într-un bucket S3 din UE. Nimic necriptat nu e scris pe disc și nimic necriptat nu iese de pe server.
- Prima copie din fiecare zi se mai păstrează în `zilnic/`, prima din fiecare lună în `lunar/`.
- Cheia S3 de pe VPS **nu are drept de ștergere**. Bucket-ul are **versionare și Object Lock**
  (30 de zile): nicio versiune nu poate fi ștearsă înainte de termen, nici de un atacator care ar
  controla VPS-ul, nici de o greșeală.
- Cheile **private** age stau doar offline (managerul de parole al furnizorului și plicul sigilat sau
  managerul de parole al clientului). Fără ele, copiile sunt inutilizabile pentru oricine, inclusiv
  pentru furnizorul de stocare.
- După fiecare copie reușită (și numai atunci) se anunță healthchecks.io. Dacă anunțul lipsește 45 de
  minute, vine alerta.

**RPO** (cât se poate pierde):

- Date intrate prin tabletă (vânzări, plăți, casări, anulări, plăți mărunte, deschideri și închideri
  de tură): **practic nimic**. Pe server, cel mult 15 minute de la ultima copie; restul îl retrimit
  tabletele cu „Retrimite evenimentele din ultimele 7 zile”, iar serverul recunoaște după identificator
  ce avea deja, deci nimic nu se dublează.
- Date introduse în panou (recepții, transferuri, operațiuni de casă, modificări de rețetar și prețuri,
  utilizatori): **cel mult 15 minute**, care se reintroduc de mână.

**RTO** (în cât timp merge din nou):

| Ce s-a întâmplat | Ce faceți | Durata estimată |
|---|---|---|
| Serverul Node sau PostgreSQL s-a oprit | nimic: systemd le repornește | secunde |
| Baza e stricată (greșeală, migrație ratată), VPS-ul e bun | `restaureaza.sh productie ultima` (5.6) | 15–30 de minute |
| VPS-ul s-a pierdut | VPS nou, `instaleaza.sh`, `actualizeaza.sh`, `restaureaza.sh productie`, DNS spre IP-ul nou | 1–2 ore în program de lucru (cel mai mult durează comanda VPS-ului și DNS-ul) |

În tot acest timp cafenelele vând în continuare: tabletele lucrează offline. Plata cu cardul prin
server nu merge; terminalul PAX se poate folosi separat, iar plățile se reconciliază după (vezi
[securitate](../docs/securitate.md), „Riscuri rămase”).

### 5.2 Configurarea (o singură dată)

**a) Cheile age**, pe calculatorul vostru, NU pe VPS:

```bash
age-keygen -o cafenea-copii-furnizor.key     # afișează „Public key: age1...”
```

Clientul face la fel pe calculatorul lui (sau îl ajutați și îi dați fișierul imediat, fără să păstrați
copie). Cheia privată (`AGE-SECRET-KEY-1...`) intră în managerul de parole; varianta clientului se poate
și tipări și pune în plic sigilat, la sediu. Ștergeți apoi fișierele `.key` de pe disc.

Pe server, cheile **publice** (câte una pe rând):

```bash
sudo nano /etc/cafenea/backup-destinatari.txt
```

**b) Bucket-ul** (exemplu Backblaze B2; la alți furnizori pașii sunt echivalenți):

1. Buckets → Create a Bucket: nume unic (de ex. `cafenea-copii-<client>`), **Private**, **Default
   Encryption: Enable**, **Object Lock: Enable** (activați-l acum, la creare; la unii furnizori nu se
   mai poate activa după).
2. În setările bucket-ului, Object Lock → retenție implicită **30 de zile**. Modul „Compliance” nu poate
   fi ocolit nici de contul principal; „Governance” poate fi ocolit de un cont cu drept special.
   Recomandat: Compliance, 30 de zile.
3. Lifecycle Settings → reguli personalizate (un fișier „ascuns” rămâne ca versiune până expiră
   Object Lock, apoi se șterge):

   | Prefix | Ascunde după (zile) | Șterge versiunile ascunse după (zile) | Ce rămâne vizibil |
   |---|---|---|---|
   | `sfert/` | 1 | 1 | ultimele ~96 de copii (o zi) |
   | `zilnic/` | 31 | 1 | 30 de copii zilnice |
   | `lunar/` | 366 | 1 | 12 copii lunare |

4. Cheia de aplicație pentru VPS, **fără drept de ștergere**. Interfața web oferă doar „Read and
   Write” (care include ștergerea), deci cheia se creează cu unealta `b2` (`pip install b2`), logați cu
   cheia principală, pe calculatorul vostru:

   ```bash
   b2 account authorize                      # cheia principală (master), doar acum
   b2 key create --bucket cafenea-copii-<client> cafenea-vps listBuckets,listFiles,readFiles,writeFiles
   ```

   (În versiunile mai vechi ale uneltei comanda e `b2 create-key --bucket ... cafenea-vps ...`.)
   Notați `keyID` și `applicationKey`. Verificați cu `b2 key list --long` că `cafenea-vps` **nu** are
   `deleteFiles`.

**c) Fișierul de configurare**:

```bash
sudo nano /etc/cafenea/backup.env
```

`COPII_DESTINATIE=copii:cafenea-copii-<client>`, `ACCESS_KEY_ID` = keyID, `SECRET_ACCESS_KEY` =
applicationKey, `ENDPOINT` și `REGION` din pagina bucket-ului (B2 arată „Endpoint”, de ex.
`s3.eu-central-003.backblazeb2.com`), `PING_URL` din healthchecks.io (6.1).

**d) Pornirea și prima copie**:

```bash
sudo bash /opt/cafenea/curent/deploy/instaleaza.sh      # pornește cafenea-backup.timer
sudo systemctl start cafenea-backup.service             # o copie acum
sudo journalctl -u cafenea-backup -n 20                 # trebuie: „Copie trimisă: cafenea-....dump.age”
systemctl list-timers 'cafenea-*'                       # următoarele rulări
```

În interfața B2, fișierul apare în `sfert/AAAA/LL/ZZ/`, cu Object Lock până la data de peste 30 de zile.

### 5.3 Ce conține o copie

Toată baza `cafenea`: catalog, rețete, stocuri, bani, ture, comenzi, utilizatori (cu hash-urile
parolelor și PIN-urilor), tablete, jurnalele de sincronizare. Formatul e `pg_dump --format=custom`,
criptat cu age. Fișierele de configurare din `/etc/cafenea` **nu** sunt în copie: păstrați în managerul
de parole `ADMIN_LOGIN`, cheia POSLink și cheile S3.

### 5.4 Restaurarea: `restaureaza.sh`

```bash
sudo /usr/local/lib/cafenea/restaureaza.sh proba ultima          # probă, nu atinge producția
sudo /usr/local/lib/cafenea/restaureaza.sh productie ultima      # înlocuiește baza (dezastru)
```

În loc de `ultima` se poate da calea unui fișier `.dump.age` descărcat. Scriptul cere cheia privată
(lipiți `AGE-SECRET-KEY-1...`; nu apare pe ecran), o ține doar în memorie și o șterge la final.
Verifică întâi că acea copie se poate decripta, abia apoi atinge vreo bază.

### 5.5 Proba lunară de restaurare

O copie pe care n-ați restaurat-o niciodată nu e o copie. O dată pe lună (și după orice schimbare la
copii):

```bash
ssh root@pos.domeniu.md
sudo /usr/local/lib/cafenea/restaureaza.sh proba ultima
```

Scriptul descarcă cea mai nouă copie, o restaurează într-o bază temporară `cafenea_proba_...`, afișează
ce conține (migrațiile, numărul de comenzi, ultima comandă, soldurile de numerar pe locații) și șterge
baza temporară. Verificați că „ultima_comanda” e de azi (dacă s-a vândut azi) și că soldurile seamănă cu
cele din panou. Ultimul rând („Proba de restaurare REUȘITĂ — ...”) îl treceți în jurnal:

| Data | Copia | Durata | Rezultat | Cine |
|---|---|---|---|---|
| | | | | |

Proba se poate face și pe laptop (PostgreSQL 16, age și rclone instalate, `backup.env` copiat temporar
și apoi șters): `PASTREAZA=1` lasă baza temporară pentru inspecție.

### 5.6 Restaurarea în producție (dezastru)

1. Anunțați cafenelele: tabletele lucrează offline câteva minute; nu ștergeți nimic de pe ele.
2. Pe un VPS nou: secțiunile 3.3–3.5 (cu `ADMIN_PAROLA` completat temporar dacă e nevoie), apoi
   `backup.env` și cheile publice (5.2 c).
3. `sudo /usr/local/lib/cafenea/restaureaza.sh productie ultima` și scrieți `RESTAUREZ` când vi se cere.
   Pe același VPS, baza stricată nu se șterge: devine `cafenea_inainte_<data>`.
4. DNS: înregistrarea A spre IP-ul nou (dacă s-a schimbat).
5. Pe **fiecare tabletă**: meniul POS → **„Retrimite evenimentele din ultimele 7 zile”**. Ce exista deja
   pe server e recunoscut după identificator și nu se dublează; ce lipsea (tot ce s-a făcut după copie)
   intră acum.
6. În panou: ultimele ture, soldurile de numerar, Setări → Erori de sincronizare. Reintroduceți ce s-a
   făcut în panou după ora copiei.
7. Dacă restaurarea urmează unui incident de securitate: secțiunea 9 (rotirea tuturor secretelor).

## 6. Monitorizare și alerte

### 6.1 healthchecks.io: copiile și verificările de pe server

Creați un proiect „POS cafenea” și două verificări:

| Nume | Perioadă | Toleranță | Pe server |
|---|---|---|---|
| `cafenea-backup` | 15 minute | 30 de minute | `PING_URL` în `/etc/cafenea/backup.env` |
| `cafenea-verificari` | 5 minute | 10 minute | `PING_URL_VERIFICARI` în `/etc/cafenea/verificari.env` |

Integrations: e-mail (furnizorul și administratorul clientului) și Telegram (în grupul „POS alerte”
adăugați `@HealthchecksBot`, trimiteți `/start` și urmați linkul primit).

`cafenea-verificari` rulează la 5 minute pe server (`verificari/verificari.sh`) și raportează eșec, cu
lista problemelor, când: serverul POS nu răspunde sau răspunde 503 (baza de date nu răspunde); discul e
plin peste 80%; ceasul nu e sincronizat; există evenimente respinse în „Erori de sincronizare”; o tabletă
activă nu s-a sincronizat de peste 2 ore în programul cafenelelor (`ORE_LUCRU`). Dacă VPS-ul cade complet,
anunțurile încetează și healthchecks.io alertează după toleranță.

După completarea `verificari.env`: `sudo bash /opt/cafenea/curent/deploy/instaleaza.sh` (pornește
timerul) și `sudo systemctl start cafenea-verificari.service`.

### 6.2 Verificarea din exterior: `https://pos.domeniu.md/api/sanatate`

Verificările de pe server nu văd problemele de DNS, de certificat sau de rețea. În Better Stack (sau
UptimeRobot): monitor HTTP(S) pe `https://pos.domeniu.md/api/sanatate`, la 3–5 minute, alertă dacă
răspunsul nu e 200 de două ori la rând. `/api/sanatate` întoarce 503 când baza de date nu răspunde, deci
aceeași alertă acoperă și PostgreSQL. Activați și alerta de expirare a certificatului (14 zile).
Alerte: e-mail; Telegram dacă planul ales îl include.

Faceți un test: `sudo systemctl stop cafenea`, așteptați alertele (extern + healthchecks),
`sudo systemctl start cafenea`.

## 7. Rotirea secretelor

Când: imediat ce pleacă cineva care a avut acces, la orice suspiciune și oricum o dată pe an.

| Secret | Unde stă | Cum se schimbă |
|---|---|---|
| Parola unui administrator | baza (hash scrypt) | Panou → Setări → Utilizatori → parolă nouă (celelalte sesiuni ale contului se închid) |
| Parola rolului `cafenea_migrari` | `/etc/cafenea/server.env` + PostgreSQL | `openssl rand -hex 24`, înlocuiți-o în `DATABASE_URL_MIGRARI`, apoi `sudo bash /opt/cafenea/curent/deploy/instaleaza.sh` (o aplică în PostgreSQL) și `sudo systemctl restart cafenea` |
| Cheia POSLink | `server.env` | cheie nouă în cabinetul POSLink → `POSLINK_API_KEY` → `sudo systemctl restart cafenea` → o plată de test → revocați cheia veche |
| Cheia S3 a VPS-ului | `backup.env` | cheie nouă (5.2 b, pasul 4) → `backup.env` → `sudo systemctl start cafenea-backup.service` → `b2 key delete <keyID vechi>` |
| Cheile age | offline (+ cele publice pe server) | pereche nouă (5.2 a) → înlocuiți cheia publică în `backup-destinatari.txt`. **Păstrați cheia privată veche** până expiră toate copiile făcute cu ea (cele lunare: un an) |
| Tokenurile tabletelor | baza (amprentă) | Panou → Setări → Tablete → „Cod nou” pentru fiecare, apoi reasociere pe tabletă |
| PIN-urile baristelor | baza (hash) | Panou → Setări → Utilizatori |
| Cheile SSH | `~/.ssh/authorized_keys` pe VPS | ștergeți rândul persoanei care pleacă: `sudo nano /root/.ssh/authorized_keys` |
| Adresele healthchecks.io | `backup.env`, `verificari.env` | nu sunt secrete critice; la nevoie „Regenerate URL” și actualizați fișierul |

## 8. Tabletă pierdută sau furată

Imediat ce aflați (clientul are această procedură și în [docs/tableta.md](../docs/tableta.md)):

1. Panou → Setări → Tablete → **Dezactivează** pe tableta respectivă. Din acel moment serverul refuză
   orice cerere cu tokenul ei: nu mai poate trimite vânzări, nu mai poate porni plăți pe terminal și nu
   mai primește catalogul.
2. Apăsați și **Cod nou** pe aceeași tabletă: tokenul vechi e șters definitiv, deci nici o reactivare
   din greșeală nu-l mai readuce la viață.
3. Ce era pe tabletă și încă netrimis (vânzări offline) se pierde odată cu ea; verificați tura
   respectivă în panou și notați diferența.
4. Dacă tableta era deblocată (fără ecran de blocare), cine o are vede catalogul și numele baristelor
   din locația ei; PIN-urile se schimbă din prudență (Setări → Utilizatori).
5. Pentru tableta nouă: Setări → Tablete → Tabletă nouă (sau „Reactivează” + „Cod nou” pe cea veche,
   dacă a fost găsită), apoi asociere pe tabletă cu codul afișat.
6. Notați întâmplarea în registrul de incidente (9.3); de regulă nu e o încălcare de notificat, dar
   decizia o ia clientul.

## 9. Incident de securitate

Exemple: cineva a intrat în panou fără drept, o parolă de administrator a ajuns pe chat, serverul se
comportă ciudat (procese necunoscute, fișiere modificate), o copie a bazei a ajuns unde nu trebuia, o
cheie POSLink sau S3 s-a scurs.

### 9.1 Cine face ce

| Cine | Ce face |
|---|---|
| **Furnizorul** (operează serverul; persoana împuternicită) | confirmă și limitează incidentul, păstrează dovezile, investighează, repară, **anunță clientul în cel mult 24 de ore** de când a aflat, în scris |
| **Clientul** (operatorul de date) | decide dacă incidentul trebuie notificat la **CNPDCP** și o face în **72 de ore** de când a aflat (formularul tip CNPDCP); dacă riscul pentru angajați e mare, îi informează și pe ei |
| Administratorul de la client | primul care poate dezactiva conturi și tablete din panou; e contactul pentru furnizor |
| Intelectsoft / banca | dacă e implicată plata cu cardul sau terminalul (cheia POSLink, tranzacții suspecte) |

Contactele (de completat și ținut la zi, tipărite la client și în managerul de parole al furnizorului):
furnizor — telefon, e-mail; administratorul clientului — telefon, e-mail; Intelectsoft
+373 22 835 312; CNPDCP — datepersonale.md.

### 9.2 Pașii

1. **Limitare (în prima oră)**: schimbați parola contului afectat (închide sesiunile lui); dezactivați
   tabletele sau conturile suspecte; rotiți secretul scurs (secțiunea 7). Dacă serverul pare compromis:
   nu-l ștergeți; opriți doar accesul (`sudo ufw deny 443/tcp && sudo ufw deny 80/tcp` dacă e nevoie;
   tabletele vând offline).
2. **Dovezi**: înainte de orice reparație, salvați jurnalele în afara serverului:
   `sudo journalctl --since "-7 days" > incident-$(date +%F).log`, `sudo cp /var/log/postgresql/*.log .`,
   lista utilizatorilor și a sesiunilor din panou. Notați ora la care ați aflat (de la ea curg termenele).
3. **Evaluare**: ce date (vezi inventarul din [protectia-datelor.md](../docs/protectia-datelor.md)),
   câte persoane, de când, dacă datele erau criptate (copiile sunt; baza de pe server nu).
4. **Anunțarea clientului (≤ 24 h)**, în scris: ce s-a întâmplat și când; ce categorii de date și câte
   persoane; consecințele probabile; ce s-a făcut deja și ce urmează; persoana de contact. Folosiți
   modelul din [protectia-datelor.md](../docs/protectia-datelor.md), „Procedura la încălcarea
   securității datelor”.
5. **Recuperare**: la un server compromis, nu se „curăță”: VPS nou de la zero (3.3–3.5), restaurare din
   ultima copie de **dinaintea** compromiterii (5.6), rotirea **tuturor** secretelor (7), reasocierea
   tabletelor.
6. **După**: o notă scurtă (ce s-a întâmplat, de ce, ce schimbăm) în registrul de incidente.

### 9.3 Registrul de incidente

Orice incident se notează, și cele care nu se notifică la CNPDCP: data aflării, descrierea, datele și
persoanele afectate, măsurile, dacă s-a notificat și de ce (nu). Îl ține clientul; furnizorul îi trimite
informațiile.

## 10. Verificarea lunară

Durează aproximativ 30 de minute. Notați data și cine a făcut-o.

- [ ] **Proba de restaurare** (5.5) și rândul în jurnal.
- [ ] healthchecks.io: `cafenea-backup` și `cafenea-verificari` „up”; în bucket există copii în
      `sfert/` de azi, în `zilnic/` și în `lunar/`.
- [ ] Actualizări: `sudo apt update && apt list --upgradable`, apoi `sudo apt upgrade`,
      `sudo systemctl restart cafenea`. Dacă există `/var/run/reboot-required`: `sudo reboot` în afara
      programului.
- [ ] Dependențele aplicației: pe calculatorul de dezvoltare `npm audit --omit=dev` (0 vulnerabilități);
      altfel, o versiune nouă.
- [ ] Spațiu: `df -h /` (sub 70%); `sudo du -sh /var/lib/postgresql`.
- [ ] Jurnale: `sudo journalctl -u cafenea -p warning --since "-30 days" | tail -50`; interogările lente:
      `sudo tail -50 /var/log/postgresql/postgresql-16-main.log`.
- [ ] Panou: Setări → Erori de sincronizare goală; Setări → Tablete: toate sincronizate recent, cele
      nefolosite dezactivate.
- [ ] Utilizatori: angajații plecați dezactivați; administratorii sunt doar cei care trebuie.
- [ ] SSH: în `/root/.ssh/authorized_keys` (și `/home/*/.ssh/`) sunt doar cheile actuale;
      `sudo sshd -T | grep -i passwordauthentication` arată `no`; `sudo ufw status` arată doar 22, 80, 443.
- [ ] Ceasul: `timedatectl` arată „System clock synchronized: yes”.
- [ ] Certificatul: monitorul extern nu avertizează (Caddy îl reînnoiește singur cu ~30 de zile înainte).
- [ ] Plăți: domeniul `.md` și VPS-ul nu expiră în următoarele 60 de zile; factura IPHOST e plătită.

## 11. Comenzi utile

```bash
sudo systemctl status cafenea                    # starea serverului POS
sudo journalctl -u cafenea -f                    # jurnalul în timp real (Ctrl+C iese)
sudo systemctl restart cafenea                   # repornire
curl -s http://127.0.0.1:3000/api/sanatate       # sănătatea, direct pe server
systemctl list-timers 'cafenea-*'                # când rulează copiile și verificările
sudo journalctl -u cafenea-backup -n 20          # ultimele copii
sudo -u postgres psql -d cafenea                 # consola bazei (\q iese) — doar citiți, nu modificați registrele
sudo systemd-analyze security cafenea            # cât de izolat e serviciul
readlink /opt/cafenea/curent /opt/cafenea/anterior   # versiunea curentă și cea anterioară
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```
