# Migrarea 015 — acceptare SQL de unică folosință

VPS a confirmat 014 prezentă, zero delegări/evenimente și job queued/5/2/gate 0.
Backup anterior verificat: INFRAFLOW_DEMO_PLATFORM_pre014_2BB9E14BE7094E009D2887C2509AAD10.bak.

015 adaugă două tabele și un RPC de acceptare. Nu acordă granturi și nu creează
login SQL sau utilizator Linux. Proc-ul refuză orice USER_NAME diferit de
infraflow_demo_os_executor, identitate care nu este instalată de această migrare.
Adaptorul review existent rămâne neprivilegiat și nu primește noul drept.

Intrarea exactă conține numai intentId și delegationToken, fără job/cale/UID/comandă.
SQL verifică hash-ul tokenului, intenția os_identity, revizia și generația curentă,
lease-ul încă activ, compania neactivată și numele canonic din rezervare/manifest.
Comparațiile folosesc BIN2 și lungime exactă, inclusiv pentru spațiile finale.
Termenul acceptării este cel mai mic dintre termenul delegării și cel al lease-ului.
Ora SQL este recitită după lock-uri. Acceptarea și auditul sunt în aceeași tranzacție.
O a doua acceptare este refuzată, chiar cu același token. Rezultatul incert cere
verificare administrativă, nu retry și nu ștergerea rândurilor.

Aceasta este numai acceptarea control-plane: executionAllowed=false rămâne.
Nu se invocă useradd. Jurnalul rezultatului și reconcilierea efectului OS sunt
următoarea etapă; nu declarăm implementată autorizarea executorului real.

Livrare: hash → preflight în citire → backup verificat → acord separat → migrare
→ verificare rânduri goale/job neschimbat. Fără restart ERP/platformă.

Validare locală: 164 teste Node trecute, audit advisory 620 fișiere fără constatări.
Proba SQL nativă INFRAFLOW_TEST_TRIALS_F714A9C50069: nouă grupuri trecute,
passed=true/cleanup=true. Verificări: altă identitate refuzată chiar dacă are EXECUTE
în fixture, token greșit refuzat, audit failure anulează acceptarea, o acceptare
reușită cu executionAllowed=false, replay refuzat și un singur rând/eveniment.
User-ii WITHOUT LOGIN și granturile de test există numai în baza temporară,
eliminată după probă; aceasta nu demonstrează încă autentificarea unui login VPS.
