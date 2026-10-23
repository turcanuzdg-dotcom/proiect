# Tableta de la tejghea: pregătire și reguli

Pentru managerul cafenelei și pentru cine pregătește tabletele. Tableta e casa de marcat a cafenelei:
prin ea trec vânzările, banii și închiderea turei. O tabletă bine pregătită nu poate fi folosită de
altcineva, are ora corectă și nu pierde vânzările făcute fără internet.

## Ce tabletă

- **Android 13 sau mai nou**, de la un producător care promite **actualizări de securitate cel puțin
  3 ani** de acum înainte (verificați pe site-ul producătorului pentru modelul exact). Pentru tejghea
  merită un model robust sau o husă rezistentă la stropi.
- Ecran de **10–11 inch**, **minimum 4 GB RAM** și **64 GB** spațiu.
- Wi-Fi bun în cafenea; opțional SIM 4G ca rezervă (tableta merge și fără internet, dar plata cu cardul
  prin terminal are nevoie de el).
- Încărcător și suport fix lângă casă: tableta stă mereu la priză.
- Fără tablete „second-hand” sau resetate de altcineva, fără aplicații instalate din afara Google Play.

## Pregătirea unei tablete noi (o dată)

Denumirile meniurilor diferă puțin de la un producător la altul; mai jos sunt cele de pe o tabletă
Samsung. Căutarea din Setări (lupa) găsește opțiunea după nume.

1. **Actualizați sistemul**: Setări → Actualizare software → instalați tot ce e disponibil.
2. **Cont Google al cafenelei** (nu personal al cuiva), folosit doar pentru actualizări.
3. **Ecran de blocare**: Setări → Securitate → Blocare ecran → **PIN de minimum 6 cifre sau parolă**,
   pe care o știe doar managerul. Baristele nu au nevoie de el în timpul lucrului dacă folosiți fixarea
   ecranului (pasul 7).
4. **Data și ora automate**: Setări → Gestionare generală → Dată și oră → **„Dată și oră automate”
   PORNIT** și **„Fus orar automat” PORNIT** (sau fusul Europe/Chișinău). Ora vânzărilor vine de la
   tabletă: cu o oră greșită, vânzările ajung în altă tură, iar casa nu se mai potrivește.
   Cine nu știe PIN-ul tabletei nu poate schimba ora: încă un motiv ca baristele să nu-l aibă.
5. **Opțiunile pentru dezvoltatori și depanarea USB OPRITE**: Setări → Opțiuni dezvoltator → oprit
   (dacă meniul nu apare, e deja oprit). Prin USB se pot citi datele aplicației.
6. **Actualizări automate pentru Chrome**: Google Play → profil → Setări → Preferințe de rețea →
   Actualizare automată aplicații → „Prin orice rețea” (sau „Doar prin Wi-Fi”). Corecțiile de securitate
   ale browserului ajung astfel singure.
7. **Fixarea ecranului** (aplicația POS rămâne pe ecran, nu se poate ieși din ea fără PIN):
   Setări → Securitate → Mai multe setări → **Fixare aplicații** → pornit, cu „Solicitare PIN la
   anularea fixării”. Alternativ, un mod kiosk (Android Enterprise / soluția de administrare a
   dispozitivelor, dacă aveți) care permite doar Chrome și POS-ul și poate impune „ora automată”.
8. **Ecranul nu se stinge prea repede**: Setări → Ecran → Timp expirare ecran → 10–30 de minute.
9. **Fără aplicații de „curățare”, „optimizare” sau antivirus care șterg date**: vânzările făcute
   offline stau în datele site-ului din Chrome până ajung pe server.

## Instalarea POS-ului

1. Deschideți Chrome la adresa **`https://pos.<domeniu>.md/pos.html`** (adresa exactă v-o dă furnizorul).
2. Meniul Chrome (⋮) → **„Instalați aplicația”** (sau „Adăugați pe ecranul de pornire”). POS-ul apare ca
   aplicație și pornește și fără internet.
3. Managerul cere în panou (Setări → Tablete → Tabletă nouă) un **cod de asociere**, îl introduce pe
   tabletă la „Asociați tableta” și apasă **Asociază**.
4. Fixați aplicația pe ecran (pasul 7 de mai sus).

**Codul de asociere nu se dă nimănui** și nu se trimite pe chat: cine îl introduce primul pe orice
dispozitiv devine „tableta cafenelei” (poate vinde în numele cafenelei). Codul merge o singură dată;
dacă ați greșit sau l-a văzut cineva, cereți în panou „Cod nou”.

## În fiecare zi

- Fiecare barista intră cu **PIN-ul ei personal**. PIN-ul nu se spune colegelor: tot ce se vinde cu el
  apare pe numele ei, inclusiv lipsurile de la închiderea turei. La plecarea din tură:
  „Schimbă utilizatorul”.
- Dacă tableta arată că **nu are internet**, vânzarea în numerar continuă normal: totul se trimite
  singur când revine conexiunea. **Nu ștergeți datele Chrome și nu resetați tableta** cât timp sunt
  vânzări netrimise.
- Dacă tableta arată un avertisment despre **ora greșită**, anunțați managerul (pasul 4).
- Tableta stă la tejghea, la priză; nu pleacă acasă cu nimeni.

## Dacă tableta s-a pierdut sau a fost furată

**Imediat**, managerul sau administratorul:

1. Panou → Setări → Tablete → **Dezactivează** la tableta respectivă. Din acel moment tableta nu mai poate
   trimite nimic și nu mai poate porni plăți pe terminal.
2. Pe aceeași tabletă, **Cod nou**: vechea asociere e anulată definitiv.
3. Anunțați furnizorul (și, dacă tableta era deblocată, schimbați PIN-urile baristelor din acea cafenea:
   Setări → Utilizatori).
4. Verificați în panou ultima tură a acelei tablete: vânzările făcute fără internet și netrimise înainte
   de pierdere nu mai ajung pe server.
5. Tableta nouă se pregătește după pașii de mai sus.

Dacă tableta e găsită: „Reactivează”, apoi asociere cu codul nou.

## După o restaurare a serverului

Dacă furnizorul anunță că serverul a fost restaurat dintr-o copie de siguranță, pe **fiecare tabletă**:
meniul POS → **„Retrimite evenimentele din ultimele 7 zile”**. Vânzările și turele de după momentul
copiei ajung din nou pe server; cele care erau deja acolo nu se dublează.

## Verificare lunară (managerul, 5 minute pe tabletă)

- [ ] Sistemul și Chrome sunt actualizate.
- [ ] „Dată și oră automate” e pornit; ora de pe tabletă e cea corectă.
- [ ] Opțiunile pentru dezvoltatori sunt oprite; fixarea ecranului e pornită.
- [ ] În panou, la Setări → Tablete, tableta s-a sincronizat azi.
