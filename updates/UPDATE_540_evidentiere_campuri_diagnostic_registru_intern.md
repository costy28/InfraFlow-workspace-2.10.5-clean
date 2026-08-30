# UPDATE 540 — Evidențiere câmpuri diagnostic registru intern

Versiune: 2.12.520  
Data: 2026-08-29

## Obiectiv

Diagnosticul registrului intern HR trebuie să ducă operatorul direct la câmpurile care trebuie corectate, nu doar la tabul potrivit.

## Implementare

- Am propagat contextul ghidat al diagnosticului către taburile `Date personale` și `Contracte`.
- În editarea datelor personale sunt evidențiate câmpurile de nume/prenume și CNP când diagnosticul le marchează ca lipsă.
- În tabul `Contracte` apare un panou de corectare cu câmpurile lipsă și acțiuni rapide:
  - `Editează contract activ`;
  - `Creează contract activ`, dacă angajatul nu are contract activ.
- În lista contractelor și în modalul de editare sunt evidențiate câmpurile relevante:
  - număr contract;
  - dată contract;
  - dată începere;
  - normă ore;
  - salariu bază.
- Contextul ghidat este doar vizual și nu modifică automat datele angajatului.

## Migrare SQL

Nu necesită migrare SQL.
