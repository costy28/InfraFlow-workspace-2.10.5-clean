# UPDATE 520 — Filtru rapid Escaladări Documente

Versiune: `2.12.500`
Data: 2026-08-08

## Scop

Managerul nu trebuie să intre prin toate grupările ca să găsească problemele.
Documente primește o listă de lucru directă: `Escaladări`.

## Modificări

- Adăugat filtru rapid `Escaladări` în Documente.
- Filtrul include documentele urmărite care au cel puțin una dintre condițiile:
  - pas curent de 2+ zile;
  - pas curent fără dată;
  - fără pas curent;
  - scadente azi sau întârziate;
  - prioritate urgentă/critică;
  - blocaj detectat.
- Lista `Escaladări` afișează panoul de escaladare asistată.
- Din lista `Escaladări` se pot crea task-uri către responsabilii curenți.
- Dashboard-ul afișează badge cu numărul de escaladări și buton `Vezi escaladări`.

## Migrare SQL

Nu necesită migrare SQL nouă.

## Testare recomandată

1. Intră în Dashboard.
2. Dacă există documente urmărite problematice, verifică badge-ul `escaladări`.
3. Apasă `Vezi escaladări`.
4. În Documente trebuie să fie activ filtrul `Escaladări`.
5. Verifică panoul de escaladare asistată și acțiunea `Task-uri către responsabili`.
