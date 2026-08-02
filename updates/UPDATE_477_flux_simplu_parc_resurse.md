# UPDATE 477 — Flux simplu Parc & Resurse

Versiune: 2.12.457  
Data: 2026-08-02

## Scop

Modulul Mecanizare / Parc & Resurse are multe funcții valoroase, dar operatorul are nevoie de o ordine simplă: parc, cereri, planificare, bonuri, combustibil, intervenții, scadențe și raport. Update-ul adaugă un panou ghidat înaintea asistentului existent.

## Implementare

- Adăugat panou „Flux simplu Parc & Resurse” în `MecanizarePage.jsx`.
- Panoul urmărește pașii:
  1. Parc;
  2. Cereri;
  3. Planificare;
  4. Bonuri / FAZ;
  5. Combustibil / intervenții;
  6. Scadențe / raport.
- Recomandarea principală se calculează din datele deja încărcate în pagină.
- Fiecare pas are status, explicație și acțiune directă către zona potrivită.
- Asistentul existent rămâne neschimbat.

## Verificări

- [x] `npm run build`
- [x] `npm run release:check -- --no-zip`
- [x] ZIP update generat
