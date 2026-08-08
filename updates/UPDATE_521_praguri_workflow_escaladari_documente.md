# UPDATE 521 — Praguri workflow pentru escaladări Documente

Versiune: `2.12.501`
Data: 2026-08-08

## Scop

Escaladările din Documente nu trebuie să folosească praguri fixe hardcodate.
Ele trebuie să respecte configurarea organizației din fluxurile documentelor.

## Modificări

- Filtrul rapid `Escaladări` citește pragul `Escaladare după zile` din fluxul configurat pentru tipul documentului.
- Dashboard-ul calculează badge-ul de escaladări după aceeași regulă.
- Task-urile către responsabilii curenți primesc:
  - prioritate recomandată după pragul real al fluxului;
  - termen recomandat după vechimea pasului;
  - fallback sigur când fluxul nu este configurat.
- Fallback:
  - contracte: 3 zile;
  - restul documentelor: 2 zile.

## Migrare SQL

Nu necesită migrare SQL nouă.

## Testare recomandată

1. Setări → Documente → Circuit aprobare.
2. Schimbă `Escaladare după zile` la un flux, de exemplu Contract = 4.
3. Salvează fluxurile.
4. Intră în Dashboard și Documente → `Escaladări`.
5. Verifică faptul că lista și task-urile recomandate respectă pragul nou.
