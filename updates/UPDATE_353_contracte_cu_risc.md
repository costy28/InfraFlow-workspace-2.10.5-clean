# UPDATE 353 — Contracte cu risc

Versiune: `2.12.333`  
Data: `2026-07-19`

## Ce s-a schimbat

- Dashboard-ul Contract Management calculează o listă executivă de contracte cu risc.
- Riscul combină:
  - alerte de valoare/termen;
  - task-uri restante;
  - lipsa managerului/responsabilului;
  - lipsa fișierului de contract semnat;
  - acte adiționale fără fișier atașat.
- UI-ul afișează card sumar „Cu risc” și secțiune dedicată „Contracte cu risc”.
- Fiecare contract cu risc afișează motivele concrete și permite deschiderea directă a dosarului.
- Lista principală de contracte are filtru nou „Cu risc”.

## Compatibilitate

- Nu necesită migrare DB.
- Nu modifică fluxurile de contracte, task-uri, atașamente sau acte adiționale.
- Dashboard-ul existent rămâne compatibil și adaugă `risk_contracts` și `risk_summary`.

## Verificări

- `node --check server/modules/contracts/routes.js`
- `npm --prefix client run build`
