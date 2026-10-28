# Prepare operator v1 — instalare controlată

Pachet privat, nu update ERP. Nu creează joburi și nu activează trial-uri.

## Ordine obligatorie, cu rezultate confirmate între pași

1. Transfer și SHA-256, apoi inventar read-only: schema 007, servicii sănătoase,
   operator activ și release curent operator-registration-v1. Dacă nu corespund,
   oprește-te; nu adapta manual căile sau scripturile.
2. Backup nou COPY_ONLY/CHECKSUM pentru baza platformei și RESTORE VERIFYONLY.
3. Aplică 008, verifică; aplică 009, verifică. Aceste migrări nu schimbă contul.
4. Numai după confirmarea separată a restartului platformei private, rulează
   install-demo-platform-prepare-compat.py cu --install-confirmed și
   --platform-restart-confirmed. Este repornit doar infraflow-demo-platform,
   NU ERP infraflow. Sesiunile operatorului sunt în memorie și vor fi închise.
5. Confirmă health și autentificare reală HTTPS cu operatorul existent înainte
   de schimbarea scope-ului. Nu se consumă TOTP în installer.
6. Rulează separat grant-demo-platform-prepare.py ca root, cu --grant-confirmed.
   Cere parola SA și confirmarea textuală ACORD trial:prepare. NU cere un secret
   TOTP nou și nu cere schimbarea parolei operatorului.
7. Reautentificare HTTPS cu același Authenticator și cod proaspăt; verifică login,
   consultare și logout. Procedura schimbă revizia, invalidează sesiunile vechi.

## Ce schimbă instalatorul runtime

Release nou operator-prepare-compat-v1 și drop-in 43-operator-prepare-compat.conf.
Doar operator-auth.js, operator-store.js și operator-sql-client.js vin din pachet.
Restul fișierelor UI/runtime sunt copiate din release-ul curent verificat; credentialele
și mediul rămân moștenite din drop-in-urile existente. Nu montează acțiunea prepare
în UI și nu adaugă identitate SQL pentru crearea jobului.

La verificări eșuate, elimină numai noul drop-in și repornește platforma pe release-ul
anterior, apoi verifică sănătatea. Nu șterge release-uri sau credentiale.
Rollback-ul acesta este sigur înainte de acordarea scope-ului. După acordarea
trial:prepare, runtime-ul vechi nu mai acceptă noul scope: nu reveni manual la el
și nu modifica manual revizia/envelope; este necesară verificare administrativă.

## Limitele validării locale

SQL-ul 008/009 și CAS/audit/TOTP au fost probate pe baze sintetice reale.
Instalatoarele Linux, systemd și interacțiunea completă CLI/SA/cheie sunt testate
local doar prin teste pure/simulate; rularea reală și acceptanța HTTPS rămân de făcut.
Niciun script nu se execută automat prin simpla extragere a arhivei.

Nu afișa planul criptat, cheia, parolele, envelope-ul sau stdout/stderr brut.
La rezultat neconfirmat păstrează resursele și trimite numai etapa/codul generic;
nu relua automat acordarea permisiunii.
