# UPDATE 625 — Corecție conturi demo comercial

Versiune: `v2.12.605`  
Data: `2026-10-01`

## Corecție

- Bara galbenă de demo nu mai promite utilizatorii `director`, `demo` sau
  `sofer1`, deoarece aceștia aparțin scenariului demo vechi și nu sunt creați
  în baza comercială MSSQL.
- Nu mai sunt expuse parole în banner. Utilizatorii efectivi se administrează
  în **Setări → Utilizatori**.

## Impact

- Nu se creează conturi artificiale și nu se schimbă parolele existente.
- Vizitatorul nu mai este îndrumat către credențiale care ar produce eroare de
  autentificare.
