# Protecția datelor personale (Legea nr. 195/2024)

Ce date personale ține POS-ul, cine răspunde de ele și documentele de care au nevoie clientul și
furnizorul. **Șabloanele de mai jos sunt un punct de plecare tehnic, nu consultanță juridică: de
verificat cu un jurist înainte de semnare.**

## 1. Legea aplicabilă

- Din **23 august 2026** se aplică **Legea nr. 195/2024 privind protecția datelor cu caracter
  personal** (adoptată la 25 iulie 2024, publicată în Monitorul Oficial la 23 august 2024, în vigoare la
  24 de luni de la publicare). Ea înlocuiește **Legea nr. 133/2011**, abrogată de la aceeași dată, și
  preia modelul Regulamentului UE 2016/679 (GDPR); inclusiv numerotarea articolelor folosite mai jos
  urmează GDPR.
- Articolele care contează aici, după ghidul CNPDCP: principiile (art. 5), temeiurile legale (art. 6),
  transparența (art. 12), informarea și drepturile persoanei vizate (art. 13–22; răspuns la o cerere în
  cel mult o lună),
  persoana împuternicită și contractul cu ea (art. 28), evidența activităților de prelucrare (art. 30),
  securitatea (art. 32), încălcarea securității datelor (art. 33–34: notificarea **CNPDCP în cel mult
  72 de ore** de la aflare, pe formularul tip aprobat de CNPDCP), responsabilul cu protecția datelor
  (art. 37–39).
- Amenzile (după o sursă secundară, de verificat în textul oficial): până la 1 000 000 lei sau 1% din
  cifra de afaceri pentru obligațiile operatorului și până la 2 000 000 lei sau 2% pentru principii,
  temeiuri și drepturile persoanelor; se aplică etapizat: 10% din cuantum în primul an (până la
  22.08.2027), 40% în al doilea, 100% din 23.08.2028.

Surse (consultate la 23.10.2026):

