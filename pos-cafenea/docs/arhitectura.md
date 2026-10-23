# Arhitectura și acoperirea caietului de sarcini

## Pe scurt

```mermaid
flowchart LR
  subgraph Cafenea
    T[Tableta POS<br/>pos.html + IndexedDB] -- HTTP local --> P[Puntea<br/>punte/]
    P --> TP[Terminal de plată]
    P --> IF[Imprimantă fiscală]
  end
  T -- "coada offline → /api/pos/sync" --> S[Server<br/>Fastify]
  A[Panou admin<br/>admin.html] -- "API + notificări live (SSE)" --> S
  S --> DB[(PostgreSQL)]
```

- **Un singur server** (Node.js + Fastify) cu PostgreSQL. Servește API-ul și interfața.
- **POS-ul e o aplicație web instalabilă (PWA)**: un service worker păstrează aplicația în tabletă,
  iar datele de lucru stau în IndexedDB. Nu depinde de internet ca să vândă.
- **Stocul și banii sunt registre**: fiecare vânzare, casare, recepție, transfer sau inventariere
  scrie mișcări (`miscari_stoc`, `miscari_bani`). Stocul scriptic e suma mișcărilor; nimic nu se
  suprascrie, deci orice cifră se poate urmări până la documentul care a produs-o (fișa articolului).

## Cum e acoperită fiecare cerință

