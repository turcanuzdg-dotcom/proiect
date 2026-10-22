# Întrebări pentru IntelectSoft — integrarea POS-ului cu terminalul PAX A930 prin POSLink

Context: dezvoltăm un soft de vânzare (pe tabletă) și gestiune pentru o cafenea (Excelsior Grup
S.R.L., Nisporeni). Clientul are un terminal PAX A930RTX cu aplicația fiscală IntelectSoft și
acceptare Moldindconbank. Vrem ca de pe tabletă să trimitem pe terminal plata cu cardul, bonul
fiscal și raportul Z, prin POSLink (`poslink.eservicii.md/POSLink`). Contact: +373 22 835 312.

## A. Acces și mediu de test
1. Cum obținem cheia API POSLink și `DeviceID`-ul terminalului clientului? Cine creează contul în
   cabinetul POSLink: clientul, noi sau dvs.?
2. Există un mediu de test (sandbox) cu terminal virtual sau de test? Cum primim acces?
3. Terminalul clientului este în „regim fiscal” (IS Fiscal Cloud)? Confirmați că în acest caz
   POSLink e gratuit și ce contract trebuie semnat de client.
4. Documentația completă a API-ului (contract, erori, idempotență) e „disponibilă la cerere”: o putem
   primi (PDF sau OpenAPI)?

## B. Plata cu cardul (`Device/payment/Pay`)
5. `documentNr` trebuie să fie unic? Dacă retrimitem același `documentNr` (răspuns pierdut), apelul e
   idempotent sau pornește o a doua plată?
6. Ce câmpuri întoarce `LastTransaction` (documentNr, operationId, rrn, authCode, amount, stare)?
   Putem stabili cu el dacă o plată expirată cu eroarea 241 a fost totuși aprobată?
7. `CloseDoc`: ce se întâmplă dacă nu e apelat? Trebuie apelat și după o plată refuzată?
8. `Refund` vs. `CancelTransaction`: de unde provine `token`? `Refund` funcționează și după
   `closeDay` (în zilele următoare)?
9. Ce vede clientul pe terminal când suma vine din POSLink (ecranul de plată se deschide automat
   peste aplicația de casă?) și cât așteaptă terminalul cardul.
10. Pentru `Pay` există callback (`CallbackURI`) sau doar răspunsul sincron?

## C. Bonul fiscal (`Device/Invoice/Pay`)
11. Schema exactă a obiectului `Receipt`: `Items` sau `Lines`? Câmpurile acceptate (Name, Quantity,
    Price, Discount, VAT, Code, UnitName), plus `Number`, `Uid`, `DisplayType`, `HeaderText`,
    `ClientEmail`/`ClientPhone`.
12. Codurile de plată (1 numerar, 2 card, 7 alt tip): dacă trimitem cod 2 cu RRN și BankResponse ale
    unei plăți deja făcute prin `payment/Pay`, terminalul doar înregistrează plata sau pornește din
    nou cititorul? Fluxul recomandat: `payment/Pay` + `Invoice/Pay`, sau un singur `Invoice/Pay` cu
    cod 2 (plată și bon)?
13. La numerar trimitem `Amount` = suma primită de la client, iar restul îl calculează terminalul?
14. Răspunsul la `Invoice/Pay` e sincron (ReceiptID, QR-ul de pe mev.sfs.md, numărul bonului) sau
    vine doar prin `CallbackURI`? Formatul callback-ului.
15. Același `Uid` trimis de două ori: eroarea 46 cu TaskId-ul bonului existent (ca în
    ISFiscalService) sau alt comportament?
16. Bonul de retur (storno) pentru o vânzare anulată: există comandă prin POSLink/API sau se face
    din meniul terminalului? Cum se leagă de bonul original?
17. Copia (duplicatul) unui bon: există `PrintCopy` prin POSLink?
18. Literele cotelor TVA configurate pe casa clientului (A = 20%, B = 8%, „_” fără TVA?) și cum le
    putem citi prin API.
19. Limite: lungimea maximă a denumirii, numărul maxim de linii pe bon, precizia cantității,
    diacriticele românești pe bon.
20. Consumul intern / casările (fără încasare) nu se fiscalizează, corect? Există bon nefiscal
    pentru ele?

## D. Raport Z, numerar, zi bancară
21. `Report/Create` cu `Fiscal=true` închide schimbul fiscal; trebuie precedat sau urmat de
    `closeDay`? Ordinea recomandată la închiderea zilei. Un Z automat programat din cabinet intră în
    conflict cu cel din API?
22. `Money/In` / `Money/Out`: trebuie să înregistrăm fondul de casă de dimineață și ridicările de
    numerar prin aceste apeluri, ca registrul casei fiscale să corespundă?
23. Regula de 24 de ore (bonurile se refuză până la Z, eroarea 9) se aplică și pe terminal?

## E. Offline, erori, operare
24. Când terminalul e fără conexiune primim 241; care e limita de ore offline a terminalului și
    bonurile emise offline se transmit ulterior la SIA MEV?
25. Cum ajung în răspuns erorile terminalului (hârtie terminată, baterie descărcată, altă aplicație
    în prim-plan)?
26. Limite de frecvență, timeout-uri recomandate și filtrul de IP (menționat la eroarea 10):
    serverul nostru trebuie să aibă IP fix?
27. Cât de des putem interoga `Device/Status` pentru monitorizare? Recomandați un terminal per
    tabletă?
28. Clientul primește acces la cabinetul POSLink/MEV pentru monitorizarea bonurilor? Există
    webhook-uri pentru evenimentele fiscale?

## F. Comercial și contact
29. Costuri: POSLink gratuit în regim fiscal (confirmare), IS Fiscal Cloud de la 70 lei/lună per
    casă; alte costuri de activare sau suport?
30. Persoana și canalul de contact tehnic pentru integrare și timpul estimat de activare după
    semnare.
