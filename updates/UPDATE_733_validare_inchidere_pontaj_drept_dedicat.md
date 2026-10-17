# UPDATE 733 — Validare și închidere pontaj pe drept dedicat

Versiune: **2.12.713**  
Data: **17 octombrie 2026**

## Comportament

- Validarea și devalidarea pontajului cer `hr:timesheets_validate`, cu verificarea existentă a angajaților și departamentului.
- Închiderea și redeschiderea lunii cer același drept dedicat.
- Interfața afișează butoanele de validare după dreptul verificat de server.
- Aprobarea orelor suplimentare rămâne controlată prin `hr:timesheet_approve`, cu denumire distinctă în catalog.

## Compatibilitate

Rolurile existente cu drept de aprobare primesc o singură dată dreptul de validare pentru continuitatea accesului anterior. Markerul `hrTimesheetValidationV212713` împiedică reacordarea după retragerea manuală. Schema SQL nu necesită migrare.

## Verificări

Testele rutelor verifică refuzul pentru simpla aprobare și succesul cu dreptul dedicat, inclusiv închiderea/redeschiderea lunii. Testul migrării verifică păstrarea accesului și retragerea ulterioară. Pachetele sunt pregătite pentru Windows și Linux.
