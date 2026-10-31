# Proceduri private SQL pentru directoare — migrările 019–021

## Domeniu

Nu creează directoare, conturi sau servicii și nu activează trialul. Nu modifică procedurile OS existente. Nu acordă drepturi SQL; accesul runtime se va pregăti separat, după verificare. Versiunea ERP rămâne 2.12.736.

### 019 — pregătirea încercării

`platform.prepare_tenant_directories`: numai `infraflow_demo_lease`, intrare JSON exactă cu 8 câmpuri. Cere un lease curent, intenție tenant_directories din aceeași generație/revizie și rezultat OS observed_created dintr-o generație anterioară a aceluiași job. UID/GID vin din rezultatul OS, nu din client.

Căile sunt verificate simultan cu rezervările, manifestul jobului și derivarea canonică din trial. Tokenul se păstrează numai ca hash. Încercarea și auditul se inserează atomic. Replay-ul identic și încă valid nu dublează auditul și nu prelungește termenul; alt token/ID sau rezultat deja existent cere verificare. Nu conferă autoritate OS.

### 020 — contextul doar în citire

View-ul privat `platform.directory_live_bindings` reunește lease-ul, intenția, rezultatul OS, rezervările și manifestul actual.

`platform.verify_tenant_directory_context`: numai viitorul `infraflow_demo_directory_executor`, token exact, fără rezultat terminal. Revalidează toate legăturile și cere minimum 15 secunde disponibile; bugetul returnat nu depășește 60 secunde. Răspunsul rămâne `executionAllowed:false`. Lock-urile se termină odată cu tranzacția; nu reprezintă atomicitate între SQL și sistemul de fișiere. Portul root trebuie să revalideze contextul înaintea fiecărei operații.

### 021 — rezultat și audit atomic

`platform.record_tenant_directory_result`: același executor dedicat, token legat de încercare, un singur rezultat. Pentru observed_created cere context încă live, digest SHA-256 al jurnalului și exact opt observații ordonate, cu proprietari/moduri conforme și perechi device/inode distincte. Device/inode sunt șiruri zecimale canonice uint64, nu numere JS. Refuză leading zeros, spații, overflow, câmpuri suplimentare și duplicate.

Rezultatul, cele opt observații și evenimentul de audit sunt în aceeași tranzacție. Pentru uncertain cere digest NULL și lista goală; permite consemnarea conservatoare după pierderea lease-ului/termenului, numai cu identitatea/tokenul corecte și fără rezultat anterior. Nu trimite automat un rezultat alternativ după un răspuns pierdut.

Nu închide jobul, nu schimbă generația/revizia și nu pornește cele 15 zile.

## Operare pe VPS

1. Verificare SHA și extragere nouă.
2. `preflight-demo-directory-commands.sql`: numai citire, snapshot post-OS exact: queued/revizie 7/generație 3, identitate 992/983 și toate tabelele directoarelor goale.
3. `backup-demo-platform-pre019021.sql`: COPY_ONLY/CHECKSUM/VERIFYONLY, fără restaurare automată. VERIFYONLY nu este test de restaurare efectivă.
4. Confirmare separată, apoi migrările 019, 020, 021 în această ordine.
5. `verify-demo-directory-commands.sql`: trei markeri, obiecte prezente, zero încercări/rezultate/observații, fără granturi și job neschimbat.

O eroare între migrări lasă operațiile deja confirmate în bază. Nu relua blocul, nu șterge obiecte și nu restaura backup-ul automat: verifică starea întâi.

## Probe locale

Pregătirea a trecut proba nativă în baza temporară INFRAFLOW_TEST_TRIALS_34AEA5E43572: lease nou, dovadă OS anterioară, JSON/rol/token/căi, rollback la audit, replay și refuz după release; cleanup confirmat. Nu s-au creat resurse OS sau loginuri SQL de server.

Probe pentru context/rezultate în curs de validare la redactarea inițială; rezultatele finale se adaugă numai după încheiere și cleanup. Aceste probe folosesc date sintetice, nu trialul VPS.