| Cerința clientului | Cum e rezolvată | Stare |
|---|---|---|
| **1. Două module sincronizate în timp real** | POS (`web/src/pos`) și panou (`web/src/admin`) pe același API. Panoul primește notificări prin SSE (`/api/flux`) și se reîmprospătează singur la fiecare vânzare. | gata |
| **2. Trimiterea sumei la terminal, bon tipărit direct** | Terminalul clientului e un **PAX A930** (Android) cu softul fiscal IntelectSoft și acceptare Moldindconbank, în „regim fiscal”: același aparat încasează cardul și tipărește bonul fiscal. Integrarea se face prin **POSLink** (API REST Intelectsoft, gratuit pentru terminalele în regim fiscal), din server: `server/src/servicii/poslink.ts` + `terminal.ts`. Tableta trimite suma, serverul o pune pe terminal și așteaptă aprobarea (până la 5 minute); dacă răspunsul se pierde, verifică „ultima tranzacție” ca să nu încaseze de două ori; apoi trimite bonul fiscal cu liniile, cota TVA pe produs și plata (numerar cu rest, sau card cu RRN). Raportul Z și închiderea zilei bancare, la închiderea turei. Dacă imprimanta/terminalul nu răspunde, vânzarea rămâne salvată și bonul se poate emite din Istoric. | gata, testat pe un POSLink simulat; **de validat în mediul de test Intelectsoft** |
| Numerar cu afișare rest | Dialog cu sume rapide (exact, 50, 100, 200…) și restul afișat mare. | gata |
| Card | Suma pleacă automat la terminal (POSLink `payment/Pay`), cu aceeași referință la fiecare reîncercare; refuzul se poate reîncerca. Fiecare plată și fiecare retur rămân în registrul `operatiuni_terminal`: o plată aprobată nu se mai trimite a doua oară, iar o vânzare pe card fără plată aprobată e marcată „card neconfirmat”. La pilotul fără POSLink: „terminal separat”, suma se tastează pe terminal și tableta amintește bonul fiscal. | gata |
| Casare fără încasare (protocol, degustări, personal, rebut) | Buton separat; motiv obligatoriu, notă opțională. Scade ingredientele, nu introduce bani, nu emite bon fiscal. | gata |
| Descărcare automată pe rețetar, cu „Lapte de ovăz” și „Extra shot” | `shared/src/calcul.ts`: rețetă + modificatori. Un modificator poate **înlocui** un ingredient (lapte → lapte de ovăz, în cantitatea din rețeta produsului) și/sau **adăuga/scădea** (extra shot +9 g cafea și +1 doză; fără zahăr −1 plic). Costul ingredientelor se salvează pe fiecare linie vândută. | gata, testat |
| **3. Închiderea turei** (doze râșniță, numerar, total card, retururi/casări) | Fereastră „oarbă”: barista introduce ce a numărat fără să vadă cifrele sistemului. Serverul calculează scripticul (numerar din registru, card din tranzacții, doze din rețetar, anulări și casări din comenzi), salvează diferențele și marchează tura pentru admin peste pragurile din Setări → Toleranțe. Adminul o marchează „verificată” cu o notă. | gata, testat |
| Calcul automat al discrepanțelor | Idem; în plus se verifică și fondul de casă la deschiderea turei (bani dispăruți între ture). | gata |
| **4. Multi-locație: depozit central + puncte de vânzare** | Fiecare locație e o gestiune separată (stoc și bani). Recepțiile (facturi de achiziție) intră de regulă în depozit și recalculează costul mediu ponderat. | gata |
| Evidența banilor pe locație | Registru de numerar pe locație: încasări, restituiri, plăți mărunte (din POS sau din panou), depuneri/ridicări, alimentări, diferențe la numărare. Cardul e urmărit pe ture și perioade. | gata |
| Transferuri interne | Un document scade din sursă și adaugă în destinație în aceeași tranzacție; avertizează dacă sursa nu are destul. | gata |
| **5. Inventariere pe tabletă, în timp real** | Din meniul POS. Raportul Scriptic / Faptic / Diferență / Valoare apare pe loc. Scripticul articolelor nenumărate se actualizează la fiecare vânzare; un articol numărat e comparat cu stocul **din momentul numărării**, deci vânzările făcute între timp nu strică diferența. La finalizare, stocul se aliniază. | gata, testat |
| **6. Offline cel puțin 24 h** | Vânzările, plățile, casările, anulările, plățile mărunte și închiderea turei se scriu întâi în IndexedDB, în aceeași tranzacție cu coada de trimis. La reconectare coada pleacă în ordine. Fiecare eveniment are un UUID creat pe tabletă, deci retrimiterea nu dublează nimic. Un eveniment pe care serverul nu-l poate aplica e păstrat pentru admin (Setări → Erori sincronizare) și nu blochează restul cozii. Momentul real al vânzării e cel de pe tabletă, deci rapoartele și stocul rămân corecte chiar dacă datele ajung a doua zi. | gata, testat în browser cu rețeaua tăiată |
| **7. Rapoarte: comparare perioade** | Oricare două intervale, pe produs sau pe categorie, cu diferența absolută și procentuală (de ex. Iced Coffee iulie vs. august). | gata |
| Profitabilitate pe produs/categorie | Încasări, cost ingrediente (la costul din momentul vânzării), marjă și marjă %. | gata |
| Consum total de materie primă | Pe locație și articol, în kg / l / buc, separat vânzări / casări, cu valoare. | gata |
| Pierderi și casări | Casări pe motive și pe produse, anulări cu ingrediente pierdute, minusuri și plusuri la inventar, diferențe de casă. | gata |

## Decizii de proiectare

- **Închidere oarbă a turei.** Dacă barista ar vedea cât „trebuie” să fie în sertar, discrepanțele
  n-ar mai spune nimic. Ea vede doar confirmarea; cifrele le vede adminul.
- **Registrul de numerar se aliniază la realitate.** O diferență la numărare se scrie ca mișcare
  („diferență la numărare”), astfel soldul din sistem pornește următoarea tură de la banii reali, iar
  lipsa rămâne vizibilă în raportul de pierderi și pe tură.
- **Anulare: preparat sau nu.** La un retur barista spune dacă produsul a fost preparat. Dacă nu,
  ingredientele revin în stoc; dacă da, rămân consumate și apar la pierderi. Banii se restituie din
  tura curentă (pe card, prin terminal).
