# UPDATE 539 — Panou ghidat diagnostic în fișa angajatului

Versiune: 2.12.519  
Data: 2026-08-29

## Obiectiv

După ce operatorul apasă `Rezolvă` în diagnosticul registrului intern HR, fișa angajatului trebuie să explice clar de ce a fost deschisă și ce câmpuri trebuie corectate.

## Implementare

- Am adăugat context ghidat pentru problemele venite din diagnosticul registrului intern.
- Fișa angajatului afișează un panou contextual cu:
  - sursa problemei;
  - severitatea;
  - zona recomandată de rezolvare;
  - acțiunea concretă;
  - câmpurile lipsă sau de verificat.
- Butonul `Rezolvă` continuă să deschidă tabul corect calculat de diagnostic.
- Contextul ghidat se curăță la deschiderea altui angajat sau la închiderea fișei.

## Migrare SQL

Nu necesită migrare SQL.
