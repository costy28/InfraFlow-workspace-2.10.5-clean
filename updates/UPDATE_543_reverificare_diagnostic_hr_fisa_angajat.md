# UPDATE 543 — Reverificare diagnostic HR din fișa angajatului

Versiune: 2.12.523  
Data: 2026-09-01

## Obiectiv

Operatorul HR trebuie să poată reverifica manual diagnosticul registrului intern direct din fișa angajatului, mai ales după corectări făcute în alt tab sau în Setări.

## Implementare

- Am adăugat butonul `Reverifică diagnostic` în panoul ghidat din fișa angajatului.
- Butonul folosește aceeași recalculare server-side a diagnosticului registrului intern.
- Dacă angajatul nu mai are lipsuri sau atenționări, panoul ghidat se închide automat.
- Dacă mai există probleme, panoul se actualizează cu statusul curent și următoarea zonă de rezolvare.
- Acțiunea este doar de verificare; nu modifică datele angajatului.

## Migrare SQL

Nu necesită migrare SQL.