- **Costul mediu ponderat pe toată rețeaua**, recalculat la fiecare recepție.
- **Tableta e autentificată, nu barista.** Adminul creează tableta și primește un cod de asociere
  (o singură folosire); tableta primește un token. PIN-ul baristei se verifică local (ca să meargă
  offline) și servește la atribuirea vânzărilor, nu ca protecție puternică. Serverul acceptă doar
  utilizatori cu PIN din locația tabletei; un administrator (fără PIN) doar pentru operațiile făcute
  înainte de promovarea lui din barista, după jurnalul de audit.
- **Același cod de bază de date peste tot**: PostgreSQL în producție, PGlite în dezvoltare și teste.
  Toate testele trec pe amândouă.
- **Evenimentele care ajung târziu nu strică numărările deja făcute.** O vânzare offline sincronizată
  după finalizarea unei inventarieri era deja cuprinsă în cantitatea numărată: se compensează pe
  inventariere, la momentul numărării. La fel, o încasare în numerar ajunsă după închiderea turei
  corectează numărarea turei respective (scripticul și semnalarea), nu lasă o lipsă falsă pe tura
  următoare. Comenzile ajunse într-o tură închisă refac cifrele scriptice ale acelei ture.
- **Vânzările se raportează la data vânzării, iar o comandă anulată nu mai e vânzare.** Dacă anularea
  vine într-o altă perioadă decât vânzarea (rar: retururile se fac în aceeași tură), raportul de vânzări
  al perioadei vechi scade, iar restituirea apare în registrul de bani la data ei. Raportul de pierderi
  arată anulările la data anulării.
- **Serverul nu crede orbește tableta.** Totalul unei comenzi trebuie să fie exact suma liniilor (aceeași
  funcție ca pe tabletă), iar modificatorii unei linii trebuie să fie diferiți și permiși pentru produs;
  altfel evenimentul ajunge la „Erori sincronizare”, fără să blocheze coada. Un preț diferit de catalog nu
  se respinge (vânzare offline după o schimbare de preț): se păstrează prețul catalogului de la
  sincronizare, comanda e marcată „preț ≠ catalog” și numărată pe panou.
- **Ceasul tabletei are limite.** Un moment cu peste 10 minute în viitor sau dinaintea asocierii tabletei
  e respins (Erori sincronizare; adminul îl poate reaplica după verificare). Tableta își compară ceasul cu
  ora serverului la fiecare sincronizare: peste 5 minute diferență afișează o bandă de avertizare și nu
  deschide o tură nouă. Banii unei vânzări, anulări sau plăți mărunte intră cel mai devreme la deschiderea
  numărată a turei ei, deci un ceas dat înapoi nu mută o încasare (și lipsa) în tura închisă a altei
  bariste; evenimentul e marcat „oră suspectă” și numărat pe panou.
- **O tură verificată care se schimbă iese din nou la verificare** (vânzare sau corecție de casă ajunsă
  târziu): „modificată după verificare”, pe panou și la filtrul „neverificate”. O a doua deschidere a unei
  ture deja deschise e respinsă; o deschidere reaplicată după închidere nu mai numără diferența de două ori.
- **Scrieri simultane pe aceeași locație.** Numărările de casă (deschiderea și închiderea turei) și
  finalizarea inventarierii iau o blocare pe locație (`pg_advisory_xact_lock`), iar vânzările, mișcările de
  casă și de stoc o iau partajat: o mișcare scrisă în paralel e fie văzută de numărare, fie corectată după
  ea. Ordinea blocărilor e descrisă în `server/src/servicii/ture.ts` (`CHEIE_CASA`): casa, apoi turele, apoi
  stocul; rândul tabletei din `dispozitive` se ia înaintea casei, dar doar `FOR NO KEY UPDATE`, care nu se
  ciocnește cu cheile străine spre tabletă scrise de o reaplicare din panou.
