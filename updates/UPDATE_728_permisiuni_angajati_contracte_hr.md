# UPDATE 728 — Administrare HR separată pentru angajați și contracte

Versiune: **2.12.708**  
Data: **16 octombrie 2026**

## Modificări

- Fișele, importul, asocierea conturilor, transferurile și fotografiile angajaților cer `hr:employees_manage`.
- Contractele de muncă și actele adiționale cer `hr:contracts_manage`.
- `hr:manage` nu mai este acceptat ca scurtătură pentru aceste două domenii, nici în API, nici în interfață.
- Datele personale, medicale și salariale continuă să fie protejate suplimentar prin drepturile dedicate.
- Rolurile existente cu `hr:manage` primesc o singură dată drepturile noi echivalente accesului anterior.
- După migrare, un administrator poate retrage separat oricare dintre drepturi fără ca aplicația să îl reacorde.

## Compatibilitate

- Nu este necesară o migrare de schemă SQL.
- Fluxurile și datele HR existente nu sunt modificate.
- Superadmin și rolul HR Manager păstrează accesul complet.

## Verificări

- regresii de permisiuni și migrare unică;
- regresii HR;
- teste de acces pe rutele reale pentru angajați și contracte;
- verificarea politicii formularului de angajat;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.
