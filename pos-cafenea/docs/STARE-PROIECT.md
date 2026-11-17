# Starea proiectului (de citit la începutul unei sesiuni noi)

Client: EXCELSIOR GRUP S.R.L. (Nisporeni), cafeneaua „Urban Coffee”. Proiect făcut gratuit, prietenește.
Totul se cumpără și se înregistrează pe EXCELSIOR GRUP S.R.L.

## Gata

- Aplicația (tableta `pos.html`, panoul `admin.html`, serverul), testată; simularea publică:
  https://turcanuzdg-dotcom.github.io/proiect/ și previzualizarea https://turcanuzdg-dotcom.github.io/proiect/test.html
- Domeniul `excelsiorgrup.md` (nic.md, 1 an). NS încă nedelegate.
- Serverul IPHOST „VPS Start MD” (1 nucleu, 2 GB, 30 GB), IPv4 **143.20.140.9**, plătit pe 1 an.
  Panoul serverului: iphost.md → Services → Open Control Panel.
- Instalarea dintr-o singură comandă: `deploy/pornire-rapida.sh`, publicată (cu arhiva și amprenta ei) la
  https://turcanuzdg-dotcom.github.io/proiect/instalare/pornire.sh (se republică cu `deploy/publica-pornire.sh`).
- Fișele tehnologice ale clientului (17 produse) mutate în `docs/sabloane/Urban-Coffee-date-pornire.xlsx`
  (copia completată a fost trimisă utilizatorului; clientul completează celulele galbene).

## Pașii următori, în ordine

1. IPHOST → Control Panel → Server Setup: Name `urban-coffee`, Hostname `pos.excelsiorgrup.md`,
   Timezone `Europe/Chisinau`, OS **Ubuntu 24.04 LTS**. Parola de root o scrie utilizatorul (nu se trimite în chat).
2. Cloudflare (plan Free): zona `excelsiorgrup.md`, înregistrare A `pos` → `143.20.140.9`, proxy OPRIT (gri).
3. nic.md → domeniul → NS Delegare: cele 2 nameservere de la Cloudflare.
4. Pe server, ca root:
   ```
   curl -fsSLO https://turcanuzdg-dotcom.github.io/proiect/instalare/pornire.sh
   bash pornire.sh pos.excelsiorgrup.md EMAILUL-PROIECTULUI
   ```
   Cere de două ori parola contului `admin` (min. 12 caractere, fără ' și \).
5. Verificare: https://pos.excelsiorgrup.md/admin.html; apoi ștergerea ADMIN_PAROLA din /etc/cafenea/server.env.
6. Copii de siguranță (Backblaze B2 + healthchecks.io), vezi `deploy/README.md`.
7. Meniul real din tabel (după ce clientul completează prețurile), legarea tabletei, proba la cafenea.
8. De corectat la nic.md: adresa titularului → adresa juridică a EXCELSIOR.

## Întrebări deschise pentru client (din fișele tehnologice)

- Prețurile de vânzare (lipsesc toate), prețurile de achiziție și stocul de pornire.
- Moccacino fără ciocolată în rețetă; Hot Chocolate are în instrucțiuni „dozare cafea 10 g”.
- Grand Latte 450 ml cu o singură doză de cafea?
- Zahărul (15 g „la cerere”) e trecut ca opțiune, nu în rețetă.
- Limonadă: siropul și piureul se cumpără la kg, dar se dozează în ml.
- Aromele de sirop și dacă siropul se plătește în plus; ce sirop are Irish Coffee.

## Reguli

- Parole, chei și IDNP nu se scriu în chat și nici în git; doar în /etc/cafenea/server.env pe server.
- Terminalul de card: modul „manual” (terminal separat) până la un contract POSLink.
