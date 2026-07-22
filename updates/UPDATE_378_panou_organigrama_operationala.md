# UPDATE 378 — Panou organigramă operațională

Versiune: `2.12.358`  
Data: `2026-07-22`

## Scop

Relațiile de raportare introduse prin `manager_id` devin vizibile în interfață, ca HR/admin să poată verifica rapid organigrama operațională.

## Implementat

- Panou nou `Organigramă operațională` în Setări → Utilizatori.
- Contoare:
  - utilizatori activi;
  - manageri cu echipă;
  - utilizatori fără manager direct.
- Card per manager cu lista subordonaților direcți.
- Evidențiere utilizatori fără manager direct.
- Semnal pentru legături invalide, dacă un utilizator pointează către un manager inexistent/inactiv.

## Compatibilitate

- Nu necesită backend nou.
- Nu necesită migrare SQL.
- Folosește lista existentă `/api/users` și câmpul opțional `manager_id`.

## Verificări

- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
