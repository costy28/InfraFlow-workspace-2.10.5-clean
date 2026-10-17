# UPDATE 729 — Permisiuni dedicate pentru operațiunile HR

Versiune: **2.12.709**  
Data: **17 octombrie 2026**

## Modificări

- Șabloanele, încărcarea, reclasificarea, arhivarea și anularea documentelor HR cer `hr:documents_manage`.
- Pornirea, parcurgerea și închiderea fluxurilor de onboarding/offboarding cer `hr:workflow_manage`.
- Generarea, distribuirea și rezolvarea notificărilor sensibile de dosar cer `hr:notifications_manage`.
- Crearea, modificarea și ștergerea evaluărilor cer `hr:evaluations_manage` și acces personal sensibil.
- Transmiterea unui concediu medical verificat către salarizare cere `hr:salary_manage`, `hr:medical_view` și `hr:salary_view`.
- `hr:manage` nu mai este acceptat ca scurtătură pentru aceste operații, nici în API, nici în interfață.
- Rolurile existente cu `hr:manage` primesc o singură dată cele patru drepturi noi pentru continuitatea accesului.
- După migrare, fiecare drept poate fi retras separat fără să fie reacordat automat.

## Compatibilitate

- Nu este necesară o migrare de schemă SQL.
- Documentele, fluxurile, notificările și evaluările existente nu sunt modificate.
- Superadmin și rolul HR Manager păstrează accesul complet.

## Verificări

- regresii de permisiuni și migrare unică;
- regresii HR;
- teste de acces pe rutele reale pentru documente, fluxuri, notificări, evaluări și salarizare;
- verificarea politicii formularului de angajat;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.
