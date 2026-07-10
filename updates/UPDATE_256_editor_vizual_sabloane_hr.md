# UPDATE 256 — Editor vizual pentru șabloane HR

Versiune: 2.12.236  
Data: 2026-07-10

## Schimbări

- Modalul de editare șablon HR nu mai afișează implicit cod HTML.
- A fost introdus un editor vizual tip document pentru conținutul șabloanelor.
- Variabilele de șablon se inserează direct în documentul vizual.
- Au fost adăugate acțiuni simple de formatare:
  - bold;
  - titlu;
  - listă;
  - tabel de semnături.
- Codul HTML rămâne disponibil doar prin butonul `HTML avansat`.
- Mesajul de ajutor explică fluxul normal pentru HR: copiere/lipire din Word în editorul vizual, apoi inserarea variabilelor.

## Compatibilitate

- Nu modifică schema MSSQL.
- Compatibil DB_MODE=json.
- Nu introduce dependențe noi.