- **Securitate pe măsura unei cafenele, nu a unei bănci.** Tokenul de sesiune circulă doar în antet
  (fluxul de notificări folosește bilete de un minut) și stă în bază doar ca amprentă SHA-256, la fel
  ca tokenul tabletelor; o sesiune ține cel mult 30 de zile. Loginul are pauze după încercări greșite
  (pe adresă și pe cont), schimbarea parolei închide celelalte sesiuni, dezactivarea unei tablete îi
  anulează tokenul, tableta poate declara doar bariste din locația ei, iar puntea de echipamente cere un
  secret și verifică originea paginii. În producție serverul ascultă doar local, în spatele Caddy (HTTPS),
  și trimite un Content-Security-Policy strict.
- **Cardul se verifică pe server, nu pe tabletă.** Plata trece prin server, care o scrie în
  `operatiuni_terminal` (o înregistrare pe încercare: în curs, aprobată, refuzată sau nesigură; doar câmpurile
  alese, niciodată răspunsul brut). O plată aprobată se întoarce din registru la reîncercare, una în curs se
  așteaptă (sau 409), una nesigură se verifică pe terminal fără să se retrimită suma. „Ultima tranzacție”
  aprobă doar cu referința noastră, aprobarea explicită și aceeași sumă, și refuză doar la un refuz explicit
  (un cod de răspuns necunoscut lasă plata nesigură); altfel tableta arată „plată neconfirmată” și nu
  înregistrează vânzarea. Tableta așteaptă 7,5 minute, peste cele circa 7 ale serverului. Erorile pe care o
  reîncercare nu le schimbă au un `cod` în răspuns (`COD_TERMINAL` din `shared`): o configurare lipsă e
  eroare, nu plată nesigură; o plată aprobată deja pentru altă sumă (coșul s-a schimbat după un răspuns
  pierdut) arată suma aprobată și cere readucerea coșului, fără „plată nouă”.
  Returul pe card e integral, doar în contul plății înregistrate a comenzii (RRN și sumă din registru), o
  singură dată, și doar de pe terminalul care a încasat. Fără plată înregistrată (pilotul manual, vânzări de
  dinaintea registrului), pe alt terminal sau după un retur nesigur pe care barista îl lămurește pe terminal,
  anularea trece pe calea manuală: returul din meniul terminalului, apoi confirmarea pe tabletă. La
  sincronizare, o vânzare pe card de pe o tabletă cu terminal prin server, fără plată aprobată de aceeași
  sumă, primește `card_confirmat = false` (nu se respinge: tableta lucrează offline-first) și apare la fel în
  Comenzi, pe tură și pe Panou; pe tabletele cu terminal separat rămâne NULL (nu se poate confirma). Terminalul legat în panou are întâietate pe
  tabletă; Simulatorul și puntea locală apar doar în dezvoltare sau cu „mod demonstrație” din Setări → Tablete.
- **Tableta se blochează singură.** După `blocare_automata_min` minute fără atingere (implicit 5, din panou)
  revine la ecranul de PIN, niciodată cât e deschis dialogul unei plăți cu cardul (și cu rezultat nesigur), al
  unui retur sau al închiderii turei. Ecranul de PIN acoperă vânzarea fără s-o închidă: coșul început rămâne,
  iar o versiune nouă nu se aplică peste el. După 5 PIN-uri
  greșite urmează o pauză de 30 s, apoi dublă (numărătoarea stă în IndexedDB). Închiderea turei cere PIN-ul din
  nou. Aplicația caută o versiune nouă la 30 de minute și la revenirea internetului.
- **Jurnalul de retrimitere al tabletei.** Evenimentele confirmate de server nu se șterg imediat: rămân 7 zile
  (cel mult 20 000) într-un depozit separat din IndexedDB. După o restaurare a serverului dintr-o copie de
  siguranță, Meniu → Echipamente și tabletă → „Retrimite evenimentele din ultimele 7 zile” reface ziua pierdută;
  serverul recunoaște după UUID ce are deja.
