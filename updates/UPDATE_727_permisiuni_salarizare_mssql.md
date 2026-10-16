# UPDATE 727 — Permisiuni granulare pentru salarizare și compatibilitate MSSQL

Versiune: **2.12.707**  
Data: **16 octombrie 2026**

## Modificări

- Consultarea statelor, surselor, fluturașilor și exporturilor salariale rămâne disponibilă cu `hr:salary_view`.
- Calculul și regenerarea statului, validarea, devalidarea, rectificarea și corecțiile cer `hr:salary_manage`.
- Ajustările, profilurile fiscale și bancare, notele contabile, plățile și obligațiile salariale cer același drept dedicat.
- Interfața Salarizare ascunde operațiile de modificare în modul de consultare.
- Rolurile existente care aveau simultan `hr:manage` și `hr:salary_view` primesc o singură dată `hr:salary_manage`, deoarece aveau deja acces efectiv la aceste operații înaintea separării.
- După migrare, administratorul poate retrage independent dreptul nou, fără ca aplicația să îl reacorde automat.
- Citirea angajaților pentru calculul salarial detectează atât coloana canonică `core.departments.name`, cât și varianta legacy `denumire`.

## Compatibilitate

- Nu se schimbă formulele salariale, statele existente sau documentele generate.
- Nu este necesară o migrare de schemă SQL.
- Rolurile cu acces exclusiv de consultare nu mai pot apela mutațiile salariale direct prin API.

## Verificări

- regresie HR completă;
- regresie contabilă completă, inclusiv calcul salarial MSSQL;
- regresii de permisiuni și migrare unică a rolurilor;
- test UI/API dedicat salarizării;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.
