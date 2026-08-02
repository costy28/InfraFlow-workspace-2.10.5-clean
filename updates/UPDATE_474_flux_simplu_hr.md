# UPDATE 474 — Flux simplu HR

Versiune: 2.12.454  
Data: 2026-08-01

## Scop

HR-ul era deja funcțional, dar operatorul trebuia să știe ordinea corectă dintre angajați, contracte, pontaj, concedii, dosar și salarizare. Update-ul adaugă un panou de lucru simplu, care arată următorul pas fără să ascundă instrumentele existente.

## Implementare

- Adăugat panou „Flux simplu HR” în `HRPage.jsx`.
- Panoul urmărește pașii:
  1. Angajați activi;
  2. Contract activ și salariu de bază;
  3. Pontajul lunii;
  4. Concedii și certificate medicale;
  5. Dosar HR și asociere Kiosk;
  6. Salarizare / export.
- Recomandarea principală se calculează din datele deja încărcate în pagină.
- Fiecare pas are status, explicație și acțiune directă către tabul potrivit.
- Asistentul HR existent rămâne neschimbat.

## Verificări

- [x] `npm run build`
- [x] `npm run release:check -- --no-zip`
- [x] ZIP update generat