- **Registrele se apără și în bază.** `miscari_stoc`, `miscari_bani` și `jurnal_audit` au declanșatori
  care refuză UPDATE, DELETE și TRUNCATE: regula „nimic nu se suprascrie” nu mai depinde doar de cod.
  Opțional, serverul lucrează cu un rol PostgreSQL fără drepturi pe schemă (migrațiile trec prin altul).
- **Jurnal de audit.** Orice modificare din panou, autentificările și operațiunile tabletei din afara
  cozii se scriu cu cine, de unde, când și (la suprascrieri) valoarea de dinainte: o toleranță ridicată
  sau o rețetă schimbată se pot urmări. Vânzările de pe tabletă sunt deja păstrate în `evenimente_sync`.
- **Solduri închise, ca citirile să nu crească odată cu istoricul.** Stocul și banii rămân sume de
  mișcări, dar serverul păstrează din oră în oră (și la pornire) suma mișcărilor până la un id
  (`solduri_stoc`, `solduri_bani`, servicii/solduri.ts). Soldul de acum = ultimul sold închis + mișcările
  cu id mai mare; soldul la un moment trecut scade din el mișcările datate după acel moment, deci
  vânzările sincronizate târziu, anulările și compensările de inventar cad exact ca în registru (un test
  compară fiecare citire cu suma întregului registru). Pragul se citește sub o blocare SHARE de cel mult
  100 ms: dacă registrul e ocupat de o tranzacție lungă, închiderea renunță și reîncearcă, nu ține
  vânzările pe loc. Soldurile sunt doar o scurtătură (cele înlocuite se șterg după o oră, se pot reface
  oricând din registre).
- **Panoul se reîncarcă cu măsură.** O notificare live reîncarcă o pagină cel mult o dată la 10 s
  (15 s pentru Bani și foaia de inventar), doar cât fila e vizibilă și doar pentru locația afișată;
  rapoartele nu se reîncarcă singure („Actualizat la HH:MM”, butonul Reîmprospătează). Recepțiile și
  transferurile poartă o cheie generată la deschiderea formularului: o salvare repetată după un răspuns
  pierdut întoarce documentul deja creat, fără să dubleze stocul sau costul mediu.

## Limitări cunoscute (de rezolvat în etapele următoare)

- Integrarea cu terminalul e scrisă după documentația publică POSLink și ISFiscalService și testată
  pe un POSLink simulat; trebuie validată în mediul de test Intelectsoft (vezi mai jos). Schema
  răspunsului „ultima tranzacție” nu e publicată: o citim defensiv (referința noastră, aprobare sau refuz
  explicit); lista codurilor de refuz trebuie aflată de la Intelectsoft.
- Bonul de retur (storno) și copia unui bon nu au comenzi în POSLink: se fac din meniul casei fiscale de
  pe terminal. Plata se restituie pe card prin POSLink (`Refund`), cu RRN-ul plății înregistrate pe server.
- O plată rămasă „nesigură” (terminalul nu o confirmă și nici nu o refuză explicit) nu se rezolvă singură:
  barista verifică ecranul terminalului și chitanța băncii; dacă plata nu a trecut, tableta trimite o plată nouă
  (cu altă referință), iar încercarea nesigură rămâne în registru. La fel un retur nesigur: barista spune pe
  tabletă dacă terminalul arată returul făcut sau îl face din meniul terminalului. O anulare pe card fără retur
  aprobat nu e încă semnalată separat în panou.
- POSLINK_URL trebuie să fie https (http doar pentru 127.0.0.1/localhost); un răspuns POSLink peste 1 MB nu
  se citește.
- Plata cu cardul și bonul fiscal au nevoie de internet (POSLink e în cloud). O vânzare în numerar făcută
  fără internet rămâne fără bon fiscal până la reconectare („Bon netipărit” în Istoric).
- Un eveniment respins de server pentru format invalid nu poate fi corectat din panou; se marchează
  rezolvat, iar operațiunea se reface manual. Tableta verifică aceleași limite înainte de a salva, deci
  cazul apare doar la date corupte.