- Textul oficial: [legis.md, Legea nr. 195/2024](https://www.legis.md/cautare/downloadpdf/144681)
- CNPDCP, ghidul „10 pași esențiali pentru conformarea la Legea nr. 195/2024” (articolele de mai sus):
  [datepersonale.md](https://datepersonale.md/wp-content/uploads/2026/03/Legea-nr.1952024.pdf)
- Logos Press, 24.08.2026, intrarea în vigoare:
  [logos-pres.md](https://logos-pres.md/noutati/au-intrat-in-vigoare-noile-norme-privind-protectia-datelor-cu-caracter-personal/)
- Logos Press, 27.08.2026, notificarea în 72 de ore și formularul tip CNPDCP:
  [logos-pres.md](https://logos-pres.md/noutati/a-intrat-in-vigoare-notificarea-privind-incalcarea-securitatii-datelor-cu-caracter-personal/)
- Clym, rezumat (date, aplicarea etapizată a amenzilor):
  [clym.io](https://www.clym.io/regulations/law-no-195-2024-republic-of-moldova)
- ECOM, rezumat (abrogarea Legii 133/2011 și a art. 74¹–74³ din Codul contravențional, cuantumul
  amenzilor): [ecom.md](https://ecom.md/en/blog/protectia-datelor-lege-195-2024)

## 2. Ce date personale ține sistemul

Sistemul **nu are date despre clienții cafenelei** (nicio fidelizare, niciun nume, nicio adresă) și
**nu primește niciodată datele cardului** (vezi [securitate.md](securitate.md)). Persoanele vizate sunt
**angajații** clientului.

| Date | Unde | De ce |
|---|---|---|
| Numele baristelor și administratorilor, rolul, locația | `utilizatori` | cine vinde unde, cine administrează |
| Loginul administratorilor, hash-ul parolei (scrypt) | `utilizatori` | autentificarea în panou |
| Hash-ul PIN-ului baristelor (și pe tabletele locației) | `utilizatori`, tablete | atribuirea vânzărilor, offline |
| Barista pe fiecare vânzare, casare (inclusiv „consum personal”), anulare, plată măruntă | `comenzi`, `miscari_bani` | evidența banilor și a stocului |
| Ce a declarat barista la închiderea turei, diferențele față de sistem, nota adminului la verificare | `ture` | controlul gestiunii — **date despre performanța unei persoane identificate** |
| Note libere la comenzi, motivele anulărilor | `comenzi` | explicații operative |
| Copii ale evenimentelor primite de la tablete | `evenimente_sync` | sincronizare idempotentă, depanare |
| Sesiunile panoului (amprentă de token, utilizator, expirare) | `sesiuni` | autentificare |
| Acțiunile din panou și autentificările (utilizator, adresă IP, moment) | jurnalul de audit | trasabilitate, investigarea incidentelor |
| Adresele IP ale cererilor | jurnalul serverului (journald) | funcționare, securitate |
| Toate cele de mai sus | copiile de siguranță (criptate) | recuperare după dezastru |

Pe tabletă stau: lista baristelor locației (nume, hash PIN), comenzile ultimelor zile și coada de
evenimente netrimise.

## 3. Roluri

- **Operatorul** (cel care decide de ce și cum se prelucrează datele): **clientul**, angajatorul.
- **Persoana împuternicită** (art. 28): **furnizorul softului**, care instalează și operează serverul
  pentru client și are acces tehnic la date. Prelucrează doar la instrucțiunile clientului.
- **Subîmputerniciți** (îi folosește furnizorul, cu acordul clientului):

| Cine | Ce face | Ce date vede | Unde |
|---|---|---|---|
| IPHOST (Inovare-Prim SRL), VPS | găzduiește serverul și baza | toate datele de pe server (acces fizic) | Chișinău, centru de date certificat ISO 27001 |
| Stocarea copiilor (de ex. Backblaze B2, regiunea EU Central) | păstrează copiile | doar fișiere criptate cu age; nu are cheia | Amsterdam, UE (firma e din SUA) |
| healthchecks.io, serviciul de verificare HTTP | alerte | ora copiei, mărimea, numele tabletelor/locațiilor din mesajul de alertă; **nicio dată personală** dacă tabletele poartă nume de locații, nu de persoane | UE / de verificat |

- **IntelectSoft (POSLink, IS Fiscal)** primește de la server liniile bonului fiscal și plata. Contractul
  pentru casa fiscală și POSLink e al clientului, deci IntelectSoft e persoana împuternicită direct a
  clientului, nu subîmputernicitul furnizorului. De verificat dacă bonul fiscal conține numele casierului.
- **Transferul în UE** al copiilor: de verificat cu juristul regimul transferurilor din Legea 195/2024
  (statele cu nivel adecvat de protecție). Copiile sunt criptate înainte să plece, iar stocarea nu are
  cheia.
- **Responsabil cu protecția datelor**: probabil nu e obligatoriu (fără monitorizare sistematică pe
  scară largă și fără categorii speciale de date); de confirmat cu juristul. Recomandat: o persoană de
  contact desemnată la client.

## 4. Șablon: contractul cu persoana împuternicită (art. 28) — listă de verificare

> **Șablon — de verificat cu un jurist.**

Contractul (sau anexa la contractul de servicii) dintre client (operator) și furnizor (persoană
împuternicită) trebuie să cuprindă:

- [ ] **Obiectul, durata, natura și scopul** prelucrării: operarea POS-ului și a gestiunii (vânzări,
      stocuri, bani, ture) pe serverul administrat de furnizor, pe durata contractului de servicii.
- [ ] **Tipurile de date și categoriile de persoane**: secțiunea 2 (angajații clientului).
- [ ] Furnizorul prelucrează **doar pe baza instrucțiunilor documentate** ale clientului (inclusiv
      privind transferurile) și îl anunță dacă o instrucțiune i se pare ilegală.
- [ ] **Confidențialitate**: persoanele furnizorului cu acces la date s-au angajat în scris la
      confidențialitate.
- [ ] **Măsurile de securitate** (art. 32), ca anexă: [securitate.md](securitate.md) și
      [deploy/README.md](../deploy/README.md) (copii, monitorizare, rotirea secretelor).
- [ ] **Subîmputerniciții**: lista din secțiunea 3, acordul clientului pentru ea, anunțarea prealabilă a
      oricărei schimbări (cu drept de opoziție), aceleași obligații transmise mai departe prin contract.
- [ ] **Asistență la cererile angajaților** (acces, rectificare, ștergere, restricționare, opoziție): în
      cel mult 10 zile lucrătoare de la cererea clientului, ca acesta să răspundă în termenul de o lună.
- [ ] **Asistență la securitate, la evaluări de impact și la consultarea CNPDCP**.
- [ ] **Încălcarea securității datelor**: furnizorul anunță clientul **fără întârziere nejustificată, în
      cel mult 24 de ore** de când a aflat, cu informațiile din secțiunea 6, ca clientul să poată notifica
      CNPDCP în 72 de ore.
- [ ] **La încetarea contractului**: la alegerea clientului, returnarea datelor (export complet al bazei)
      și ștergerea lor de pe server; copiile de siguranță se șterg la expirarea termenului lor (cel mult
      un an), iar până atunci rămân criptate și neaccesate.
- [ ] **Audit**: furnizorul pune la dispoziție informațiile necesare și permite verificări de către client
      sau de un auditor desemnat de el.
- [ ] Persoanele de contact ale ambelor părți și răspunderea.

## 5. Șablon: evidența activităților de prelucrare (art. 30) — o pagină

> **Șablon — de verificat cu un jurist.** Îl ține clientul (operatorul); furnizorul ține o evidență
> similară, ca persoană împuternicită.

| Câmp | Conținut |
|---|---|
| Operatorul | [denumirea clientului], IDNO [ ], adresa [ ], contact [ ] |
| Persoana de contact pentru protecția datelor | [nume, telefon, e-mail] |
| Activitatea | Evidența vânzărilor, a stocurilor, a banilor și a turelor în cafenelele rețelei (sistemul POS) |
| Scopuri | atribuirea vânzărilor și a operațiunilor de casă; controlul gestiunii (discrepanțe la închiderea turei); evidența contabilă și fiscală; securitatea sistemului |
| Temeiuri (art. 6) — de stabilit cu juristul | executarea contractului de muncă; obligații legale (contabilitate, evidența fiscală); interesul legitim al angajatorului de a preveni pierderile |
| Persoane vizate | angajații: bariste, administratori, manageri |
| Categorii de date | secțiunea 2: identificare (nume, login), autentificare (hash-uri), activitate (vânzări, operațiuni, ture, discrepanțe, note), date tehnice (IP, momentul acțiunilor) |
| Destinatari | furnizorul softului (persoană împuternicită) și subîmputerniciții din secțiunea 3; IntelectSoft (casa fiscală); autoritățile, la cerere legală |
| Transferuri în afara Moldovei | copiile de siguranță, criptate, în UE (secțiunea 3) |
| Termene de păstrare | secțiunea 7 |
| Măsuri de securitate | [securitate.md](securitate.md): HTTPS, roluri și drepturi minime, jurnal de audit, copii criptate la 15 minute, monitorizare, procedura pentru tablete |

## 6. Procedura la încălcarea securității datelor (art. 33–34)

> **Șablon — de verificat cu un jurist.** Pașii tehnici detaliați: [deploy/README.md](../deploy/README.md),
> secțiunea 9.

1. **Ora 0**: cine observă (furnizorul, administratorul clientului, un angajat) anunță imediat persoana de
   contact de la furnizor și de la client. Se notează **ora la care s-a aflat**: de la ea curg termenele.
2. **În prima oră**: limitarea (conturi, tablete, secrete), păstrarea dovezilor.
3. **În cel mult 24 de ore**: furnizorul trimite clientului, în scris, notificarea de mai jos (completată
   cu ce se știe; restul se trimite pe măsură ce se află).
4. **În cel mult 72 de ore** de la aflare: **clientul** notifică CNPDCP pe formularul tip, dacă incidentul
   poate afecta drepturile angajaților (excepție: risc foarte puțin probabil, decizie documentată).
   O notificare întârziată se trimite cu motivele întârzierii.
5. **Dacă riscul e ridicat** pentru angajați (de ex. diferențele de tură ale unor persoane numite au
   ajuns public): clientul îi informează și pe ei, pe înțeles, cu ce pot face.
6. **Registrul de incidente**: orice incident se notează, inclusiv cele nenotificate (fapte, efecte,
   măsuri, decizia de notificare și motivul).

Model de notificare furnizor → client:

```
Subiect: Incident de securitate a datelor – POS [client] – [data]

1. Ce s-a întâmplat: [descriere scurtă]
2. Când: început [data, ora] (estimat); aflat de noi la [data, ora]
3. Date afectate: [categorii din inventar], aproximativ [n] persoane, [n] înregistrări
4. Consecințe probabile: [de ex. acces la numele și discrepanțele de tură ale angajaților din ...]
5. Măsuri luate: [limitare, secrete rotite, conturi dezactivate ...]
   Măsuri propuse: [...]
6. Ce știm încă nu: [...] — revenim până la [data, ora]
7. Persoana de contact: [nume, telefon, e-mail]
```

## 7. Politica de păstrare (propunere)

> **Propunere — termenele le decide clientul, cu contabilul și juristul.**

| Date | Termen propus | Cum se aplică acum |
|---|---|---|
| Vânzări, mișcări de bani și stoc, ture, bonuri (cu numele baristei) | termenul legal al documentelor contabile (de confirmat cu contabilul) | rămân în bază; după termen, anonimizare (numele înlocuite) — procedură de făcut la nevoie |
| Discrepanțele pe persoană și notele de verificare, folosite pentru evaluarea personalului | 12 luni pentru acest scop; apoi rămân doar ca parte a evidenței contabile | organizatoric: nu se folosesc mai vechi de 12 luni în evaluări |
| Contul unui angajat plecat | dezactivat în ziua plecării | din acel moment nu se mai poate autentifica, iar PIN-ul nu mai ajunge pe tablete; numele rămâne în registre (documente contabile) |
| Sesiunile panoului | 7 zile de la ultima folosire | expiră automat |
| Jurnalul serverului (cu IP-uri) | 30 de zile | automat (journald) |
| Jurnalul PostgreSQL (interogări lente, fără valorile parametrilor) | aproximativ 10 săptămâni | automat (rotația Ubuntu) |
| Jurnalul de audit (acțiuni din panou, autentificări, IP-uri) | 12 luni | propunere; curățarea se face manual sau automat când se stabilește |
| Copiile evenimentelor de la tablete (`evenimente_sync`) | 90 de zile pentru cele aplicate | propunere; de implementat curățarea |
| Copiile de siguranță | la 15 minute: o zi vizibile, 30 de zile blocate; zilnice: 31 de zile; lunare: un an | automat (regulile bucket-ului). **O dată ștearsă din bază mai poate exista în copii până la un an** |
| Datele de pe tabletă | comenzile ultimelor zile și coada netrimisă | automat |

## 8. Șablon: informarea angajaților (art. 13)

> **Șablon — de verificat cu un jurist.** Se dă fiecărui angajat la angajare (semnat de luare la
> cunoștință) și se afișează în cafenea.

**Cum folosim datele tale în sistemul de vânzare (POS)**

[Denumirea clientului] („noi”), IDNO [ ], [adresa], este operatorul datelor tale. Pentru întrebări sau
cereri: [persoana de contact, telefon, e-mail].

**Ce date:** numele tău, rolul și cafeneaua în care lucrezi; un PIN personal (păstrat doar sub formă de
cod neinversabil) sau, pentru administratori, login și parolă; vânzările, casările, anulările și plățile
mărunte pe care le înregistrezi; ce declari la închiderea turei și diferențele față de ce arată sistemul;
pentru administratori, acțiunile din panou și adresa IP de la care te conectezi.

**De ce:** ca fiecare vânzare și operațiune de casă să fie atribuită corect; ca să controlăm gestiunea
(banii și stocul) la fiecare tură; pentru evidența contabilă și fiscală; pentru securitatea sistemului.
Temeiul: contractul de muncă, obligațiile legale de evidență contabilă și interesul nostru legitim de a
preveni pierderile [de verificat cu juristul].

**Important:** o diferență la închiderea turei e un semnal de verificat împreună, nu o dovadă în sine.
PIN-ul tău e personal: nu-l spune nimănui și cere schimbarea lui dacă crezi că l-a văzut cineva — tot ce
se înregistrează cu PIN-ul tău apare pe numele tău.

**Cine mai vede datele:** furnizorul care întreține sistemul pentru noi ([denumire]), firma care
găzduiește serverul (IPHOST, Chișinău) și, criptate, stocarea copiilor de siguranță (în UE). Nu vindem și
nu dăm datele altcuiva, în afara autorităților, când legea o cere.

**Cât timp:** vânzările și operațiunile, cât cer regulile contabile ([n] ani); diferențele de tură le
folosim în evaluări cel mult 12 luni; jurnalele tehnice cu adrese IP, 30 de zile; copiile de siguranță,
până la un an.

**Drepturile tale:** să afli ce date avem despre tine și să primești o copie; să ceri corectarea lor;
ștergerea sau restricționarea, în limitele obligațiilor legale de păstrare; să te opui prelucrării
bazate pe interesul legitim. Răspundem în cel mult o lună. Poți depune o plângere la Centrul Național
pentru Protecția Datelor cu Caracter Personal (datepersonale.md).

## 9. Ce face concret fiecare parte

**Clientul (operatorul):** semnează contractul cu furnizorul (secțiunea 4); ține evidența (secțiunea 5)
și registrul de incidente; dă informarea angajaților (secțiunea 8); stabilește termenele de păstrare
(secțiunea 7); notifică CNPDCP când e cazul (secțiunea 6); dezactivează imediat conturile celor plecați.

**Furnizorul (persoana împuternicită):** aplică măsurile din [securitate.md](securitate.md) și
[deploy/README.md](../deploy/README.md); anunță clientul în 24 de ore la un incident; ajută la cererile
angajaților (export, corectare); la încetarea contractului, predă datele și le șterge.
