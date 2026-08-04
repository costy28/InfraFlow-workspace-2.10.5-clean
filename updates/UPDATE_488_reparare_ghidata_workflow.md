# UPDATE 488 — Reparare ghidată pentru workflow configurabil

Versiune: `2.12.468`
Data: `2026-08-04`

## Context

După diagnosticarea vizuală a fluxurilor și aplicarea regulilor `condition_rule` în engine, administratorul avea nevoie de pași simpli de remediere. Scopul este ca aplicația să nu arate doar problema, ci să ofere următoarea acțiune sigură.

## Implementare

- `Setări > Module > Circuit aprobare` afișează acțiuni rapide pentru observațiile din diagnosticul workflow.
- Reparațiile modifică doar draftul local al `settings.workflow_document_flows`; salvarea în configurația organizației rămâne explicită prin butonul `Salvează fluxurile`.
- Acțiuni acoperite:
  - denumire automată pentru fluxuri fără nume;
  - completare tip document;
  - pas minim pentru flux activ fără pași;
  - numire automată pentru pași fără nume;
  - completare aprobator generic după tipul actorului;
  - termen implicit de 1 zi;
  - conversie condiții text libere în `condition_rule`;
  - valoare implicită pentru reguli incomplete;
  - dezactivarea duplicatelor active pentru același tip document.

## Siguranță

- Nu există migrare DB.
- Nu există endpoint nou.
- Nicio reparație nu este salvată automat în baza de date.
- Administratorul poate verifica rezultatul în simulator înainte de salvare.

## Verificare

- Build frontend.
- Release check.
- ZIP update validat.
