# Schema de evidență SQL pentru directoare — în lucru local

Migrare nouă: `018_tenant_directory_evidence.sql`, în domeniul privat `db/demo-platform-migrations`. ERP nu își schimbă versiunea.

## Ce adaugă

- `directory_attempts`: referință la intenția de directoare și la rezultatul OS anterior, ID și hash per încercare, generație/revizie, UID/GID, rezervările de storage/config și termenul încercării.
- `directory_attempt_events`: eveniment de pregătire, cu actor SQL.
- `directory_results`: rezultat observat sau incert; succesul cere 8 confirmări și digestul jurnalului, incertitudinea nu pretinde confirmări sau digest final.
- `directory_observations`: ordinalele fixe 0–7, proprietari, permisiuni, device/inode. Nu acceptă o coloană de cale arbitrară introdusă de client. Politica modurilor separă părinții root 0711, configurația root:tenant 0750 și datele tenant 0700.
- `directory_result_events`: eveniment de rezultat, cu actor SQL.

Migrarea verifică baza și administratorul, cere migrarea 017, refuză un worker cu lease și o stare parțială, rulează tranzacțional și este reaplicabilă după marker. Nu acordă drepturi, nu creează loginuri/proceduri, nu modifică joburi, trialuri sau sistemul de fișiere.

## Limite importante

Acesta este numai suportul de stocare, nu protocolul complet de autorizare. Procedurile viitoare trebuie să verifice pasul tenant_directories, starea observată a rezultatului OS anterior, egalitatea job/trial/UID/GID, rezervările canonice, lease-ul curent și exact opt observații înainte de commit-ul atomic cu audit. Cheile străine și CHECK-urile nu înlocuiesc aceste verificări între tabele.

Nicio identitate runtime nu primește acces direct. Nu expunem un endpoint până la implementarea procedurilor și verificarea lor. Device/inode sunt uint64: pe viitor se vor transmite drept șiruri zecimale canonice în protocolul JS/JSON pentru a evita pierderea de precizie la numere >2^53.

## Verificări

193 teste Node au trecut, inclusiv cele două noi de structură și limite; audit fișiere 642, zero constatări. Probele SQL native au trecut în două baze temporare locale, ambele curățate: INFRAFLOW_TEST_TRIALS_1BFEAE2A0DE1 (10 grupuri), INFRAFLOW_TEST_TRIALS_52F8CE794BE5 (11 grupuri, inclusiv testul adăugat de audit).

Au fost verificate aplicarea/reaplicarea și refuzul bazei greșite, FK, stări rezultat incompatibile, moduri/proprietari/ordinale/inode invalide, duplicate și lipsa accesului direct runtime. Un test cu tranzacție explicită în fixture a confirmat anularea rezultatului când triggerul de audit eșuează. Acesta demonstrează comportamentul tranzacției de test, nu o procedură runtime încă neimplementată.

Nu s-au creat conturi OS sau loginuri SQL de server și nu s-a contactat VPS-ul.

## Arhivă pentru VPS

`InfraFlow-demo-directory-evidence-schema-v1.tar.gz`: migrarea 018, preflight exact post-OS, backup înainte de migrare, verificare după migrare și acest document. Numai cinci fișiere, fără parole, driver, servicii sau cod de creare directoare.

Ordine: SHA/extragere → preflight SQL → backup COPY_ONLY/CHECKSUM/VERIFYONLY → confirmare separată → migrare 018 → verificare tabele goale, fără granturi și job neschimbat queued/revizie 7/generație 3. VERIFYONLY nu constituie test de restaurare efectivă. Scripturile de operare fixate pe snapshot-ul real trebuie confirmate pe VPS; probele native au folosit date sintetice diferite.