- Operațiunile de casă introduse din panou (depuneri, alimentări) se pot data în trecut, dar nu
  se pot lega explicit de o tură; momentul ales decide tura căreia îi corectează numărarea.
- Inventarierea cere internet (scripticul vine de pe server). Vânzarea merge în continuare offline.
- Momentul vânzării vine de la ceasul tabletei; tabletele trebuie să aibă ora setată automat (serverul
  respinge doar abaterile mari și semnalează ceasul dat înapoi; o tabletă offline cu ceasul greșit nu
  poate fi avertizată până nu se reconectează).
- Același preț în toate locațiile; fără reduceri, carduri de fidelitate sau mese/comenzi deschise.
- Un singur rol de administrator (fără manager pe locație).
- O singură casă (sertar de numerar) pe locație: dacă o cafenea are două tablete cu sertare separate,
  registrul de numerar trebuie împărțit pe tabletă.
- Rețetele modificate se aplică și vânzărilor offline care ajung pe server după modificare.

## Terminalul clientului: PAX A930 cu IntelectSoft, prin Moldindconbank

Ce știm (octombrie 2026): terminalul e un PAX A930RTX (Android, imprimantă încorporată, 4G), cu
aplicația fiscală IntelectSoft („POS Android 2-în-1”: plata cu cardul și bonul fiscal pe același
aparat, certificat SFS; contract IS Fiscal Cloud de la 70 lei/lună per casă) și acceptare
Moldindconbank. Integrarea pentru softuri terțe se face prin **POSLink** (Intelectsoft):

- API REST în cloud, cheie API din cabinetul POSLink, câte un `DeviceID` pentru fiecare terminal.
  Documentație: https://poslink.eservicii.md/POSLink/api-docs.html.
- Comenzi folosite: `Device/payment/Pay` (plata, până la 5 min), `LastTransaction`, `CloseDoc`
  (obligatoriu după plată), `Refund`, `closeDay` (ziua bancară), `Device/Invoice/Pay` (bonul fiscal:
  linii cu `Name/Quantity/Price/VAT`, plăți cu cod `1` numerar / `2` card + `RRN`), `Report/Create`
  (Z/X), `Device/Status` (online, baterie, hârtie).
- Gratuit pentru terminalele în regim fiscal.

Ce trebuie confirmat cu Intelectsoft (+373 22 835 312) înainte de punerea în funcțiune:
1. Accesul: cheia API și `DeviceID`-ul terminalului clientului în cabinetul POSLink, și **mediul de
   test** pentru verificarea fluxului.
2. Schema exactă a bonului în `Device/Invoice/Pay` (Items vs. Lines; dacă o plată cu cod `2` + RRN
   doar înregistrează plata deja făcută sau pornește din nou cardul) și a răspunsului
   `LastTransaction`.
3. Cum se emite **bonul de retur** (storno) și copia unui bon: din meniul terminalului sau prin API.
4. Literele cotelor de TVA configurate pe casa clientului (A = 20% de regulă).
5. Comportamentul offline al terminalului (limita de ore fără sincronizare cu SIA MEV).

## Ce trebuie aflat de la client

3. **Tabletele**: Android sau iPad? Pentru Android putem face și o aplicație instalabilă cu puntea
   inclusă, fără calculator separat.
4. **Găzduirea**: unde rulează serverul (VPS, domeniu, HTTPS, copii de siguranță).
5. **Contorul râșniței**: ce înseamnă o „doză” (simplă sau dublă)? Rețetarul e configurat pe doze de 9 g.
6. **Pragurile de alertă**: ce diferență de bani / doze e acceptabilă la închiderea turei.
7. **Contabilitate**: e nevoie de export (de ex. către 1C) sau de facturi fiscale către persoane juridice?
8. **Prețuri diferite pe locații, reduceri, program de fidelitate?** Nu sunt în caietul de sarcini.
