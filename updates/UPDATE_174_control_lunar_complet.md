# UPDATE 174 - Control lunar contabil complet

Versiune: `2.12.154`  
Data: `2026-06-28`

## Reconciliere bancara

- Sugestiile sigure pot fi confirmate automat in lot, cu prag implicit de 85%.
- O sugestie este automata doar daca este unica sau are un avantaj de minimum 15 puncte fata de urmatoarea potrivire.
- Cazurile ambigue, fara document, CUI sau suma concludenta raman pentru decizia operatorului.
- Fiecare reconciliere pastreaza scorul, utilizatorul, data si observatia; operatiile se valideaza ulterior in Trezorerie.

## Registre Casa si Banca

- Soldul este calculat cronologic pentru fiecare operatiune si agregat pentru fiecare zi.
- Sumarul zilnic contine sold initial, incasari, plati, sold final si numar de operatiuni.
- Exportul Excel contine doua foi noi: `Sold zilnic casa` si `Sold zilnic banca`.

## Inchidere lunara

- Operatiile bancare validate dar neclasificate blocheaza inchiderea.
- Importurile de extras bancar nefinalizate blocheaza inchiderea.
- Verificarea TVA este considerata expirata daca totalurile 4426 sau 4427 s-au modificat ulterior.
- Interfata afiseaza blocajele si deschide direct zona de reconciliere sau TVA.
- Motivul redeschiderii are minimum 5 caractere; marcarea depunerii necesita numar de recipisa sau referinta.

## Rapoarte si terti

- Fisele furnizor/client, confirmarile de sold, stingerile, notele de credit si jurnalele raman in acelasi circuit contabil.
- Nu sunt introduse tabele noi; datele folosesc structurile contabile existente JSON si MSSQL.

## Verificare

- 37 din 37 teste automate contabile trecute.
- Build React/Vite trecut.
- API real verificat pe o baza JSON izolata.
- Exportul Excel a fost deschis programatic si contine toate cele 6 foi asteptate.
