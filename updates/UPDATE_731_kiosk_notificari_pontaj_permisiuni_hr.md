# UPDATE 731 — Kiosk și notificări de pontaj pe drepturi explicite

Versiune: **2.12.711**  
Data: **17 octombrie 2026**

## Modificări

- Sincronizarea Kiosk nu mai acceptă `hr:manage` ca drept de lucru asupra altor angajați.
- Autoservirea rămâne disponibilă contului activ și leagă operațiunea de angajatul asociat sesiunii, nu de identificatorul trimis de client.
- Accesul la alt angajat prin sincronizarea Kiosk cere explicit `hr:view`.
- Notificările de finalizare a pontajului sunt adresate exclusiv utilizatorilor activi care au cel puțin unul dintre drepturile:
  - `hr:timesheets_manage`;
  - `hr:timesheet_approve`;
  - `hr:timesheets_validate`.
- Numele rolului, apartenența la un departament numit HR și dreptul general `hr:manage` nu mai acordă implicit aceste notificări.

## Compatibilitate

- Nu este necesară o migrare de schemă SQL.
- Cererile Kiosk și pontajele existente nu sunt modificate.
- Rolul HR Manager păstrează notificările prin drepturile granulare deja incluse.
- Superadmin păstrează accesul complet.

## Verificări

- teste de acces pe ruta reală de sincronizare Kiosk;
- teste pentru destinatarii activi și drepturile explicite ale notificărilor de pontaj;
- regresii de permisiuni și HR;
- build React/Vite, audit de expunere fișiere și verificare release;
- arhive Windows și Linux.
