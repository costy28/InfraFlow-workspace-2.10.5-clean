# UPDATE 660 — Suport P1–P4 în Tichete

Versiune: `v2.12.640`  
Data: 04.10.2026

## Scop

Tichetele sunt urmărite cu un nivel de suport clar până la rezolvare, fără
schimbarea structurii MSSQL sau a tichetelor existente.

## Convenție operațională

| Nivel | Prioritate existentă | Țintă operațională |
| --- | --- | --- |
| P1 — critic | `critica` | 4 ore |
| P2 — urgent | `urgenta` | 24 ore |
| P3 — ridicat | `ridicata` | 3 zile |
| P4 — planificat | `normala` / `scazuta` | 5 zile |

Țintele sunt de urmărire internă și nu reprezintă un SLA contractual. Un termen
explicit mai devreme rămâne prioritar. La rezolvare, aplicația păstrează dacă
ticketul a fost rezolvat în termen sau după termen.

## Interfață

- formularul pentru ticket nou explică alegerea P1–P4;
- lista are filtre rapide pe nivel și pe depășire;
- detaliul arată ținta, termenul urmărit și verdictul;
- mesajul de escaladare automată pentru un tichet critic neasignat indică P1.

## Verificare

```powershell
node --test server/tests/ticket-support-levels.test.js
npm run build
```
