# UPDATE 702 — Tema vizuală Contabilitate de bază

Versiune: **2.12.682**  
Data: **8 octombrie 2026**

## Scop

Uniformizarea vizuală a fluxurilor contabile de bază, fără modificarea calculelor, datelor sau autorizării existente.

## Modificări

- antet comun și navigare compactă pentru Dashboard contabil, terți, facturi, trezorerie și operațiuni contabile;
- tabele cu derulare locală pe ecrane înguste, fără eliminarea coloanelor;
- acțiuni și zone de confirmare care se rearanjează pe mobil;
- contrast corect pentru ghidul contabil și stările semantice în tema dark;
- test vizual izolat cu toate cererile API interceptate și fără operațiuni de scriere.

## În afara ariei

- nu se schimbă API-ul, schema MSSQL, formulele, validările, permisiunile, exporturile sau tipărirea;
- rapoartele contabile și fiscale avansate vor fi verificate separat în etapa vizuală următoare;
- auditul granular al permisiunilor pe subfuncții este păstrat în backlog și începe după încheierea uniformizării vizuale.

## Validare

- build frontend;
- smoke vizual Contabilitate desktop/mobil, light/dark;
- verificare lipsă overflow orizontal la nivel de pagină și derulare locală pentru tabele;
- verificare că testul nu emite cereri de modificare către API-ul contabil;
- audit expunere fișiere și verificare release/pachete Windows și Linux.
