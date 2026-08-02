# UPDATE 476 — Flux simplu Referate

Versiune: 2.12.456  
Data: 2026-08-02

## Scop

Modulul Referate are flux complet de avizare, dar cei 11 pași pot părea grei pentru un utilizator nou. Update-ul adaugă un panou scurt care explică firul operațional: necesar, poziții/CPV, aprobare, comandă/contract, recepție și dosar.

## Implementare

- Adăugat panou „Flux simplu Referate” în `ReferatePage.jsx`.
- Panoul urmărește pașii:
  1. Necesar;
  2. Poziții / CPV;
  3. Flux aprobare;
  4. Aprobare / comandă;
  5. Recepție / factură;
  6. PDF / dosar.
- Recomandarea principală se calculează din statisticile și datele deja încărcate.
- Fiecare pas are status, explicație și acțiune directă către filtrul sau acțiunea potrivită.
- Ghidul existent `ContextHelp` rămâne neschimbat.

## Verificări

- [x] `npm run build`
- [x] `npm run release:check -- --no-zip`
- [x] ZIP update generat
