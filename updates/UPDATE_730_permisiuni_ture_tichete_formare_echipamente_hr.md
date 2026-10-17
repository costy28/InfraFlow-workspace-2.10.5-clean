# UPDATE 730 — Permisiuni dedicate pentru ture, tichete, formare și echipamente HR

Versiune: **2.12.710**  
Data: **17 octombrie 2026**

## Modificări

- Definirea, modificarea și dezactivarea tipurilor de ture cer `hr:schedules_manage`.
- Configurarea valorii tichetelor de masă cere `hr:meal_tickets_manage`.
- Planificarea efectivă a turelor păstrează dreptul existent `hr:timesheet` și verificarea accesului la angajat.
- Interfața ascunde administrarea tipurilor de ture și dezactivează programarea când drepturile lipsesc.
- Formarea profesională cere explicit `hr:training`, fără alternativa `hr:manage`.
- Administrarea echipamentelor cere explicit `echipamente:gestionar`, fără alternativa `hr:manage`.
- Rolurile existente cu `hr:manage` primesc o singură dată drepturile dedicate echivalente accesului anterior.
- După migrare, fiecare drept poate fi retras separat fără să fie reacordat automat.

## Compatibilitate

- Nu este necesară o migrare de schemă SQL.
- Turele, programările, tichetele, formările și echipamentele existente nu sunt modificate.
- Superadmin și rolul HR Manager păstrează accesul complet.

## Verificări

- regresii de permisiuni și migrare unică;
- teste de acces pe rutele reale pentru ture și tichete;
- regresii HR și build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.
