# Migrare audit înregistrare — pregătire VPS

Fișiere separate, fără instalator ERP sau restart:

1. db/demo-platform-migrations/005_operator_queue_audit.sql
2. scripts/linux/restrict-demo-platform-registrar.sql

## Ordine de operare

1. Transfer și verificare SHA-256 pe VPS. Nu se aplică automat la transfer.
2. Confirmare explicită pentru baza INFRAFLOW_DEMO_PLATFORM; backup SQL distinct
   cu nume nou unic, CHECKSUM și RESTORE VERIFYONLY. Backup-ul conține material
   sensibil și nu se descarcă/publică în chat. Nu se face restore automat peste
   baza activă la o eroare de migrare.
3. Aplicarea numai a migrării 005, prin SA interactiv, cu sqlcmd -b -x. Migrarea
   este tranzacțională, refuză baza greșită, cere 004 și proprietari comuni ai
   schemelor; nu atinge granturi, conturi sau companii. Marker așteptat:
   OPERATOR_QUEUE_AUDIT_APPLIED (sau ALREADY_APPLIED, caz de verificat).
4. Verificare numai citire: stamp 005 și procedură/tabel existente, registru
   nemodificat. Oprire pentru diagnostic dacă markerul nu este confirmat.
5. Confirmare/aplicare separată a drepturilor registrarului. Loginul existent și
   SID-ul utilizatorului bazei trebuie să coincidă. Scriptul nu creează login și
   nu schimbă parole. GRANT EXEC exclusiv noii proceduri; DENY procedurii vechi,
   activării, DML/SELECT direct pe cele două scheme și procedurilor auth.
6. Verificarea scope-ului în tranzacția de grant, cu EXECUTE AS USER/REVERT; la
   eșec se revine asupra drepturilor prin ROLLBACK. Marker:
   REGISTRAR_OPERATOR_SCOPE_APPLIED.
7. Verificare ulterioară sub loginul SQL registrar real, fără apel de înregistrare,
   fără TOTP și fără drepturi SA în runtime. Aceasta rămâne o acceptanță distinctă
   de proba cu USER WITHOUT LOGIN din baza temporară locală.

## Stare

Migrarea și tranziția de granturi nu sunt aplicate încă pe VPS. Formularul de
înregistrare nu este montat și credentialul registrar nu este livrat serviciului.
Lista/operatorul activ rămân funcționale; nu este necesar restart pentru DDL/grant.

Hash migrare 005:
bd8f1a7c4d0bb69f0a650320874d4d749f3b3eeca79493c3c0052475e80e8b1c

Hash script drepturi:
2560f0c774bdf5e8d2e5cf8d4b9f46d8e6d796a92d5bb7667356c5bd5fbc716a

## Verificări locale încheiate

46/46 teste Node trecute. Proba SQL pe baza temporară nouă
INFRAFLOW_TEST_TRIALS_7854AD5327C7 a trecut toate cele șase grupuri, inclusiv
tranziția/reaplicarea granturilor și comanda auditată. Baza a fost eliminată
și absența ei confirmată (cleanup=true). Pentru proba granturilor s-a folosit
USER WITHOUT LOGIN și s-a omis exclusiv preflight-ul mapării la login de server
în copia din memorie; scriptul original pentru VPS păstrează acel preflight.
Audit expunere fișiere: 557 scanate, zero findings. Fără operațiuni pe VPS.
