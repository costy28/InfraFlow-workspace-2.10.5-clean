# UPDATE 337 — Selector contract în documente sursă

Versiune: `2.12.317`
Data: 2026-07-18

## Scop

Reducerea pașilor manuali în Contract Management: utilizatorul poate alege contractul direct când introduce documentul sursă, nu doar ulterior din pagina Contracte.

## Modificări

- Gestiune / NIR:
  - formularul NIR include câmpul „Contract urmărit”;
  - NIR-ul salvează `contract_id` / `contractId`, numărul și titlul contractului;
  - lista NIR afișează contractul legat.

- Contabilitate / Facturi:
  - formularele pentru facturi intrare și ieșire includ câmpul „Contract urmărit”;
  - facturile salvează `contract_id` / `contractId`, numărul și titlul contractului;
  - lista de facturi afișează contractul legat și permite căutare după numărul/titlul contractului.

- Integrare NIR → factură:
  - facturile generate din NIR-uri moștenesc automat contractul dacă toate NIR-urile sursă au același contract;
  - Contract Management evită dublarea consumului când există și NIR-ul, și factura generată din acel NIR.

## Verificări recomandate

- Creează un contract activ.
- Creează un NIR și selectează contractul.
- Verifică în Contracte că valoarea NIR-ului intră în consum.
- Generează o factură din NIR și verifică să nu se dubleze consumul.
- Creează o factură contabilă directă cu contract și verifică afișarea în Contracte.
